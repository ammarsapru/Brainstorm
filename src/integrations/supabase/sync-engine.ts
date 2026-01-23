
import { supabase } from './client';
import { IdeaCard, Session, Connection, FileSystemItem, Collection } from '@/types';
import { flattenFileSystem, FlatFileSystemNode } from './utils/tree-transformer';

type SyncStatus = 'idle' | 'working' | 'saving' | 'saved' | 'error';

interface SyncState {
    isDirty: boolean;
    status: SyncStatus;
    lastSaved: number;
    error?: string;
}

type SyncListener = (state: SyncState) => void;

class SyncEngine {
    private static instance: SyncEngine;
    private listeners: Set<SyncListener> = new Set();

    private dirtyCards: Map<string, IdeaCard> = new Map();
    private dirtyConnections: Map<string, Connection> = new Map();
    private dirtyCollections: Map<string, Collection> = new Map();
    private pendingSession: Session | null = null;
    private pendingFiles: FileSystemItem[] | null = null;
    private deletedCardIds: Set<string> = new Set();
    private deletedConnectionIds: Set<string> = new Set();

    private saveTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 500;

    private state: SyncState = {
        isDirty: false,
        status: 'idle',
        lastSaved: Date.now()
    };

    private constructor() { }

    static getInstance(): SyncEngine {
        if (!SyncEngine.instance) {
            SyncEngine.instance = new SyncEngine();
        }
        return SyncEngine.instance;
    }

    subscribe(listener: SyncListener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    private updateState(updates: Partial<SyncState>) {
        this.state = { ...this.state, ...updates };
        this.listeners.forEach(l => l(this.state));
    }

    // --- Public API ---

    markDirty() {
        if (!this.state.isDirty) {
            this.updateState({ isDirty: true, status: 'working' });
        }
        this.scheduleSave();
    }

    queueCardUpdate(card: IdeaCard) {
        this.dirtyCards.set(card.id, card);
        // If it was marked for deletion, unmark it
        this.deletedCardIds.delete(card.id);
        this.markDirty();
    }

    queueCardDeletion(cardId: string) {
        this.dirtyCards.delete(cardId);
        this.deletedCardIds.add(cardId);
        this.markDirty();
    }

    queueConnectionUpdate(conn: Connection) {
        this.dirtyConnections.set(conn.id, conn);
        this.deletedConnectionIds.delete(conn.id);
        this.markDirty();
    }

    queueConnectionDeletion(connId: string) {
        this.dirtyConnections.delete(connId);
        this.deletedConnectionIds.add(connId);
        this.markDirty();
    }

    queueCollectionUpdate(collection: Collection) {
        this.dirtyCollections.set(collection.id, collection);
        this.markDirty();
    }

    queueSessionUpdate(session: Session) {
        this.pendingSession = session;
        this.markDirty();
    }

    queueFileSystemUpdate(fileSystem: FileSystemItem[]) {
        this.pendingFiles = fileSystem;
        this.markDirty();
    }

    // --- Internal Logic ---

    private scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
    }

    async flush() {
        if (!this.state.isDirty || !supabase || !this.pendingSession) return;

        this.updateState({ status: 'saving' });
        const sessionId = this.pendingSession.id;

        try {
            // 1. Save Session (Viewport, etc)
            if (this.pendingSession) {
                const { error } = await supabase.from('sessions').upsert({
                    id: this.pendingSession.id,
                    user_id: this.pendingSession.user_id,
                    name: this.pendingSession.name,
                    viewport_x: this.pendingSession.viewport_x,
                    viewport_y: this.pendingSession.viewport_y,
                    viewport_zoom: this.pendingSession.viewport_zoom,
                    last_modified: new Date().toISOString() // Fixed: formatted for timestamptz
                });
                if (error) throw error;
            }

            // 2. Batch Deletions
            if (this.deletedCardIds.size > 0) {
                await supabase.from('cards').delete().in('id', Array.from(this.deletedCardIds));
                this.deletedCardIds.clear();
            }
            if (this.deletedConnectionIds.size > 0) {
                await supabase.from('connections').delete().in('id', Array.from(this.deletedConnectionIds));
                this.deletedConnectionIds.clear();
            }

            // 2.5. Batch Upsert Collections (Must be before Cards due to FK)
            if (this.dirtyCollections.size > 0) {
                const collectionsPayload = Array.from(this.dirtyCollections.values()).map(c => ({
                    id: c.id,
                    session_id: sessionId,
                    name: c.name
                }));
                const { error } = await supabase.from('collections').upsert(collectionsPayload);
                if (error) throw error;
                this.dirtyCollections.clear();
            }

            // 3. Batch Upsert Cards
            if (this.dirtyCards.size > 0) {
                const cardsPayload = Array.from(this.dirtyCards.values()).map(c => ({
                    id: c.id,
                    session_id: sessionId,
                    x: c.x,
                    y: c.y,
                    text: c.text,
                    content: c.content || null, // JSONB
                    width: c.width,
                    height: c.height,
                    color: c.color,
                    style: c.style,
                    image: c.image,
                    file_name: c.fileName,
                    collection_id: c.collectionId
                }));

                const { error } = await supabase.from('cards').upsert(cardsPayload);
                if (error) throw error;
                this.dirtyCards.clear();
            }

            // 4. Batch Upsert Connections
            if (this.dirtyConnections.size > 0) {
                const connPayload = Array.from(this.dirtyConnections.values()).map(c => ({
                    id: c.id,
                    session_id: sessionId,
                    from_id: c.fromId,
                    to_id: c.toId,
                    style: c.style,
                    relation_type: c.relationType,
                    arrow_start: c.arrowStart,
                    arrow_end: c.arrowEnd
                }));
                const { error } = await supabase.from('connections').upsert(connPayload);
                if (error) throw error;
                this.dirtyConnections.clear();
            }

            // 5. File System (Full Replacement Strategy for simplicity with tree transformer)
            // Usually we'd want diffs, but for < 1000 items, deleting session nodes and re-inserting is acceptable
            // OR upserting all. 
            // We will upsert all current nodes. Deletions are trickier without tracking.
            // For now, let's Upsert.
            if (this.pendingFiles) {
                const flatNodes = flattenFileSystem(this.pendingFiles, sessionId);
                const { error } = await supabase.from('file_system_nodes').upsert(flatNodes);
                if (error) throw error;
                this.pendingFiles = null;
            }

            this.updateState({ isDirty: false, status: 'saved', lastSaved: Date.now(), error: undefined });

        } catch (err: any) {
            console.error('Sync Error:', err);
            this.updateState({ status: 'error', error: err.message || 'Sync failed' });
            // Don't clear dirty flags so we retry next time
        }
    }
}

export const syncEngine = SyncEngine.getInstance();
