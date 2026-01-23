
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../client';
import { syncEngine } from '../sync-engine';
import { Session, IdeaCard, Connection, FileSystemItem, ArrowType } from '@/types';
import { buildFileSystemTree } from '../utils/tree-transformer';
import { INITIAL_CARDS } from '@/constants';

interface UseWorkspaceResult {
    session: Session | null;
    isLoading: boolean;
    isSaving: boolean;
    saveStatus: 'idle' | 'working' | 'saving' | 'saved' | 'error';
    lastSaved: number;
    hasUnsavedChanges: boolean;
    error: string | null;
    saveWorkspace: (session: Session) => void;
    refreshWorkspace: () => void;
}

export function useWorkspace(sessionId: string | null): UseWorkspaceResult {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [syncState, setSyncState] = useState({
        isDirty: false,
        status: 'idle' as const,
        lastSaved: Date.now(),
        error: undefined as string | undefined
    });

    // 1. Initial Load
    const loadSession = useCallback(async () => {
        if (!sessionId || !supabase) return;

        setIsLoading(true);
        try {
            // Fetch Session
            const { data: sessionData, error: sessionError } = await supabase
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .maybeSingle();

            if (sessionError) throw sessionError;

            // Fetch Cards
            const { data: cardsData, error: cardsError } = await supabase
                .from('cards')
                .select('*')
                .eq('session_id', sessionId);

            if (cardsError) throw cardsError;

            // Fetch Connections
            const { data: connsData, error: connsError } = await supabase
                .from('connections')
                .select('*')
                .eq('session_id', sessionId);

            if (connsError) throw connsError;

            // Fetch File System
            const { data: filesData, error: filesError } = await supabase
                .from('file_system_nodes')
                .select('*')
                .eq('session_id', sessionId);

            if (filesError) throw filesError;

            // Map DB types to App Types
            const cards: IdeaCard[] = cardsData.map((c: any) => ({
                id: c.id,
                x: c.x,
                y: c.y,
                text: c.text,
                content: c.content,
                width: c.width,
                height: c.height,
                color: c.color,
                style: c.style,
                image: c.image,
                fileName: c.file_name,
                collectionId: c.collectionId
            }));

            const connections: Connection[] = connsData.map((c: any) => ({
                id: c.id,
                fromId: c.from_id,
                toId: c.to_id,
                style: c.style,
                relationType: c.relation_type,
                arrowStart: ArrowType.NONE, // Default or map if stored
                arrowEnd: ArrowType.STANDARD
            }));

            const fileSystem = buildFileSystemTree(filesData);

            setSession({
                id: sessionData.id,
                user_id: sessionData.user_id,
                name: sessionData.name,
                viewport_x: sessionData.viewport_x,
                viewport_y: sessionData.viewport_y,
                viewport_zoom: sessionData.viewport_zoom,
                cards: cards.length > 0 ? cards : INITIAL_CARDS,
                connections,
                fileSystem,
                chatHistory: [], // Load chat if needed
                lastModified: sessionData.last_modified
            });

        } catch (e: any) {
            console.error('Failed to load session:', e);
            setSyncState(s => ({ ...s, error: e.message }));
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        if (sessionId) loadSession();
    }, [sessionId, loadSession]);

    // 2. Subscribe to SyncEngine
    useEffect(() => {
        return syncEngine.subscribe((state) => {
            setSyncState({
                isDirty: state.isDirty,
                status: state.status as any,
                lastSaved: state.lastSaved,
                error: state.error
            });
        });
    }, []);

    // 3. Save Function (Proxy to SyncEngine)
    const saveWorkspace = useCallback((updatedSession: Session) => {
        if (!sessionId) return;

        // We diff here or just queue everything. 
        // For simplicity/robustness match SyncEngine's expectation.
        // Ideally Workspace tracks granular changes (queueCardUpdate), 
        // but if Workspace passes full object, we queue session data + files.
        // Cards/Connections are usually granular in Workspace, but if `saveWorkspace` 
        // is the only entry point, we might need to diff or queue all.

        // However, `Workspace.tsx` calls `onSave` with the whole session.
        // We will queue the Session (viewport) and Files (structure).
        // For cards/connections, since we don't have diffs here easily without state,
        // we might rely on the fact that `Workspace` manipulates state.

        // BETTER APPROACH: 
        // We will modify `Workspace.tsx` to use granular updates. 
        // But if we MUST use `saveWorkspace` (the prop), we can queue all cards for upsert.
        // It's not efficient but it satisfies "Batch Upsert".
        // We will queue all cards in the session as "dirty" if `saveWorkspace` is called.
        // `SyncEngine` handles the batching.

        syncEngine.queueSessionUpdate(updatedSession);
        syncEngine.queueFileSystemUpdate(updatedSession.fileSystem);

        if (updatedSession.collections) {
            updatedSession.collections.forEach(c => syncEngine.queueCollectionUpdate(c));
        }

        updatedSession.cards.forEach(c => syncEngine.queueCardUpdate(c));
        updatedSession.connections.forEach(c => syncEngine.queueConnectionUpdate(c));

    }, [sessionId]);

    // 4. Realtime Subscription
    useEffect(() => {
        if (!sessionId || !supabase) return;

        const channel = supabase.channel(`session-${sessionId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
                (payload) => {
                    const remoteTime = new Date(payload.new.last_modified).getTime();
                    const localTime = session?.lastModified || 0;
                    // 2s buffer for clock skew
                    if (remoteTime > localTime + 2000) {
                        // Prompt user or auto-refresh?
                        // For now, we will just set a flag implicitly or log
                        console.log('Remote update detected, refresh advised');
                        // We could expose a `remoteUpdateAvailable` state
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [sessionId, session?.lastModified]);

    return {
        session,
        isLoading,
        isSaving: syncState.status !== 'idle' && syncState.status !== 'saved' && syncState.status !== 'error', // derived
        saveStatus: syncState.status,
        lastSaved: syncState.lastSaved,
        hasUnsavedChanges: syncState.isDirty,
        error: syncState.error || null,
        saveWorkspace,
        refreshWorkspace: loadSession
    };
}
