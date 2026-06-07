import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CardNode } from './CardNode';
import { ConnectionLayer } from './ConnectionLayer';
import { Sidebar } from './Controls';
import { Header } from './Header';
import { DocumentEditor } from './DocumentEditor';
import { HelpGuide } from './HelpGuide';
import { AIChat } from './AIChat';
import { APIKeyModal } from './APIKeyModal';

import { CreationModal } from './CreationModal';
import { CollectionSelectorModal } from './CollectionSelectorModal';
import { FolderSelectorModal } from './FolderSelectorModal';
import { DrawingLayer } from './DrawingLayer';
import { IdeaCard, Connection, Viewport, ToolMode, Point, ConnectionStyle, ArrowType, FileSystemItem, Session, RelationType, ChatMessage, ChatAttachment, Collection, UserProfile, Stroke, DrawingTool } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_END, DEFAULT_ARROW_START, DEFAULT_RELATION_TYPE, CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID, INITIAL_COLLECTIONS } from '../constants';
import { generateRelatedIdeas, getChatResponse, summarizeChatHandoff } from '../services/aiService';
import { filterHistoryForModel, getOutgoingThread, countThreadMessages } from '../utils/chatModelThread';
import { generateMasterPDF } from '../services/pdfService';
import { saveChatMessage } from '../services/chatService';
import { useApiKeys } from '../hooks/useApiKeys';
import {
  loadSelectedModelId,
  saveSelectedModelId,
  getProviderForModel,
  getModelById,
} from '../utils/llmModels';
import { Minus, Plus, RefreshCcw, Save, Cloud, CheckCircle, AlertCircle, X, MousePointerClick } from 'lucide-react';
import { useWorkspace } from '../src/integrations/supabase/hooks/use-workspace';
import { supabase, uploadFileToS3 } from '../lib/supabase';
import { embeddingService } from '../services/embeddingService';
import debugLog from '../utils/debugLog';

const generateId = () => crypto.randomUUID();

