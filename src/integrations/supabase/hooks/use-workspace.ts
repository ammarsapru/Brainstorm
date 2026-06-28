import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import { SyncEngine } from '../sync-engine';
import { Session, IdeaCard, Connection, FileSystemItem, Collection, Stroke } from '@/types';
import { connectionFromDbRow } from '../../../utils/connectionDb';
import { buildFileSystemTree } from '../utils/tree-transformer';
import { INITIAL_CARDS, INITIAL_COLLECTIONS } from '@/constants';
import { loadChatHistory } from '../../../../services/chatService';
import { showToast } from '../../../../utils/toast';
import { migrateCard } from '../../../../utils/cardMigration';

interface UseWorkspaceResult {
    session: Session | null;
    isLoading: boolean;
    isSaving: boolean;
    saveStatus: 'idle' | 'working' | 'saving' | 'saved' | 'error';
    lastSaved: number;
    hasUnsavedChanges: boolean;
    error: string | null;
    saveWorkspace: (session: Session) => void;
    refreshWorkspace: () => Promise<Session | null>;
    deleteCard: (id: string) => void;
    deleteConnection: (id: string) => void;
    syncUpdateCard: (card: IdeaCard) => void;
    syncUpdateConnection: (conn: Connection) => void;
    syncStroke: (stroke: Stroke) => void;
    isHydrated: boolean;
}

