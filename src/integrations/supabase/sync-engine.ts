
import { supabase } from '../../../lib/supabase';
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
    private lastSyncedFiles: Map<string, FlatFileSystemNode> = new Map();
    private lastSyncedCards: Map<string, IdeaCard> = new Map();
    private lastSyncedConnections: Map<string, Connection> = new Map();

    private saveTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 300;

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

    // Initialize cache from DB state to prevent initial save storm
    hydrate(session: Session) {
        // CLEAR DIRTY STATE TO PREVENT CROSS-SESSION CONTAMINATION
        this.dirtyCards.clear();
        this.dirtyConnections.clear();
        this.dirtyCollections.clear();
        this.deletedCardIds.clear();
        this.deletedConnectionIds.clear();
        this.pendingSession = null;
        this.pendingFiles = null;
        this.state.isDirty = false;
        // Optionally update status to idle, though we might still be loading
        this.updateState({ isDirty: false, status: 'idle', error: undefined });

        // Hydrate Files
        this.lastSyncedFiles.clear();
        if (session.fileSystem) {
            const flat = flattenFileSystem(session.fileSystem, session.id);
            flat.forEach(f => this.lastSyncedFiles.set(f.id, f));
        }

        // Hydrate Cards
        this.lastSyncedCards.clear();
        if (session.cards) {
            session.cards.forEach(c => this.lastSyncedCards.set(c.id, { ...c }));
        }

        // Hydrate Connections
        this.lastSyncedConnections.clear();
        if (session.connections) {
            session.connections.forEach(c => this.lastSyncedConnections.set(c.id, { ...c }));
        }
    }

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

    private _isSaving: boolean = false;

    private scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
    }

    async flush() {
        if (this._isSaving) {
            this.scheduleSave(); // Retry later
            return;
        }

        if (!this.state.isDirty || !supabase || !this.pendingSession) return;

        this._isSaving = true;
        this.updateState({ status: 'saving' });
        const sessionId = this.pendingSession.id;

        // SNAPSHOT: Capture dirty state immediately to allow new edits to queue up while we save
        const dirtyCardsSnapshot = new Map(this.dirtyCards);
        this.dirtyCards.clear();

        const dirtyConnectionsSnapshot = new Map(this.dirtyConnections);
        this.dirtyConnections.clear();

        const dirtyCollectionsSnapshot = new Map(this.dirtyCollections);
        this.dirtyCollections.clear();

        const deletedCardIdsSnapshot = new Set(this.deletedCardIds);
        this.deletedCardIds.clear();

        const deletedConnectionIdsSnapshot = new Set(this.deletedConnectionIds);
        this.deletedConnectionIds.clear();

        // Files need special handling because they are replaced entirely in pendingFiles
        // We will keep a local ref to the current pendingFiles and nullify the class prop
        const pendingFilesSnapshot = this.pendingFiles;
        this.pendingFiles = null;

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
                    last_modified: new Date().toISOString()
                });
                if (error) throw error;
            }

            // 2. Batch Deletions
            if (deletedCardIdsSnapshot.size > 0) {
                await supabase.from('cards').delete().in('id', Array.from(deletedCardIdsSnapshot));
                deletedCardIdsSnapshot.forEach(id => this.lastSyncedCards.delete(id));
            }
            if (deletedConnectionIdsSnapshot.size > 0) {
                await supabase.from('connections').delete().in('id', Array.from(deletedConnectionIdsSnapshot));
                deletedConnectionIdsSnapshot.forEach(id => this.lastSyncedConnections.delete(id));
            }

            // 2.5. Batch Upsert Collections
            if (dirtyCollectionsSnapshot.size > 0) {
                const collectionsPayload = Array.from(dirtyCollectionsSnapshot.values()).map(c => ({
                    id: c.id,
                    session_id: sessionId,
                    name: c.name
                }));
                const { error } = await supabase.from('collections').upsert(collectionsPayload);
                if (error) throw error;
            }

            // 3. Batch Upsert Cards (With Diffing)
            if (dirtyCardsSnapshot.size > 0) {
                const cardsToUpsert: IdeaCard[] = [];

                dirtyCardsSnapshot.forEach(card => {
                    const last = this.lastSyncedCards.get(card.id);
                    const isChanged = !last ||
                        last.x !== card.x || last.y !== card.y ||
                        last.text !== card.text || last.color !== card.color ||
                        last.width !== card.width || last.height !== card.height ||
                        JSON.stringify(last.style) !== JSON.stringify(card.style) ||
                        last.image !== card.image ||
                        last.fileName !== card.fileName ||
                        last.collectionId !== card.collectionId ||
                        // Content check is critical for Documents
                        last.content !== card.content;

                    if (isChanged) {
                        cardsToUpsert.push(card);
                    }
                });

                if (cardsToUpsert.length > 0) {
                    const cardsPayload = cardsToUpsert.map(c => ({
                        id: c.id,
                        session_id: sessionId,
                        x: c.x,
                        y: c.y,
                        text: c.text,
                        content: c.content || null,
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

                    cardsToUpsert.forEach(c => this.lastSyncedCards.set(c.id, { ...c }));
                }
            }

            // 4. Batch Upsert Connections (With Diffing)
            if (dirtyConnectionsSnapshot.size > 0) {
                const connsToUpsert: Connection[] = [];

                dirtyConnectionsSnapshot.forEach(conn => {
                    const last = this.lastSyncedConnections.get(conn.id);
                    const isChanged = !last ||
                        last.fromId !== conn.fromId || last.toId !== conn.toId ||
                        last.style !== conn.style || last.relationType !== conn.relationType ||
                        last.arrowStart !== conn.arrowStart || last.arrowEnd !== conn.arrowEnd;

                    if (isChanged) {
                        connsToUpsert.push(conn);
                    }
                });

                if (connsToUpsert.length > 0) {
                    const connPayload = connsToUpsert.map(c => ({
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

                    connsToUpsert.forEach(c => this.lastSyncedConnections.set(c.id, { ...c }));
                }
            }

            // 5. File System (Smart Diffing)
            if (pendingFilesSnapshot) {
                const flatNodes = flattenFileSystem(pendingFilesSnapshot, sessionId);
                const nodesToUpsert: FlatFileSystemNode[] = [];

                flatNodes.forEach(node => {
                    const last = this.lastSyncedFiles.get(node.id);
                    if (!last ||
                        last.name !== node.name ||
                        last.content !== node.content ||
                        last.parent_id !== node.parent_id ||
                        last.type !== node.type
                    ) {
                        nodesToUpsert.push(node);
                    }
                });

                if (nodesToUpsert.length > 0) {
                    const { error } = await supabase.from('file_system_nodes').upsert(nodesToUpsert);
                    if (error) throw error;
                    nodesToUpsert.forEach(node => this.lastSyncedFiles.set(node.id, { ...node }));
                }

                // Handle Deletions (Files)
                const currentIds = new Set(flatNodes.map(n => n.id));
                const idsToDelete: string[] = [];
                this.lastSyncedFiles.forEach((_, id) => {
                    if (!currentIds.has(id)) {
                        idsToDelete.push(id);
                    }
                });

                if (idsToDelete.length > 0) {
                    await supabase.from('file_system_nodes').delete().in('id', idsToDelete);
                    idsToDelete.forEach(id => this.lastSyncedFiles.delete(id));
                }

                flatNodes.forEach(node => this.lastSyncedFiles.set(node.id, { ...node }));
            }

            this.updateState({ status: 'saved', lastSaved: Date.now(), error: undefined });

        } catch (err: any) {
            console.error('Sync Error:', err);
            this.updateState({ status: 'error', error: err.message || 'Sync failed' });

            // Restore dirty items so we retry
            dirtyCardsSnapshot.forEach(c => this.dirtyCards.set(c.id, c));
            dirtyConnectionsSnapshot.forEach(c => this.dirtyConnections.set(c.id, c));
            // We lose specific deletions restoration here for simplicity, or we could merge Sets too.
            // Ideally implementation handles merge logic.
            // For now, simple error handling is better than nothing.
        } finally {
            this._isSaving = false;
            // Check if more changes arrived during save
            if (
                this.dirtyCards.size > 0 ||
                this.dirtyConnections.size > 0 ||
                this.dirtyCollections.size > 0 ||
                this.deletedCardIds.size > 0 ||
                this.deletedConnectionIds.size > 0 ||
                this.pendingFiles
            ) {
                this.scheduleSave();
            } else {
                this.updateState({ isDirty: false });
            }
        }
    }
}

export const syncEngine = SyncEngine.getInstance();