const FullScreenImageOverlay = ({ src, onClose }: { src: string, onClose: () => void }) => {//takes parameters src and onclose, src as a string and onlcose as a empty arrow function returning void
  const [scale, setScale] = useState(1);//set the scale of the image to 1, useState variables trigger a re render when updated, useref does not upadte
  const containerRef = useRef<HTMLDivElement>(null);//set the container ref to a div element, can reference a specific DOM element for direct manipulation
  //null repersents the intentional absence of a object, as when the component first runs the dom element hasnt been created yet, so it creates a ref to it

  useEffect(() => {//use effect is a hook that runs after the component renders, it takes a callback function and a dependency array, can also be used to synchronize a component with a external system primarily used to handle side effects happening outside the standard rendering process
    const el = containerRef.current;//set the container ref to a div element
    if (!el) return;//if the container ref is null, return
    const handleWheel = (e: WheelEvent) => {//set the handlewheel function to a empty arrow function taking a wheel event as a parameter
      e.stopPropagation();//stop the event from bubbling up , this prevents the event from triggering any parent components event listeners
      e.preventDefault();//prevent the default behavior of the event, this prevents the event from triggering any parent components event listeners
      setScale(s => Math.min(Math.max(0.1, s - e.deltaY * 0.003), 20));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);//function handles the event listener for the wheel event when scrolling into and out of a image, handlewheel listens for any device that simulates a scroll action like the scroll bar on mouse or zooming in and out from a touchpad using two finger gestures

  return (//returns the UI for a image when openned
    <div
      ref={containerRef}//references the container ref element
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 animate-in fade-in duration-200"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <img
        src={src}
        alt="Full screen view"//alt text for image
        className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl rounded"//sets the width and height of a image
        style={{ transform: `scale(${scale})`, transition: 'transform 0.05s linear' }}//sets the scale of the image as well as the transition
        onClick={(e) => e.stopPropagation()}//stops the event from bubbling up , this prevents the event from triggering any parent components event listeners
      />
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}//stops the event from bubbling up , this prevents the event from triggering any parent components event listeners, this is the X button that closes the image.
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/80 px-4 py-2 rounded-full text-sm backdrop-blur pointer-events-none">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
};

import { usePdfBlobUrl } from './CardNode';

const FullScreenPdfOverlay = ({ src, title, onClose }: { src: string, title?: string, onClose: () => void }) => {//handles pdf overlay
  const pdfBlobUrl = usePdfBlobUrl(src);//object handling pdf file.
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col p-8 animate-in fade-in duration-200" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center text-white mb-4 shrink-0 px-4 w-full max-w-6xl mx-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-medium truncate pr-4">{title || 'PDF Document'}</h2>
        <button
          className="text-white/70 hover:text-white p-2 bg-black/50 hover:bg-black/80 rounded-full transition-colors shrink-0"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 w-full max-w-6xl mx-auto bg-white rounded-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <embed src={pdfBlobUrl || src} type="application/pdf" className="w-full h-full border-none bg-white" title="PDF Viewer" />
      </div>
    </div>
  );
};

interface WorkspaceProps {
  session: Session;
  onSave: (session: Session) => void;
  onBack: () => void;
  onGoHome: () => void;
  user?: UserProfile;
  onLogin: () => void;
  onLogout: () => void;
  onSwitchAccount: () => void;
  onGoShards?: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ session, onSave, onBack, onGoHome, user, onLogin, onLogout, onSwitchAccount, onGoShards }) => {
  // --- State Initialized from Session ---
  const [sessionName, setSessionName] = useState(session.name);
  const [cards, setCards] = useState<IdeaCard[]>(session.cards);
  const [connections, setConnections] = useState<Connection[]>(session.connections);
  const [fileSystem, setFileSystem] = useState<FileSystemItem[]>(session.fileSystem);
  const [collections, setCollections] = useState<Collection[]>(session.collections || INITIAL_COLLECTIONS);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(session.chatHistory || []);
  const [strokes, setStrokes] = useState<Stroke[]>(session.strokes || []);
  const syncedSessionIdRef = useRef<string | null>(null);
  const [sessionReady, setSessionReady] = useState(!!session.isFullyLoaded);

  const [newCardId, setNewCardId] = useState<string | null>(null);

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pen');
  const [strokeColor, setStrokeColor] = useState('#ef4444');
  const [strokeRadius, setStrokeRadius] = useState(3);

  // Performance Optimization: Refs for state access in event handlers without triggering re-renders of callbacks
  const cardsRef = useRef(cards);
  const connectionsRef = useRef(connections);
  const cardsEmbeddingSignatureRef = useRef('');

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    const semanticSignature = cards
      .map(card => `${card.id}|${card.text}|${card.color}|${card.content || ''}`)
      .join('\n');

    if (cardsEmbeddingSignatureRef.current === semanticSignature) return;

    cardsEmbeddingSignatureRef.current = semanticSignature;
    // Defer embedding model load until browser is idle (keeps initial workspace paint fast).
    const runSync = () => embeddingService.syncCards(cards).catch(console.error);
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(runSync, { timeout: 8000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(runSync, 2000);
    return () => clearTimeout(t);
  }, [cards]);

  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  // Ensure we have at least one collection and cards are assigned
  useEffect(() => {
    let updatedCols = [...collections];
    let updatedCards = [...cards];
    let changed = false;

    // 1. Ensure default collection exists
    if (updatedCols.length === 0) {
      updatedCols = [...INITIAL_COLLECTIONS];
      changed = true;
    }

    // 2. Assign orphan cards to default collection
    updatedCards = updatedCards.map(c => {
      if (!c.collectionId) {
        changed = true;
        return { ...c, collectionId: updatedCols[0].id };
      }
      return c;
    });

    if (changed) {
      setCollections(updatedCols);
      setCards(updatedCards);
    }
  }, []);

  // Update local sessionName if prop changes
  useEffect(() => {
    setSessionName(session.name);
  }, [session.name]);

  // Standard UI State
  const [viewport, setViewport] = useState<Viewport>({ x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 });

  // Ref needs to be defined AFTER the state variable is defined
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  const [mode, setMode] = useState<ToolMode>('select');
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [secondaryDocId, setSecondaryDocId] = useState<string | null>(null);
  const [splitDropdownOpen, setSplitDropdownOpen] = useState<'primary' | 'secondary' | null>(null);
  const [connColorPickerOpen, setConnColorPickerOpen] = useState(false);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [dragCardOffset, setDragCardOffset] = useState<Point>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const autoPanRestoreRef = useRef<ToolMode | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [clickPopup, setClickPopup] = useState<{ x: number, y: number } | null>(null);

  // Summary State

  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [fullScreenPdf, setFullScreenPdf] = useState<{ src: string, title?: string } | null>(null);

  // Creation Modal State (Folders/Files/Collection creation)
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder' | 'collection';
    parentId: string | null;
  }>({ isOpen: false, type: 'file', parentId: null });

  // Creation Handlers (Memoized)
  const handleCreateFile = useCallback((parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'file', parentId });
  }, []);

  const handleCreateFolder = useCallback((parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'folder', parentId });
  }, []);

  const handleCreateCollection = useCallback(() => {
    setCreationModal({ isOpen: true, type: 'collection' as any, parentId: null });
  }, []);

  // Collection Selection State (For new cards)
  const [collectionSelectModal, setCollectionSelectModal] = useState<{
    isOpen: boolean;
    pendingCard?: Partial<IdeaCard>;
    pendingPos?: Point;
  }>({ isOpen: false });

  const [folderSelectModal, setFolderSelectModal] = useState<{
    isOpen: boolean;
    pendingFileId?: string;
  }>({ isOpen: false });

  // Chat State
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [isHandoffProcessing, setIsHandoffProcessing] = useState(false);
  const handoffContextRef = useRef<string | null>(null);

  const { apiKeys, persistKeys, hasKeyForModel, getKeyForModel } = useApiKeys(user?.id);
  const [selectedModelId, setSelectedModelId] = useState(() => loadSelectedModelId(user?.id));
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyModalVariant, setApiKeyModalVariant] = useState<'settings' | 'ai-required'>('settings');
  const [requiredProvider, setRequiredProvider] = useState<'google' | 'openai' | 'anthropic'>('google');

  useEffect(() => {
    setSelectedModelId(loadSelectedModelId(user?.id));
  }, [user?.id]);

  const chatHistoryForModel = useMemo(
    () => filterHistoryForModel(chatHistory, selectedModelId),
    [chatHistory, selectedModelId]
  );

  const openApiKeyModal = useCallback((variant: 'settings' | 'ai-required', provider?: 'google' | 'openai' | 'anthropic') => {
    setApiKeyModalVariant(variant);
    setRequiredProvider(provider || getProviderForModel(selectedModelId));
    setIsApiKeyModalOpen(true);
  }, [selectedModelId]);

  const ensureKeyForModel = useCallback((modelId: string): boolean => {
    if (hasKeyForModel(modelId)) return true;
    openApiKeyModal('ai-required', getProviderForModel(modelId));
    return false;
  }, [hasKeyForModel, openApiKeyModal]);

  const handleModelChange = useCallback(async (newModelId: string) => {
    if (newModelId === selectedModelId) return;

    const prevModelId = selectedModelId;
    const outgoingThread = getOutgoingThread(chatHistory, prevModelId);

    setSelectedModelId(newModelId);
    saveSelectedModelId(user?.id, newModelId);
    handoffContextRef.current = null;

    if (countThreadMessages(outgoingThread) === 0) return;

    if (!ensureKeyForModel(prevModelId)) {
      setSelectedModelId(prevModelId);
      saveSelectedModelId(user?.id, prevModelId);
      return;
    }
    if (!ensureKeyForModel(newModelId)) {
      setSelectedModelId(prevModelId);
      saveSelectedModelId(user?.id, prevModelId);
      return;
    }

    setIsHandoffProcessing(true);
    try {
      const summary = await summarizeChatHandoff(
        outgoingThread,
        apiKeys,
        prevModelId,
        sessionName
      );
      const fromName = getModelById(prevModelId).name;
      const handoffMsg: ChatMessage = {
        id: generateId(),
        role: 'model',
        text: `**Context from ${fromName}**\n\n${summary}`,
        timestamp: Date.now(),
        model: newModelId,
        isHandoff: true,
      };

      handoffContextRef.current = summary;
      setChatHistory(prev => [...prev, handoffMsg]);
      const saveResult = await saveChatMessage(session.id, handoffMsg);
      if (!saveResult.ok) {
        debugLog.error('Workspace', 'Failed to save handoff message', saveResult.error);
      }
    } catch (err) {
      debugLog.error('Workspace', 'Model handoff failed', err);
      alert(
        `Could not summarize the ${getModelById(prevModelId).name} thread for handoff. ` +
          (err instanceof Error ? err.message : 'Check API keys and try again.')
      );
      setSelectedModelId(prevModelId);
      saveSelectedModelId(user?.id, prevModelId);
    } finally {
      setIsHandoffProcessing(false);
    }
  }, [
    selectedModelId,
    chatHistory,
    user?.id,
    ensureKeyForModel,
    apiKeys,
    sessionName,
    session.id,
  ]);

  const ensureGeminiKey = useCallback((): string | null => {
    const key = apiKeys.gemini?.trim();
    if (key) return key;
    openApiKeyModal('ai-required', 'google');
    return null;
  }, [apiKeys.gemini, openApiKeyModal]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Card textarea focus management (used for up/down arrow navigation between cards)
  const cardTextareaMapRef = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  const registerCardTextarea = useCallback((cardId: string, el: HTMLTextAreaElement | null) => {
    const map = cardTextareaMapRef.current;
    if (el) map.set(cardId, el);
    else map.delete(cardId);
  }, []);

  const focusCardTextarea = useCallback((cardId: string) => {
    const el = cardTextareaMapRef.current.get(cardId);
    if (!el) return;
    el.focus();
  }, []);

  const findNearestCardVertical = useCallback((fromCardId: string, direction: 'up' | 'down'): string | null => {
    const from = cardsRef.current.find(c => c.id === fromCardId);
    if (!from) return null;

    const candidates = cardsRef.current.filter(c => {
      if (c.id === fromCardId) return false;
      return direction === 'down' ? c.y > from.y : c.y < from.y;
    });
    if (candidates.length === 0) return null;

    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const dy = Math.abs(c.y - from.y);
      const dx = Math.abs(c.x - from.x);
      const score = dy * 10000 + dx;
      if (score < bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }
    return bestId;
  }, []);

  const handleMoveFocusVertical = useCallback((fromCardId: string, direction: 'up' | 'down') => {
    const nextId = findNearestCardVertical(fromCardId, direction);
    if (!nextId) return;
    setSelectedId(nextId);
    requestAnimationFrame(() => focusCardTextarea(nextId));
  }, [findNearestCardVertical, focusCardTextarea]);

  // --- Supabase Integration ---
  const {
    saveWorkspace,
    hasUnsavedChanges,
    saveStatus,
    lastSaved,
    error,
    deleteCard,
    deleteConnection,
    isSaving,
    isHydrated,
  } = useWorkspace(session.id, session);

  // Apply full session from App once when it finishes loading (connections, chat, files, etc.)
  useEffect(() => {
    if (!session.isFullyLoaded) return;
    if (syncedSessionIdRef.current === session.id) return;
    syncedSessionIdRef.current = session.id;

    setSessionName(session.name);
    setCards(session.cards);
    setConnections(session.connections);
    setFileSystem(session.fileSystem);
    setCollections(session.collections || INITIAL_COLLECTIONS);
    setChatHistory(session.chatHistory || []);
    setStrokes(session.strokes || []);
    if (session.viewport_x != null && session.viewport_y != null) {
      setViewport({
        x: session.viewport_x,
        y: session.viewport_y,
        scale: session.viewport_zoom ?? 1,
      });
    }
    setSessionReady(true);
  }, [session]);

  // Merge strokes + chat when App finishes background load (same session id)
  useEffect(() => {
    if (!session.isFullyLoaded || syncedSessionIdRef.current !== session.id) return;
    if (session.chatHistory?.length) {
      setChatHistory(session.chatHistory);
    }
    if (session.strokes?.length) {
      setStrokes(session.strokes);
    }
  }, [session.id, session.isFullyLoaded, session.chatHistory, session.strokes]);

  // --- Auto-Save Effect ---
  useEffect(() => {
    if (!isHydrated || !sessionReady) return;

    const timer = setTimeout(() => {
      const updatedSession = {
        ...session,
        name: sessionName,
        cards,
        connections,
        fileSystem,
        collections,
        chatHistory,
        lastModified: Date.now(),
        // Viewport handled by sync engine if we pass it, but locally we track it in state and don't pass it to session usually
        // We map viewport from local state to session for persistence
        viewport_x: viewport.x,
        viewport_y: viewport.y,
        viewport_zoom: viewport.scale
      };

      // Call legacy onSave for App.tsx state
      onSave(updatedSession);

      // Call Supabase save
      saveWorkspace(updatedSession);

    }, 500); // Debounce saves by 500ms
    return () => clearTimeout(timer);
  }, [sessionName, cards, connections, fileSystem, collections, chatHistory, strokes, session, onSave, viewport, saveWorkspace, isHydrated, sessionReady]);



  // --- Helpers ---
  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - viewportRef.current.x) / viewportRef.current.scale,
      y: (sy - viewportRef.current.y) / viewportRef.current.scale,
    };
  }, []); // Stable dependency as it uses ref

  const findFile = (items: FileSystemItem[], id: string): FileSystemItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findFile(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const findFileByName = (items: FileSystemItem[], name: string): FileSystemItem | null => {
    for (const item of items) {
      if (item.name === name && item.type === 'file') return item;
      if (item.children) {
        const found = findFileByName(item.children, name);
        if (found) return found;
      }
    }
    return null;
  };

  // --- Handlers ---
  const handleUpdateCard = useCallback((id: string, updates: Partial<IdeaCard>) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleDeleteCard = useCallback((id: string) => {
    // 1. Explicitly delete card
    deleteCard(id);

    // 2. Explicitly delete associated connections using Ref to avoid dependency on connections state
    const currentConns = connectionsRef.current;
    const associatedConns = currentConns.filter(c => c.fromId === id || c.toId === id);
    associatedConns.forEach(c => deleteConnection(c.id));

    // 3. Update local state
    setCards(prev => prev.filter(c => c.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, [deleteCard, deleteConnection]);

  const handleUpdateConnection = (id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  // === CARD CREATION LOGIC WITH COLLECTION CHECK ===

  // Helper to find a non-overlapping position - Memoized and uses Ref to avoid re-creation on card changes
  const findEmptyPosition = useCallback((startX: number, startY: number): Point => {
    // Basic collision check constants
    const PADDING = 20;
    const CHECK_WIDTH = CARD_WIDTH + PADDING;
    const CHECK_HEIGHT = CARD_HEIGHT + PADDING;

    // Check if a point collides with any existing card (using Ref for stability)
    const isColliding = (x: number, y: number) => {
      // Use cardsRef.current to get latest cards without re-rendering dependency
      return cardsRef.current.some(card => {
        return (
          Math.abs(card.x - x) < CHECK_WIDTH &&
          Math.abs(card.y - y) < CHECK_HEIGHT
        );
      });
    };

    // If initial position is free, return it
    if (!isColliding(startX, startY)) {
      return { x: startX, y: startY };
    }

    // Spiral Search
    let angle = 0;
    let radius = 50; // Start with a small radius shift
    const maxRadius = 2000; // Safety break
    const angleIncrement = 0.5;
    const radiusIncrement = 10;

    while (radius < maxRadius) {
      const x = startX + radius * Math.cos(angle);
      const y = startY + radius * Math.sin(angle);

      if (!isColliding(x, y)) {
        return { x, y };
      }

      angle += angleIncrement;
      radius += radiusIncrement / (2 * Math.PI); // Grow radius slowly
    }

    // Fallback if very crowded (just offset randomly)
    return { x: startX + 50, y: startY + 50 };
  }, []); // Stable dependency - depends on nothing (uses refs)

  const finalizeCardCreation = useCallback((pos: Point, collectionId: string, partial?: Partial<IdeaCard>) => {
    const newCard: IdeaCard = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      text: '',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      color: '#ffffff',
      style: { ...DEFAULT_CARD_STYLE },
      collectionId: collectionId,
      ...partial
    };
    cardsRef.current = [...cardsRef.current, newCard]; // Synchronous update for loop operations
    setCards(prev => {
      // Only append if it's not already in the array (prevents duplicate adds in strict mode or parallel updates)
      if (prev.find(c => c.id === newCard.id)) return prev;
      return [...prev, newCard];
    });
    setSelectedId(newCard.id);
    setSelectedConnectionId(null);
    setNewCardId(newCard.id);
    setTimeout(() => setNewCardId(null), 400);
  }, []);

  const handleAddCard = useCallback((x?: number, y?: number, partial?: Partial<IdeaCard>) => {
    let worldPos;
    if (x !== undefined && y !== undefined) {
      // If user specifically clicked somewhere (e.g. double click), we try to respect that exact spot 
      // OR we can still shift it slightly if it overlaps. 
      // Let's shift it if it overlaps, so double clicking on a card doesn't stack them perfectly.
      const rawPos = screenToWorld(x, y);
      worldPos = findEmptyPosition(rawPos.x, rawPos.y);
    } else {
      // If "New Card" button, start from center view
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      worldPos = findEmptyPosition(center.x, center.y);
    }

    if (collections.length <= 1) {
      const targetCollectionId = collections[0]?.id || DEFAULT_COLLECTION_ID;
      finalizeCardCreation(worldPos, targetCollectionId, partial);
    } else {
      setCollectionSelectModal({
        isOpen: true,
        pendingPos: worldPos,
        pendingCard: partial
      });
    }
  }, [collections, screenToWorld, findEmptyPosition, finalizeCardCreation]);

  const handleCollectionSelect = (collectionId: string) => {
    if (collectionSelectModal.pendingPos) {
      finalizeCardCreation(
        collectionSelectModal.pendingPos,
        collectionId,
        collectionSelectModal.pendingCard
      );
    }
    setCollectionSelectModal({ isOpen: false });
  };

  const updateFileSystem = (items: FileSystemItem[], targetId: string, updater: (item: FileSystemItem) => FileSystemItem): FileSystemItem[] => {
    return items.map(item => {
      if (item.id === targetId) return updater(item);
      if (item.children) return { ...item, children: updateFileSystem(item.children, targetId, updater) };
      return item;
    });
  };

  const handleToggleFolder = useCallback((id: string) => {
    setFileSystem(prev => updateFileSystem(prev, id, item => ({ ...item, isOpen: !item.isOpen })));
  }, []);

  const removeFileSystemItem = (items: FileSystemItem[], targetId: string): { removed: FileSystemItem | null, newItems: FileSystemItem[] } => {
    let removed: FileSystemItem | null = null;
    const newItems = items.filter(item => {
      if (item.id === targetId) {
        removed = item;
        return false;
      }
      return true;
    }).map(item => {
      if (item.children) {
        const result = removeFileSystemItem(item.children, targetId);
        if (result.removed) removed = result.removed;
        return { ...item, children: result.newItems };
      }
      return item;
    });
    return { removed, newItems };
  };

  const insertItemIntoFileSystem = (items: FileSystemItem[], parentId: string | null, newItem: FileSystemItem): FileSystemItem[] => {
    if (parentId === null) {
      return [...items, newItem];
    }

    return items.map(item => {
      if (item.id === parentId && item.type === 'folder') {
        return {
          ...item,
          isOpen: true,
          children: [...(item.children || []), newItem]
        };
      }
      if (item.children) {
        return {
          ...item,
          children: insertItemIntoFileSystem(item.children, parentId, newItem)
        };
      }
      return item;
    });
  };

  const handleMoveFileSystemItem = useCallback((sourceId: string, targetFolderId: string) => {
    setFileSystem(prev => {
      const result = removeFileSystemItem(prev, sourceId);
      if (!result.removed) return prev;
      return insertItemIntoFileSystem(result.newItems, targetFolderId, result.removed);
    });
  }, []);

  const handleUploadToFolder = useCallback(async (file: File, folderId: string) => {
    const url = await uploadFileToS3(file);
    if (url) {
      const newItem: FileSystemItem = {
        id: generateId(),
        type: 'file',
        name: file.name,
        content: url,
        mediaType: file.type || 'application/octet-stream',
        createdAt: Date.now()
      };
      setFileSystem(prev => insertItemIntoFileSystem(prev, folderId, newItem));
    }
  }, []);

  const handleInitiateMoveFile = useCallback((fileId: string) => {
    setFolderSelectModal({ isOpen: true, pendingFileId: fileId });
  }, []);

  const handleFolderSelect = (folderId: string) => {
    if (folderSelectModal.pendingFileId) {
      handleMoveFileSystemItem(folderSelectModal.pendingFileId, folderId);
    }
    setFolderSelectModal({ isOpen: false });
  };

  const handleMoveCardToCollection = useCallback((cardId: string, collectionId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, collectionId } : c));
  }, []);

  // insertItemIntoFileSystem moved up

  const addImageToFileSystem = useCallback((items: FileSystemItem[], dataUrl: string, mediaType: string = 'image/png'): FileSystemItem[] => {
    let newItems = [...items];
    let imagesFolder = newItems.find(item => item.type === 'folder' && item.name.toLowerCase() === 'images');

    if (!imagesFolder) {
      imagesFolder = {
        id: generateId(),
        type: 'folder',
        name: 'Images',
        children: [],
        isOpen: true,
        createdAt: Date.now()
      };
      newItems.push(imagesFolder);
    }

    let maxNum = 0;
    const scanForMaxImageName = (fsItems: FileSystemItem[]) => {
      fsItems.forEach(item => {
        if (item.type === 'file') {
          const match = item.name.match(/^Image (\d+)(\.\w+)?$/i);
          if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1], 10));
          }
        }
        if (item.children) {
          scanForMaxImageName(item.children);
        }
      });
    };
    scanForMaxImageName(newItems);

    const ext = mediaType === 'image/jpeg' ? '.jpg' : mediaType === 'image/png' ? '.png' : mediaType === 'image/gif' ? '.gif' : '.png';
    const newName = `Image ${maxNum + 1}${ext}`;

    const newItem: FileSystemItem = {
      id: generateId(),
      type: 'file',
      name: newName,
      content: dataUrl,
      mediaType: mediaType,
      createdAt: Date.now()
    };

    return newItems.map(item => {
      if (item.id === imagesFolder!.id) {
        return {
          ...item,
          isOpen: true,
          children: [...(item.children || []), newItem]
        };
      }
      return item;
    });
  }, []);


  const handleConfirmCreation = (name: string) => {
    const { type, parentId } = creationModal;

    if (type === 'collection' as any) {
      const newCollection: Collection = {
        id: generateId(),
        name: name
      };
      setCollections(prev => [...prev, newCollection]);
      return;
    }

    const newItem: FileSystemItem = {
      id: generateId(),
      type: type as 'file' | 'folder',
      name: name,
      content: type === 'file' ? '' : undefined,
      children: type === 'folder' ? [] : undefined,
      isOpen: type === 'folder' ? true : undefined,
      createdAt: Date.now()
    };

    setFileSystem(prev => insertItemIntoFileSystem(prev, parentId, newItem));

    if (type === 'file') {
      setActiveDocId(newItem.id);
    }
  };


  const handleSaveDoc = (id: string, content: string, name: string) => {
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      handleUpdateCard(cardId, { text: name, content: content });
      return;
    }
    setFileSystem(prev => updateFileSystem(prev, id, item => ({ ...item, content, name })));
  };



  const handleUploadImage = async (file: File) => {
    const publicUrl = await uploadFileToS3(file);
    if (!publicUrl) return;

    handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
      image: publicUrl,
      height: 200,
      style: { ...DEFAULT_CARD_STYLE }
    });

    // Set file system
    setFileSystem(prev => addImageToFileSystem(prev, publicUrl, file.type));
  };

  const handleUploadDoc = async (file: File) => {
    const publicUrl = await uploadFileToS3(file);
    if (!publicUrl) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
      fileName: file.name,
      text: isPdf ? '' : `Document: ${file.name}`,
      image: isPdf ? publicUrl : undefined,
      width: isPdf ? 400 : undefined,
      height: isPdf ? 500 : undefined,
      color: '#f3f4f6'
    });

    const newItem: FileSystemItem = {
      id: generateId(),
      type: 'file',
      name: file.name,
      content: publicUrl,
      mediaType: file.type || 'application/octet-stream',
      createdAt: Date.now()
    };
    setFileSystem(prev => [...prev, newItem]);
  };

  const handleOpenFile = useCallback((item: FileSystemItem) => {
    if (item.content?.startsWith('data:')) {
      const type = item.mediaType || '';
      if (type.includes('pdf') || item.name.toLowerCase().endsWith('.pdf')) {
        setFullScreenPdf({ src: item.content, title: item.name });
        return;
      } else if (type.includes('image/')) {
        setFullScreenImage(item.content);
        return;
      } else if (type.includes('text/plain')) {
        // Fall back to writing to window for generic stuff or just download
      }

      const link = document.createElement('a');
      link.href = item.content;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    setActiveDocId(item.id);
  }, []);

  const handleOpenCard = useCallback((card: IdeaCard) => {
    if (card.image) {
      if (card.image.startsWith('data:application/pdf') || card.fileName?.toLowerCase().endsWith('.pdf')) {
        setFullScreenPdf({ src: card.image, title: card.fileName });
      } else {
        setFullScreenImage(card.image);
      }
      return;
    }

    if (card.fileName) {
      // Note: We need to access fileSystem here. 
      // If we use fileSystemRef (to be added), we can do it safely.
      // But currently we don't have fileSystemRef. Let's rely on functional update or regular usage?
      // Regular usage means this function depends on fileSystem state.
      // If fileSystem changes, this function changes, and CardNode's onDoubleClick prop changes.
      // FileSystem changes rarely (only when creating files), so this might be acceptable.
      // But to be 100% safe, let's use a ref for fileSystem too if possible, OR just search in the state we have.
      // Finding file by name recursion... 

      // Let's create fileSystemRef if needed, or just let it be. 
      // Re-rendering on file creation is fine.

      const fileItem = findFileByName(fileSystem, card.fileName);
      if (fileItem) {
        handleOpenFile(fileItem);
      }
      return;
    }

    if (!card.fileName) {
      setActiveDocId(`card-${card.id}`);
    }
  }, [fileSystem, handleOpenFile]);



  const handleSendMessage = useCallback(async (text: string, attachments: ChatAttachment[] = [], modelId: string = selectedModelId) => {
    if (!ensureKeyForModel(modelId)) throw new Error('MISSING_API_KEY');

    setIsChatProcessing(true);
    const newUserMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: Date.now(),
      attachments,
      model: modelId,
    };
    const updatedHistory = [...chatHistory, newUserMsg];
    setChatHistory(updatedHistory);
    const userSave = await saveChatMessage(session.id, newUserMsg);
    if (!userSave.ok) {
      debugLog.error('Workspace', 'Failed to save user chat message', userSave.error);
      alert('Your message could not be saved. Please check your connection and try again.');
    }

    const truncate = (str: string, max = 60) => str.length > max ? str.substring(0, max).replace(/\n/g, ' ') + '…' : str.replace(/\n/g, ' ');
    const cardLines = cardsRef.current.map(c => `- [${c.id}] "${truncate(c.text || c.fileName || 'Untitled')}" color:${c.color}`).join('\n');
    const connLines = connectionsRef.current.length > 0
      ? `\nConnections (${connectionsRef.current.length}):\n` + connectionsRef.current.slice(0, 30).map(c => `- ${c.fromId} → ${c.toId}`).join('\n')
      : '\nConnections: none yet';
    const context = `Canvas (${cardsRef.current.length} cards):\n${cardLines}${connLines}`;

    // Pass only the last 10 prior messages — newUserMsg is already sent separately as `text`
    const truncatedHistory = filterHistoryForModel(chatHistory, modelId).slice(-10);

    const responseText = await getChatResponse(
      truncatedHistory.filter(m => !m.isHandoff),
      text,
      context,
      apiKeys,
      modelId,
      { handoffContext: handoffContextRef.current ?? undefined }
    );
    handoffContextRef.current = null;

    let finalDisplayMsg = responseText;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*"actions"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.actions && Array.isArray(parsed.actions)) {
          // Remove the JSON string from display message
          finalDisplayMsg = responseText.replace(jsonMatch[0], '').trim();

          parsed.actions.forEach((action: any) => {
            if (action.type === 'create_cards' && Array.isArray(action.cards)) {
              action.cards.forEach((cardData: any) => {
                handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
                  text: cardData.text || 'New Idea',
                  content: cardData.content,
                  color: cardData.color || '#ffffff'
                });
              });
            }
            if (action.type === 'update_cards' && Array.isArray(action.updates)) {
              action.updates.forEach((updateData: any) => {
                if (updateData.id && cardsRef.current.some(c => c.id === updateData.id)) {
                  handleUpdateCard(updateData.id, updateData);
                }
              });
            }
            if (action.type === 'delete_cards' && Array.isArray(action.ids)) {
              const validIds = (action.ids as string[]).filter(id =>
                cardsRef.current.some(c => c.id === id)
              );
              validIds.forEach((id: string) => handleDeleteCard(id));
            }
            if (action.type === 'connect_cards' && Array.isArray(action.connections)) {
              action.connections.forEach((conn: any) => {
                if (conn.fromId && conn.toId) {
                  setConnections(prev => [...prev, {
                    id: generateId(),
                    fromId: conn.fromId,
                    toId: conn.toId,
                    style: DEFAULT_CONNECTION_STYLE,
                    arrowStart: DEFAULT_ARROW_START,
                    arrowEnd: DEFAULT_ARROW_END,
                    relationType: DEFAULT_RELATION_TYPE
                  }]);
                }
              });
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse JSON actions payload from AI", e);
    }

    // Always strip code-fence markers — runs regardless of whether canvas actions were found.
    // Handles: matched pairs (```json\n\n```), orphaned openers (```json with no closer),
    // and bare closers (```). An unclosed fence causes marked to render the rest as a dark <pre>.
    finalDisplayMsg = finalDisplayMsg
      .replace(/```[a-zA-Z]*\s*```/g, '') // matched empty pairs
      .replace(/```[a-zA-Z]*/g, '')        // any remaining single fence marker
      .trim();

    if (!finalDisplayMsg) finalDisplayMsg = "I've successfully updated your canvas!";

    setIsChatProcessing(false);
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'model',
      text: finalDisplayMsg,
      timestamp: Date.now(),
      model: modelId,
    };
    setChatHistory(prev => [...prev, assistantMsg]);
    const assistantSave = await saveChatMessage(session.id, assistantMsg);
    if (!assistantSave.ok) {
      debugLog.error('Workspace', 'Failed to save assistant chat message', assistantSave.error);
      alert('The assistant reply could not be saved. Please check your connection and try again.');
    }

  }, [chatHistory, apiKeys, ensureKeyForModel, selectedModelId, session.id, handleAddCard, handleUpdateCard, handleDeleteCard]);

  // Canvas Handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // --- Paste Handler ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ignore paste events if focus is on an input or textarea, let the component handle it natively
      if (isInput) return;

      if (e.clipboardData) {
        const items = e.clipboardData.items;

        // 1. Handle Images
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              uploadFileToS3(blob).then(publicUrl => {
                if (publicUrl) {
                  // Place at center of viewport
                  const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                  const pos = findEmptyPosition(center.x, center.y);

                  handleAddCard(undefined, undefined, {
                    x: pos.x,
                    y: pos.y,
                    image: publicUrl,
                    height: 200,
                    style: { ...DEFAULT_CARD_STYLE }
                  });

                  // Add to file system so it works exactly like uploaded images
                  setFileSystem(prev => addImageToFileSystem(prev, publicUrl, blob.type));
                }
              });
              e.preventDefault(); // Prevent default paste behavior
              return; // Stop after finding an image
            }
          }
        }

        // 2. Handle Text (if no image processed)
        // Check for text data
        const text = e.clipboardData.getData('text');
        if (text) {
          const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
          const pos = findEmptyPosition(center.x, center.y);

          handleAddCard(undefined, undefined, {
            x: pos.x,
            y: pos.y,
            text: text,
            color: '#ffffff',
            style: { ...DEFAULT_CARD_STYLE }
          });
          e.preventDefault();
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleAddCard, screenToWorld, findEmptyPosition, setFileSystem, addImageToFileSystem]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    // 1. Handle Internal Drag (React DnD or custom)
    const docId = e.dataTransfer.getData('application/react-dnd-doc-id');
    if (docId) {
      const doc = findFile(fileSystem, docId);
      if (doc) {
        if (doc.mediaType?.startsWith('image/')) {
          handleAddCard(e.clientX, e.clientY, {
            image: doc.content,
            height: 200,
            style: { ...DEFAULT_CARD_STYLE }
          });
        } else {
          let cardText = doc.content || '';
          if (cardText.startsWith('data:')) {
            cardText = `Document: ${doc.name}`;
          } else {
            try {
              const parsed = JSON.parse(cardText);
              if (Array.isArray(parsed)) cardText = parsed.map((b: any) => b.text).join('\n');
            } catch (e) { }
          }

          const isPdf = doc.mediaType === 'application/pdf';

          handleAddCard(e.clientX, e.clientY, {
            text: isPdf ? '' : (cardText || doc.name),
            fileName: doc.name,
            color: '#f8fafc',
            image: isPdf ? doc.content : undefined,
            width: isPdf ? 400 : undefined,
            height: isPdf ? 500 : undefined,
            style: { ...DEFAULT_CARD_STYLE, fontSize: 14 }
          });
        }
      }
      return;
    }

    // 2. Handle External Files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file: File, index: number) => {
        uploadFileToS3(file).then(publicUrl => {
          if (!publicUrl) return;

          // Offset subsequent drops slightly
          const dropX = e.clientX + (index * 20);
          const dropY = e.clientY + (index * 20);

          if (file.type.startsWith('image/')) {
            handleAddCard(dropX, dropY, {
              image: publicUrl,
              height: 200,
              style: { ...DEFAULT_CARD_STYLE }
            });
            setFileSystem(prev => addImageToFileSystem(prev, publicUrl, file.type));
          } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            handleAddCard(dropX, dropY, {
              fileName: file.name,
              text: `Document: ${file.name}`,
              color: '#f3f4f6'
            });
          } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            handleAddCard(dropX, dropY, {
              fileName: file.name,
              image: publicUrl,
              text: '',
              width: 400,
              height: 500,
              color: '#f3f4f6'
            });
          } else {
            // Generic file
            handleAddCard(dropX, dropY, {
              fileName: file.name,
              text: `File: ${file.name}`,
              color: '#f3f4f6'
            });
          }

          if (!file.type.startsWith('image/')) {
            const newItem: FileSystemItem = {
              id: generateId(),
              type: 'file',
              name: file.name,
              content: publicUrl,
              mediaType: file.type || 'application/octet-stream',
              createdAt: Date.now()
            };
            setFileSystem(prev => [...prev, newItem]);
          }
        });
      });
    }
  };

  const handlePointerDownCanvas = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    setClickPopup(null);
    if (connectingFromId) {
      if (e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointerIdRef.current = e.pointerId;
      }
      const newCardId = generateId();
      handleAddCard(e.clientX, e.clientY, { id: newCardId });

      const newConnId = generateId();
      setConnections(prev => [...prev, {
        id: newConnId,
        fromId: connectingFromId,
        toId: newCardId,
        style: DEFAULT_CONNECTION_STYLE,
        arrowStart: DEFAULT_ARROW_START,
        arrowEnd: DEFAULT_ARROW_END,
        relationType: DEFAULT_RELATION_TYPE
      }]);
      setConnectingFromId(null);
      setSelectedConnectionId(newConnId);
      return;
    }

    setSelectedConnectionId(null);
    setSelectedId(null);

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    }

    // Auto-switch to pan mode on left click if no other tool is active (or just always for background drag)
    if (e.button === 0 && !e.shiftKey && !e.ctrlKey) {
      if (mode === 'draw') {
        const worldMouse = screenToWorld(e.clientX, e.clientY);
        if (drawingTool === 'eraser') {
          setMousePos(worldMouse);
        }

        setIsDragging(true);
        setCurrentStroke({
          id: generateId(),
          tool: drawingTool,
          color: strokeColor,
          radius: strokeRadius,
          points: [worldMouse]
        });
        return;
      }
      autoPanRestoreRef.current = mode;
      setMode('pan');
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (mode === 'pan' || e.button === 1 || e.shiftKey) {
      if (mode !== 'pan') autoPanRestoreRef.current = mode;
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setMode('pan');
    }
  }, [connectingFromId, mode, drawingTool, strokeColor, strokeRadius, screenToWorld]);

  const handlePointerDownCard = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();

    if (!e.isPrimary) return;

    if (wrapperRef.current?.setPointerCapture) {
      wrapperRef.current.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    }

    // We use connectingFromId from closure (dependency) because it changes rarely compared to drag
    // Ideally we'd use a ref for this too if we wanted 0 re-binds, but this is acceptable.
    if (connectingFromId && connectingFromId !== id) {
      const newConnId = generateId();
      setConnections(prev => [...prev, {
        id: newConnId,
        fromId: connectingFromId,
        toId: id,
        style: DEFAULT_CONNECTION_STYLE,
        arrowStart: DEFAULT_ARROW_START,
        arrowEnd: DEFAULT_ARROW_END,
        relationType: DEFAULT_RELATION_TYPE
      }]);
      setConnectingFromId(null);
      setSelectedConnectionId(newConnId);
      return;
    }

    setSelectedId(id);
    setSelectedConnectionId(null);
    if (mode === 'select') {
      setIsDragging(true);
      const card = cardsRef.current.find(c => c.id === id);
      if (card) {
        // screenToWorld uses Ref, so it's stable and safe
        // We use the raw event clientX/Y and current viewport ref
        const worldMouse = screenToWorld(e.clientX, e.clientY);
        setDragCardOffset({ x: card.x - worldMouse.x, y: card.y - worldMouse.y });
      }
    }
  }, [connectingFromId, mode, screenToWorld]);

  const handleCardDoubleClick = useCallback((e: React.MouseEvent, id: string) => {
    const card = cardsRef.current.find(c => c.id === id); // Use ref
    if (card) {
      handleOpenCard(card);
    }
  }, [handleOpenCard]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // OPTIMIZATION: Do NOT update state on every mouse move unless absolutely necessary
    // Only update mousePos if we are drawing a connection line (connectingFromId)
    // Or if we need it for something else critical (like eraser cursor).

    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return;

    if (connectingFromId || (mode === 'draw' && drawingTool === 'eraser' && !isDragging)) {
      const worldMouse = screenToWorld(e.clientX, e.clientY);
      setMousePos(worldMouse);
    }

    if (isDragging) {
      const worldMouse = screenToWorld(e.clientX, e.clientY);
      if (mode === 'draw' && drawingTool === 'eraser') {
        setMousePos(worldMouse);
      }

      // Drag logic...
      if (mode === 'draw' && currentStroke) {
        setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, worldMouse] } : null);
      } else if (mode === 'pan') {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
      } else if (mode === 'select' && selectedId) {
        handleUpdateCard(selectedId, {
          x: worldMouse.x + dragCardOffset.x,
          y: worldMouse.y + dragCardOffset.y
        });
      }
    }
  }, [connectingFromId, isDragging, mode, drawingTool, selectedId, dragStart, dragCardOffset, screenToWorld, handleUpdateCard, currentStroke]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return;
    setIsDragging(false);
    activePointerIdRef.current = null;
    if (mode === 'draw' && currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
    if (autoPanRestoreRef.current) {
      setMode(autoPanRestoreRef.current);
      autoPanRestoreRef.current = null;
    }
  }, [mode, currentStroke]);

  const handleGripDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const card = cardsRef.current.find(c => c.id === id);
    if (!card) return;

    if (!e.isPrimary) return;

    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    }

    setMode('select');
    setSelectedId(id);
    setIsDragging(true);

    const worldMouse = screenToWorld(e.clientX, e.clientY);
    setDragCardOffset({ x: card.x - worldMouse.x, y: card.y - worldMouse.y });
  }, [screenToWorld]);


  const startConnection = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConnectingFromId(id);
    const card = cardsRef.current.find(c => c.id === id);
    if (card) setMousePos({ x: card.x, y: card.y });
  }, []);

  const handleGenerateAI = useCallback(async (sourceId: string) => {
    const sourceCard = cardsRef.current.find(c => c.id === sourceId);
    if (!sourceCard || !sourceCard.text.trim()) return;

    if (!ensureKeyForModel(selectedModelId)) return;

    setIsProcessingAI(true);
    const existingIdeas = cardsRef.current.map(c => c.text);
    const ideas = await generateRelatedIdeas(selectedModelId, apiKeys, sourceCard.text, existingIdeas);

    if (ideas.length > 0) {
      const radius = 300;
      const angleStep = Math.PI / (ideas.length + 1);
      const startAngle = -Math.PI / 2 - (angleStep * (ideas.length - 1)) / 2;
      const newCards: IdeaCard[] = [];
      const newConnections: Connection[] = [];

      // Use ref for collections to be safe or just accept default
      const targetCollectionId = sourceCard.collectionId || DEFAULT_COLLECTION_ID;

      ideas.forEach((ideaText, i) => {
        const angle = startAngle + (i + 1) * angleStep + (Math.random() * 0.2 - 0.1);
        const id = generateId();
        newCards.push({
          id,
          x: sourceCard.x + Math.cos(angle) * radius,
          y: sourceCard.y + Math.sin(angle) * radius,
          text: ideaText,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          color: '#ffffff',
          style: { ...DEFAULT_CARD_STYLE },
          collectionId: targetCollectionId
        });
        newConnections.push({
          id: generateId(),
          fromId: sourceId,
          toId: id,
          style: ConnectionStyle.DASHED,
          arrowStart: ArrowType.NONE,
          arrowEnd: ArrowType.STANDARD,
          relationType: DEFAULT_RELATION_TYPE
        });
      });
      setCards(prev => [...prev, ...newCards]);
      setConnections(prev => [...prev, ...newConnections]);
    }
    setIsProcessingAI(false);
  }, [ensureKeyForModel, selectedModelId, apiKeys]);

  const handleExportMasterPDF = useCallback(async () => {
    try {
      await generateMasterPDF(sessionName, cards, connections);
    } catch (error) {
      console.error('Failed to export master PDF:', error);
      alert('Failed to export PDF. Please check the console for details.');
    }
  }, [sessionName, cards, connections]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Card-to-card textarea navigation (ArrowUp/ArrowDown)
      if (target.tagName === 'TEXTAREA' && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ta = target as HTMLTextAreaElement;
        const cardId = ta.dataset.cardId;
        if (cardId) {
          const value = ta.value || '';
          const caret = ta.selectionStart ?? 0;
          const before = value.slice(0, caret);
          const currentLineIndex = before.split('\n').length - 1;
          const totalLines = value.split('\n').length;
          const atFirstLine = currentLineIndex <= 0;
          const atLastLine = currentLineIndex >= totalLines - 1;

          if (e.key === 'ArrowUp' && atFirstLine) {
            e.preventDefault();
            e.stopPropagation();
            handleMoveFocusVertical(cardId, 'up');
            return;
          }
          if (e.key === 'ArrowDown' && atLastLine) {
            e.preventDefault();
            e.stopPropagation();
            handleMoveFocusVertical(cardId, 'down');
            return;
          }
        }
      }

      if (e.code === 'Space' && !e.repeat && !isInput) setMode('pan');
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        // Prevent deletion if an editor, image viewer, or modal is open
        if (activeDocId !== null || fullScreenImage !== null || creationModal.isOpen || collectionSelectModal.isOpen || isApiKeyModalOpen) return;

        // Prevent deletion if the user is interacting with UI overlays
        if (target.closest('.sidebar') || target.closest('.header') || target.closest('.aichat') || target.closest('button')) return;

        if (selectedId && !isInput) {
          handleDeleteCard(selectedId);
        } else if (selectedConnectionId && !isInput) {
          deleteConnection(selectedConnectionId);
          setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
          setSelectedConnectionId(null);
          setConnColorPickerOpen(false);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setMode('select');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedId, selectedConnectionId, activeDocId, fullScreenImage, creationModal.isOpen, collectionSelectModal.isOpen, isApiKeyModalOpen, handleMoveFocusVertical]);

  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  let connToolbarPos = { x: 0, y: 0 };
  if (selectedConnection) {
    const c1 = cards.find(c => c.id === selectedConnection.fromId);
    const c2 = cards.find(c => c.id === selectedConnection.toId);
    if (c1 && c2) {
      const getEdge = (center: { x: number, y: number }, target: { x: number, y: number }, c: any) => {
        const w = c.width || 256;
        const h = c.height || 100;
        const dx = target.x - center.x;
        const dy = target.y - center.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return center;
        const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
        const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
        const t = Math.min(tX, tY);
        return { x: center.x + dx * t, y: center.y + dy * t };
      };

      const center1 = { x: c1.x, y: c1.y };
      const center2 = { x: c2.x, y: c2.y };
      const start = getEdge(center1, center2, c1);
      const end = getEdge(center2, center1, c2);

      connToolbarPos = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
    }
  }

  const getDocFromId = (id: string | null): FileSystemItem | undefined => {
    if (!id) return undefined;
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = cards.find(c => c.id === cardId);
      if (card) {
        return {
          id: id,
          type: 'file',
          name: card.text || 'Untitled Card',
          content: card.content || '',
          createdAt: Date.now()
        };
      }
    } else {
      return findFile(fileSystem, id) || undefined;
    }
    return undefined;
  };

  const activeDoc = getDocFromId(activeDocId);
  const secondaryDoc = getDocFromId(secondaryDocId);

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Native Wheel Listener to prevent browser zoom (passive: false required)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;

      // Prevent canvas zoom/pan if the scroll happens over UI overlays (Sidebar, Header, Modals, etc.)
      if (containerRef.current && !containerRef.current.contains(target) && target !== wrapperRef.current) {
        return;
      }

      // Check for textarea or elements with scroll classes on the canvas itself
      // We also check if the element actually has scrollable content (scrollHeight > clientHeight)
      const scrollable = target.closest('textarea, .overflow-auto, .overflow-y-auto, .overflow-scroll, .overflow-y-scroll');

      if (scrollable) {
        const el = scrollable as HTMLElement;
        if (el.scrollHeight > el.clientHeight) {
          const atTop = el.scrollTop <= 0;
          const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 1;

          // If scrolling UP and NOT at top, let it scroll
          if (e.deltaY < 0 && !atTop) return;
          // If scrolling DOWN and NOT at bottom, let it scroll
          if (e.deltaY > 0 && !atBottom) return;

          // Otherwise (at edges), we might want to let it zoom/pan or just do nothing?
          // Usually, if you hit edge, you might want to switch to page zoom, but for this app
          // it's better to isolate them. If user is in text, they probably don't want to accidentally zoom.
          // So maybe we return here too? Or let it fall through?
          // Let's let it fall through only if we are strictly at the edge to avoid "locking".
          // But user said "lets me resume my zoom out".
          // Standard behavior: scroll until end, then parent scroll.
          // But here parent is canvas zoom/pan.
          // Let's just RETURN if it's a scrollable element, period.
          // EXCEPT if e.ctrlKey is pressed (zoom intent).
        }
      }

      if (e.ctrlKey || e.metaKey || modeRef.current === 'pan') {
        e.preventDefault();
        setClickPopup(null);
        setViewport(prev => {
          // Smoother zoom: mouse wheel in pan mode uses extremely fluid sensitivity 
          const sensitivity = (modeRef.current === 'pan' && !e.ctrlKey && !e.metaKey) ? 0.0015 : 0.003;
          const newScale = Math.min(Math.max(0.1, prev.scale - e.deltaY * sensitivity), 5); // Expanded bounds to 5x inline with smooth zoom

          // Optional: Zoom toward mouse position. Keeping it simple globally for now.
          return { ...prev, scale: newScale };
        });
      } else {
        // Only pan if we didn't return above (meaning we are not in a scrollable element)
        e.preventDefault();
        setClickPopup(null);
        setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };

    const el = wrapperRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // --- Shards IPC Integration (Electron preload bridge) ---
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onShardTextClip || !api?.onShardImageClip) return;

    const handleTextClipper = async () => {
      const saved = localStorage.getItem('brainstorm_shards_config');
      if (!saved) return;
      const config = JSON.parse(saved);
      if (!config.textClipper) return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) handleAddCard(window.innerWidth / 2, window.innerHeight / 2, { text });
      } catch (e) { console.error('Text clipper error', e); }
    };

    const handleImageClipper = async () => {
      const saved = localStorage.getItem('brainstorm_shards_config');
      if (!saved) return;
      const config = JSON.parse(saved);
      if (!config.screenshotClipper) return;
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const file = new File([blob], `Screenshot-${Date.now()}.png`, { type });
              handleUploadImage(file);
              return;
            }
          }
        }
      } catch (e) { console.error('Image clipper error', e); }
    };

    const unsubText = api.onShardTextClip(handleTextClipper);
    const unsubImage = api.onShardImageClip(handleImageClipper);
    return () => {
      unsubText?.();
      unsubImage?.();
    };
  }, [handleAddCard, handleUploadImage]);

  return (
    <div
      ref={wrapperRef}
      role="application"
      aria-label="Brainstorm canvas"
      className="fixed inset-0 overflow-hidden bg-black select-none font-sans"
      onPointerDown={handlePointerDownCanvas}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(e) => { if (e.target === containerRef.current || e.target === wrapperRef.current) handleAddCard(e.clientX, e.clientY); }}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.group') && !target.closest('.sidebar') && !target.closest('.header') && !target.closest('button')) {
          e.preventDefault();
          setClickPopup({ x: e.clientX, y: e.clientY });
        }
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        backgroundImage: `linear-gradient(to right, #333333 ${3 * viewport.scale}px, transparent ${3 * viewport.scale}px), linear-gradient(to bottom, #333333 ${3 * viewport.scale}px, transparent ${3 * viewport.scale}px)`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${50 * viewport.scale}px ${50 * viewport.scale}px`
      }}
    >
      {clickPopup && (
        <div
          className="absolute z-50 transform -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-200"
          style={{ left: clickPopup.x, top: clickPopup.y }}
        >
          <button
            className="bg-zinc-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-zinc-700 hover:bg-zinc-800 flex items-center gap-2 font-medium transition-colors"
            onPointerLeave={() => setClickPopup(null)}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleAddCard(clickPopup.x, clickPopup.y);
              setClickPopup(null);
            }}
          >
            <Plus className="w-4 h-4 text-blue-400" />
            Create Card Here
          </button>
        </div>
      )}

      <div onPointerDown={(e) => e.stopPropagation()}>
        <Header
          sessionName={sessionName}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onBack={onBack}
          onGoHome={onGoHome}
          isWorkspace={true}
          onRename={setSessionName}
          user={user}
          onLogin={onLogin}
          onLogout={onLogout}
          onSwitchAccount={onSwitchAccount}
          onGoShards={onGoShards}
          onExportMasterPDF={handleExportMasterPDF}
          isSaving={isSaving || hasUnsavedChanges}
          saveStatus={saveStatus}
          error={error}
          onSave={() => {
            // Manual Save Trigger
            const updatedSession = {
              ...session,
              name: sessionName,
              cards,
              connections,
              fileSystem,
              collections,
              chatHistory,
              strokes,
              lastModified: Date.now(),
              viewport_x: viewport.x,
              viewport_y: viewport.y,
              viewport_zoom: viewport.scale
            };
            onSave(updatedSession); // Update App state
            saveWorkspace(updatedSession); // Trigger Supabase save
          }}
        />
      </div>


      <div
        ref={containerRef}
        className="w-full h-full absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        {/* XY Axis Texturing Removed per user request */}

        <DrawingLayer
          strokes={strokes}
          currentStroke={currentStroke}
          viewport={viewport}
          mousePos={(mode === 'draw' && drawingTool === 'eraser') ? mousePos : null}
          eraserRadius={strokeRadius}
        />

        <ConnectionLayer
          connections={connections}
          cards={cards}
          connectingLine={connectingFromId ? { from: cards.find(c => c.id === connectingFromId)!, to: mousePos } : null}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={setSelectedConnectionId}
        />

        {selectedConnection && (
          <div
            className="absolute z-50 transition-none"
            style={{
              left: connToolbarPos.x,
              top: connToolbarPos.y,
              transform: 'translate(-50%, -50%)',
              transition: 'none'
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 animate-in fade-in zoom-in duration-200">
              {/* Relationship Toggle */}
              <button
                onClick={() => {
                  const isParentChild = selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT;
                  handleUpdateConnection(selectedConnection.id, {
                    relationType: isParentChild ? RelationType.EQUIVALENCE : RelationType.PARENT_TO_CHILD
                  });
                }}
                className="p-1 hover:bg-gray-100 rounded text-xs font-medium px-2"
              >
                {(selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT)
                  ? 'Parent-Child'
                  : 'Equivalence'}
              </button>

              {/* Flip Button (Only for Parent-Child) */}
              {(selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT) && (
                <button
                  onClick={() => {
                    const newType = selectedConnection.relationType === RelationType.PARENT_TO_CHILD
                      ? RelationType.CHILD_TO_PARENT
                      : RelationType.PARENT_TO_CHILD;
                    handleUpdateConnection(selectedConnection.id, { relationType: newType });
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Flip Direction"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => handleUpdateConnection(selectedConnection.id, { style: selectedConnection.style === ConnectionStyle.SOLID ? ConnectionStyle.DASHED : ConnectionStyle.SOLID })}
                className="p-1 hover:bg-gray-100 rounded text-xs font-medium px-2"
              >
                {selectedConnection.style === ConnectionStyle.SOLID ? 'Solid' : 'Dashed'}
              </button>

              <div className="w-px h-4 bg-gray-200 mx-1"></div>

              {/* Color Picker Toggle */}
              <div className="relative flex items-center">
                <button
                  onClick={() => setConnColorPickerOpen(v => !v)}
                  className="w-5 h-5 rounded-full border-2 border-gray-300 shadow-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: selectedConnection.color || '#3b82f6' }}
                  title="Change Line Color"
                />
                {connColorPickerOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex gap-2 z-50">
                    {['#3b82f6', '#ef4444', '#f97316', '#22c55e', '#ffffff'].map(c => (
                      <button
                        key={c}
                        onClick={() => { handleUpdateConnection(selectedConnection.id, { color: c }); setConnColorPickerOpen(false); }}
                        className="w-6 h-6 rounded-full border border-gray-300 shadow-sm transition-transform hover:scale-110"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                    <label className="w-6 h-6 rounded-full border border-gray-300 shadow-sm flex items-center justify-center cursor-pointer relative overflow-hidden transition-transform hover:scale-110" title="Custom Color">
                      <input
                        type="color"
                        value={selectedConnection.color || '#3b82f6'}
                        onChange={(e) => handleUpdateConnection(selectedConnection.id, { color: e.target.value })}
                        className="opacity-0 absolute w-[200%] h-[200%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      />
                      <div className="bg-gradient-to-tr from-rose-400 via-purple-400 to-blue-400 w-full h-full pointer-events-none absolute inset-0 mix-blend-multiply opacity-50"></div>
                    </label>
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-gray-200 mx-1"></div>

              <button
                onClick={() => {
                  deleteConnection(selectedConnection.id);
                  setConnections(prev => prev.filter(c => c.id !== selectedConnection.id));
                  setSelectedConnectionId(null);
                }}
                className="p-1 hover:bg-red-50 text-red-500 rounded"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {cards.length === 0 && (
          <div
            className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
            aria-hidden="true"
          >
            <MousePointerClick className="w-10 h-10 text-zinc-500 mb-4 animate-canvas-hint" />
            <p className="text-zinc-500 text-base font-medium tracking-wide animate-canvas-hint">
              Double-click anywhere to add your first idea
            </p>
            <p className="text-zinc-600 text-sm mt-2 animate-canvas-hint">
              or right-click for options
            </p>
          </div>
        )}

        {cards.map(card => (
          <CardNode
            key={card.id}
            card={card}
            isSelected={selectedId === card.id}
            scale={viewport.scale}
            onUpdate={handleUpdateCard}
            onDelete={handleDeleteCard}
            onPointerDown={handlePointerDownCard}
            onDoubleClick={handleCardDoubleClick}
            onConnectStart={startConnection}
            onGenerateAI={handleGenerateAI}
            isProcessingAI={isProcessingAI}
            isConnecting={!!connectingFromId}
            onImageClick={setFullScreenImage}
            onOpenCard={handleOpenCard}
            onMoveFocusVertical={handleMoveFocusVertical}
            onRegisterTextarea={registerCardTextarea}
            onGripDown={handleGripDown}
            isNew={card.id === newCardId}
          />
        ))}
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        mode={mode}
        setMode={setMode}
        drawingTool={drawingTool}
        setDrawingTool={setDrawingTool}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeRadius={strokeRadius}
        setStrokeRadius={setStrokeRadius}
        onAddCard={() => handleAddCard()}
        onUploadImage={handleUploadImage}
        onUploadDoc={handleUploadDoc}
        fileSystem={fileSystem.filter(f => f.name !== '__strokes__.json')}
        cards={cards} // Pass cards to populate collections in Sidebar
        connections={connections}
        collections={collections}
        onToggleFolder={handleToggleFolder}
        onOpenFile={handleOpenFile}
        onOpenCard={(card) => {
          // Center viewport on card
          setViewport({
            x: window.innerWidth / 2 - card.x,
            y: window.innerHeight / 2 - card.y,
            scale: 1
          });
          setSelectedId(card.id);
        }}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onCreateCollection={handleCreateCollection}
        onMoveCardToCollection={handleMoveCardToCollection}

        onRenameFile={(id, newName) => {
          setFileSystem(prev => updateFileSystem(prev, id, item => ({ ...item, name: newName })));
        }}
        onDeleteFile={(id) => {
          // Recursive delete helper? Or just filter.
          // Filter is hard on recursive structure.
          // Function to filter recursive
          const filterRecursive = (items: FileSystemItem[], targetId: string): FileSystemItem[] => {
            return items
              .filter(item => item.id !== targetId)
              .map(item => ({
                ...item,
                children: item.children ? filterRecursive(item.children, targetId) : undefined
              }));
          };
          setFileSystem(prev => filterRecursive(prev, id));
        }}
        onInitiateMoveFile={handleInitiateMoveFile}
        onUploadToFolder={handleUploadToFolder}
        onMoveFileSystemItem={handleMoveFileSystemItem}
      />

      {/* Modals, etc. */}
      {/* ... (Existing modals) ... */}

      {fullScreenImage && <FullScreenImageOverlay src={fullScreenImage} onClose={() => setFullScreenImage(null)} />}
      {fullScreenPdf && <FullScreenPdfOverlay src={fullScreenPdf.src} title={fullScreenPdf.title} onClose={() => setFullScreenPdf(null)} />}


      <CreationModal
        isOpen={creationModal.isOpen}
        onClose={() => setCreationModal({ ...creationModal, isOpen: false })}
        onConfirm={handleConfirmCreation}
        type={creationModal.type}
      />

      <CollectionSelectorModal
        isOpen={collectionSelectModal.isOpen}
        onCancel={() => setCollectionSelectModal({ isOpen: false })}
        collections={collections}
        onSelect={handleCollectionSelect}
      />

      {folderSelectModal.isOpen && (
        <FolderSelectorModal
          isOpen={folderSelectModal.isOpen}
          onClose={() => setFolderSelectModal({ isOpen: false })}
          onSelect={handleFolderSelect}
          fileSystem={fileSystem}
        />
      )}

      {activeDocId && activeDoc && (
        <div
          className="fixed inset-0 z-[60] flex flex-row items-center justify-center p-4 gap-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => { setActiveDocId(null); setSecondaryDocId(null); setSplitDropdownOpen(null); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Primary View container */}
          <div className="relative flex h-[95%] transition-all duration-300" style={{ width: secondaryDocId ? '50%' : '900px', maxWidth: secondaryDocId ? '800px' : '900px' }} onClick={(e) => e.stopPropagation()}>
            <DocumentEditor
              doc={activeDoc}
              className="w-full flex-1"
              onClose={() => { setActiveDocId(null); setSecondaryDocId(null); }}
              onSave={handleSaveDoc}
              onChange={handleSaveDoc}
            />
            {!secondaryDocId && (
              <div className="absolute top-1/2 -right-4 translate-x-full -translate-y-1/2 flex items-center justify-center ml-2">
                <button onClick={(e) => { e.stopPropagation(); setSplitDropdownOpen(prev => prev === 'primary' ? null : 'primary'); }} className="p-3 bg-white/50 backdrop-blur rounded-full shadow-lg hover:bg-white/90 border border-gray-200 transition-all text-gray-600 hover:text-black">
                  <Plus className="w-6 h-6" />
                </button>
                {splitDropdownOpen === 'primary' && (
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl border border-gray-200 w-64 max-h-[80vh] overflow-y-auto z-[70]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b text-sm font-semibold text-gray-700">Select a Card</div>
                    <div className="p-2 flex flex-col gap-1">
                      {collections.map(col => {
                        const colCards = cards.filter(c => c.collectionId === col.id && `card-${c.id}` !== activeDocId);
                        if (colCards.length === 0) return null;
                        return (
                          <details key={col.id} className="group outline-none">
                            <summary className="cursor-pointer text-sm font-medium text-gray-800 p-2 hover:bg-gray-100 rounded list-none flex items-center justify-between outline-none">
                              {col.name} <span className="text-xs text-gray-400">{colCards.length}</span>
                            </summary>
                            <div className="pl-4 py-1 flex flex-col gap-1">
                              {colCards.map(c => (
                                <button key={c.id} onClick={() => { setSecondaryDocId(`card-${c.id}`); setSplitDropdownOpen(null); }} className="text-left text-sm text-gray-600 hover:text-black hover:bg-gray-50 p-1.5 rounded truncate w-full outline-none">
                                  {c.text.substring(0, 30) || 'Untitled'}
                                </button>
                              ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Secondary View container */}
          {secondaryDocId && secondaryDoc && (
            <div className="relative flex h-[95%] transition-all duration-300 w-[50%] max-w-[800px]" onClick={(e) => e.stopPropagation()}>
              <DocumentEditor
                doc={secondaryDoc}
                className="w-full flex-1"
                onClose={() => setSecondaryDocId(null)}
                onSave={handleSaveDoc}
                onChange={handleSaveDoc}
                onSwap={() => setSplitDropdownOpen(prev => prev === 'secondary' ? null : 'secondary')}
              />
              {splitDropdownOpen === 'secondary' && (
                <div className="absolute right-0 top-16 bg-white rounded-xl shadow-2xl border border-gray-200 w-64 max-h-[80vh] overflow-y-auto z-[70]" onClick={(e) => e.stopPropagation()}>
                  <div className="p-3 border-b text-sm font-semibold text-gray-700 flex justify-between items-center">
                    <span>Swap Card</span>
                    <button onClick={() => setSplitDropdownOpen(null)} className="hover:bg-gray-100 p-1 rounded transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    {collections.map(col => {
                      const colCards = cards.filter(c => c.collectionId === col.id && `card-${c.id}` !== secondaryDocId && `card-${c.id}` !== activeDocId);
                      if (colCards.length === 0) return null;
                      return (
                        <details key={col.id} className="group outline-none" open>
                          <summary className="cursor-pointer text-sm font-medium text-gray-800 p-2 hover:bg-gray-100 rounded list-none flex items-center justify-between outline-none">
                            {col.name} <span className="text-xs text-gray-400">{colCards.length}</span>
                          </summary>
                          <div className="pl-4 py-1 flex flex-col gap-1">
                            {colCards.map(c => (
                              <button key={c.id} onClick={() => { setSecondaryDocId(`card-${c.id}`); setSplitDropdownOpen(null); }} className="text-left text-sm text-gray-600 hover:text-black hover:bg-gray-50 p-1.5 rounded truncate w-full outline-none">
                                {c.text.substring(0, 30) || 'Untitled'}
                              </button>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <HelpGuide />
      <AIChat
        history={chatHistoryForModel}
        onSendMessage={handleSendMessage}
        isProcessing={isChatProcessing || isHandoffProcessing}
        onSettingsClick={() => openApiKeyModal('settings')}
        selectedModelId={selectedModelId}
        onModelChange={handleModelChange}
      />
      <APIKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={persistKeys}
        currentKeys={apiKeys}
        variant={apiKeyModalVariant}
        requiredProvider={requiredProvider}
      />
    </div>
  );
};