export function useWorkspace(
    sessionId: string | null,
    initialSession?: Session | null
): UseWorkspaceResult {
    const [syncEngine] = useState(() => new SyncEngine());
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [syncState, setSyncState] = useState({
        isDirty: false,
        status: 'idle' as const,
        lastSaved: Date.now(),
        error: undefined as string | undefined
    });
    const [isHydrated, setIsHydrated] = useState(false);
    const hydratedForIdRef = useRef<string | null>(null);
    // Tracks when this client last completed a sync flush so realtime echoes can be ignored
    const lastLocalFlushRef = useRef(0);

    const hydrateFromSession = useCallback((data: Session) => {
        syncEngine.hydrate(data);
        setSession(data);
        setIsHydrated(true);
        hydratedForIdRef.current = data.id;
    }, [syncEngine]);

    // Hydrate sync engine from App-provided full session (no duplicate DB fetch)
    useEffect(() => {
        if (!sessionId || !initialSession?.isFullyLoaded || initialSession.id !== sessionId) {
            return;
        }
        if (hydratedForIdRef.current === sessionId) return;
        hydrateFromSession(initialSession);
    }, [sessionId, initialSession, hydrateFromSession]);

    const loadSessionFromDb = useCallback(async (): Promise<Session | null> => {
        if (!sessionId || !supabase) return null;

        setIsLoading(true);
        setIsHydrated(false);
        try {
            const { data: sessionData, error: sessionError } = await supabase
                .from('sessions')
                .select('*')
                .eq('id', sessionId)
                .maybeSingle();

            if (sessionError) throw sessionError;
            if (!sessionData) return null;

            const [
                { data: cardsData, error: cardsError },
                { data: connsData, error: connsError },
                { data: filesData, error: filesError },
                { data: collectionsData, error: collectionsError },
                { data: strokesData, error: strokesError },
                chatHistory,
            ] = await Promise.all([
                supabase.from('cards').select('*').eq('session_id', sessionId).limit(2000),
                supabase.from('connections').select('*').eq('session_id', sessionId).limit(2000),
                supabase.from('file_system_nodes').select('*').eq('session_id', sessionId).limit(2000),
                supabase.from('collections').select('*').eq('session_id', sessionId).limit(200),
                supabase.from('strokes').select('*').eq('session_id', sessionId).limit(10000),
                loadChatHistory(sessionId),
            ]);

            if (cardsError) throw cardsError;
            if (connsError) throw connsError;
            if (filesError) throw filesError;
            if (collectionsError) throw collectionsError;
            if (strokesError) throw strokesError;

            const cards: IdeaCard[] = (cardsData || []).map((c: Record<string, unknown>) => migrateCard({
                id: c.id as string,
                x: c.x as number,
                y: c.y as number,
                text: c.text as string,
                content: c.content as string | undefined,
                width: c.width as number,
                height: c.height as number,
                color: c.color as string,
                style: c.style as IdeaCard['style'],
                image: c.image as string | undefined,
                url: c.image as string | undefined,
                fileName: c.file_name as string | undefined,
                collectionId: c.collection_id as string | undefined,
                cardType: (c.card_type as IdeaCard['cardType']) ?? 'note',
                typeData: (c.type_data as Record<string, unknown>) ?? undefined,
                kind: (c.type_data as Record<string, unknown>)?.kind as IdeaCard['kind'] | undefined,
                fileSubtype: (c.type_data as Record<string, unknown>)?.fileSubtype as IdeaCard['fileSubtype'] | undefined,
                imageSubtype: (c.type_data as Record<string, unknown>)?.imageSubtype as IdeaCard['imageSubtype'] | undefined,
                shape: (c.type_data as Record<string, unknown>)?.shape as IdeaCard['shape'] | undefined,
            } as IdeaCard));

            const connections: Connection[] = (connsData || []).map(c =>
                connectionFromDbRow(c as Record<string, unknown>)
            );

            const collections: Collection[] =
                collectionsData && collectionsData.length > 0
                    ? collectionsData.map((c: { id: string; name: string }) => ({
                          id: c.id,
                          name: c.name,
                      }))
                    : INITIAL_COLLECTIONS;

            const strokes: Stroke[] = (strokesData || []).map((row: Record<string, unknown>) => ({
                id: row.id as string,
                tool: (row.tool as Stroke['tool']) ?? 'pen',
                color: (row.color as string) ?? '#ffffff',
                radius: (row.radius as number) ?? 3,
                points: (row.points as Stroke['points']) ?? [],
            }));

            const newSession: Session = {
                id: sessionData.id,
                user_id: sessionData.user_id,
                name: sessionData.name,
                viewport_x: sessionData.viewport_x,
                viewport_y: sessionData.viewport_y,
                viewport_zoom: sessionData.viewport_zoom,
                cards: cards.length > 0 ? cards : INITIAL_CARDS,
                connections,
                fileSystem: buildFileSystemTree(filesData || []),
                collections,
                chatHistory,
                strokes,
                lastModified: new Date(sessionData.last_modified).getTime(),
                isFullyLoaded: true,
            };

            hydrateFromSession(newSession);
            return newSession;
        } catch (e: unknown) {
            setIsHydrated(false);
            const message = e instanceof Error ? e.message : 'Failed to load session';
            console.error('Failed to load session:', e);
            setSyncState(s => ({ ...s, error: message }));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, hydrateFromSession]);

    useEffect(() => {
        return syncEngine.subscribe((state) => {
            if (state.status === 'saved') lastLocalFlushRef.current = Date.now();
            setSyncState({
                isDirty: state.isDirty,
                status: state.status as typeof syncState.status,
                lastSaved: state.lastSaved,
                error: state.error,
            });
        });
    }, [syncEngine]);

    const saveWorkspace = useCallback(
        (updatedSession: Session) => {
            if (!sessionId || !syncEngine.isHydrated()) return;

            syncEngine.queueSessionUpdate(updatedSession);
            syncEngine.queueFileSystemUpdate(updatedSession.fileSystem);

            if (updatedSession.collections) {
                updatedSession.collections.forEach(c => syncEngine.queueCollectionUpdate(c));
            }

            updatedSession.cards.forEach(c => syncEngine.queueCardUpdate(c));
            updatedSession.connections.forEach(c => syncEngine.queueConnectionUpdate(c));
        },
        [sessionId, syncEngine]
    );

    useEffect(() => {
        if (!sessionId || !supabase) return;

        let shownRemoteToast = false;
        const notifyRemoteChange = (table: string) => {
            // Ignore echoes from our own writes (sync engine flushes within ~300ms, add 2s buffer)
            const isOwnWrite = Date.now() - lastLocalFlushRef.current < 2500;
            if (isOwnWrite || shownRemoteToast) return;
            shownRemoteToast = true;
            showToast(`Canvas updated from another device (${table}). Refresh to see the latest changes.`, 'info', 8000);
        };

        const channel = supabase
            .channel(`session-live-${sessionId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
                payload => {
                    const remoteTime = new Date((payload.new as { last_modified: string }).last_modified).getTime();
                    const localTime = session?.lastModified || 0;
                    if (remoteTime > localTime + 2000) notifyRemoteChange('session metadata');
                }
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `session_id=eq.${sessionId}` },
                () => notifyRemoteChange('cards')
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `session_id=eq.${sessionId}` },
                () => notifyRemoteChange('connections')
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [sessionId, session?.lastModified]);

    return {
        session,
        isLoading,
        isSaving:
            syncState.status !== 'idle' &&
            syncState.status !== 'saved' &&
            syncState.status !== 'error',
        saveStatus: syncState.status,
        lastSaved: syncState.lastSaved,
        hasUnsavedChanges: syncState.isDirty,
        error: syncState.error || null,
        saveWorkspace,
        refreshWorkspace: loadSessionFromDb,
        deleteCard: (id: string) => syncEngine.queueCardDeletion(id),
        deleteConnection: (id: string) => syncEngine.queueConnectionDeletion(id),
        syncUpdateCard: (card: IdeaCard) => syncEngine.queueCardUpdate(card),
        syncUpdateConnection: (conn: Connection) => syncEngine.queueConnectionUpdate(conn),
        syncStroke: (stroke: Stroke) => syncEngine.queueStrokeUpdate(stroke),
        isHydrated,
    };
}
