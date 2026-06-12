import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CardNode } from './CardNode';
import { ConnectionLayer } from './ConnectionLayer';
import { Sidebar } from './Controls';
import { Header } from './Header';
import { DocumentEditor } from './DocumentEditor';
import { HelpGuide } from './HelpGuide';
import { AIChat } from './AIChat';
import { APIKeyModal } from './APIKeyModal';
import { ErrorBoundary } from './ErrorBoundary';
import { FullScreenImageOverlay } from './FullScreenImageOverlay';
import { FullScreenPdfOverlay } from './FullScreenPdfOverlay';
import { CreationModal } from './CreationModal';
import { CollectionSelectorModal } from './CollectionSelectorModal';
import { FolderSelectorModal } from './FolderSelectorModal';
import { DrawingLayer } from './DrawingLayer';
import { OnboardingOverlay } from './OnboardingOverlay';
import { IdeaCard, Connection, Viewport, ToolMode, Point, ConnectionStyle, ArrowType, FileSystemItem, Session, RelationType, ChatMessage, ChatAttachment, Collection, UserProfile, Stroke, DrawingTool } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_END, DEFAULT_ARROW_START, DEFAULT_RELATION_TYPE, CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID, INITIAL_COLLECTIONS } from '../constants';
import { generateMasterPDF } from '../services/pdfService';
import { useDrawing } from '../hooks/useDrawing';
import { useCanvasViewport } from '../hooks/useCanvasViewport';
import { useModelChat } from '../hooks/useModelChat';
import { useConnectionManager } from '../hooks/useConnectionManager';
import { useCardManager } from '../hooks/useCardManager';
import { useFileSystem } from '../hooks/useFileSystem';
import { useAICanvas } from '../hooks/useAICanvas';
import { Minus, Plus, RefreshCcw, X, MousePointerClick } from 'lucide-react';
import { useWorkspace } from '../src/integrations/supabase/hooks/use-workspace';
import { uploadFileToS3 } from '../lib/supabase';
import { embeddingService } from '../services/embeddingService';
import { generateId } from '../utils/generateId';
import debugLog from '../utils/debugLog';
import { showToast } from '../utils/toast';

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
  // --- Session-level state (not owned by any hook) ---
  const [sessionName, setSessionName] = useState(session.name);
  const [collections, setCollections] = useState<Collection[]>(session.collections || INITIAL_COLLECTIONS);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(session.chatHistory || []);
  const syncedSessionIdRef = useRef<string | null>(null);
  const [sessionReady, setSessionReady] = useState(!!session.isFullyLoaded);

  const onboardingKey = `brainstorm_onboarding_v1_${user?.id ?? 'guest'}`;
  const [isNewUser] = useState(() => !localStorage.getItem(onboardingKey));
  const [showOnboarding, setShowOnboarding] = useState(() => isNewUser);
  const handleOnboardingDone = () => {
    localStorage.setItem(onboardingKey, 'done');
    setShowOnboarding(false);
  };

  // Stable refs used across hooks
  const sessionPropRef = useRef(session);
  const isDirtyRef = useRef(false);
  const cardsEmbeddingSignatureRef = useRef('');

  useEffect(() => { sessionPropRef.current = session; }, [session]);

  // --- Hook initialization order (dependency chain) ---

  // 1. Supabase sync engine
  const {
    saveWorkspace,
    hasUnsavedChanges,
    saveStatus,
    error,
    deleteCard,
    deleteConnection,
    syncUpdateCard,
    syncUpdateConnection,
    syncStroke,
    isSaving,
    isHydrated,
  } = useWorkspace(session.id, session);

  // 2. Viewport
  const { viewport, setViewport, viewportRef, screenToWorld } = useCanvasViewport();

  // 3. Drawing (needs isDirtyRef)
  const {
    strokes, setStrokes,
    currentStroke, setCurrentStroke,
    drawingTool, setDrawingTool,
    strokeColor, setStrokeColor,
    strokeRadius, setStrokeRadius,
    finalizeStroke,
  } = useDrawing(session.strokes || [], isDirtyRef, syncStroke);

  // 4. Model/chat (needs chatHistory + setChatHistory)
  const {
    apiKeys,
    persistKeys,
    selectedModelId,
    chatHistoryForModel,
    isChatProcessing,
    setIsChatProcessing,
    isHandoffProcessing,
    handoffContextRef,
    isApiKeyModalOpen,
    setIsApiKeyModalOpen,
    apiKeyModalVariant,
    requiredProvider,
    openApiKeyModal,
    ensureKeyForModel,
    handleModelChange,
  } = useModelChat({
    userId: user?.id,
    sessionId: session.id,
    sessionName,
    chatHistory,
    setChatHistory,
  });

  // 5. Connections (needs isDirtyRef + sync wrappers)
  const {
    connections, setConnections, connectionsRef,
    selectedConnectionId, setSelectedConnectionId,
    connectingFromId, setConnectingFromId,
    connColorPickerOpen, setConnColorPickerOpen,
    handleUpdateConnection,
    getSelectedConnection,
    getConnToolbarPos,
  } = useConnectionManager({
    initialConnections: session.connections,
    isDirtyRef,
    syncUpdateConnection,
    deleteConnection,
  });

  // 6. Cards (needs connectionsRef + setConnections from above)
  const {
    cards, setCards, cardsRef,
    selectedId, setSelectedId,
    newCardId,
    collectionSelectModal, setCollectionSelectModal,
    handleUpdateCard, handleDeleteCard, handleAddCard,
    finalizeCardCreation, findEmptyPosition,
    handleCollectionSelect, handleMoveCardToCollection,
    registerCardTextarea, handleMoveFocusVertical,
    addCardsBatch,
  } = useCardManager({
    initialCards: session.cards,
    isDirtyRef, syncUpdateCard, deleteCard, deleteConnection,
    connectionsRef, setConnections, collections, screenToWorld,
  });

  // 7. File system (needs handleAddCard + handleUpdateCard)
  const {
    fileSystem, setFileSystem,
    creationModal, setCreationModal,
    folderSelectModal, setFolderSelectModal,
    activeDocId, setActiveDocId,
    secondaryDocId, setSecondaryDocId,
    splitDropdownOpen, setSplitDropdownOpen,
    fullScreenImage, setFullScreenImage,
    fullScreenPdf, setFullScreenPdf,
    handleToggleFolder, handleMoveFileSystemItem, handleUploadToFolder,
    handleInitiateMoveFile, handleFolderSelect,
    handleCreateFile, handleCreateFolder, handleCreateCollection,
    handleConfirmCreation, handleSaveDoc,
    handleUploadImage, handleUploadDoc,
    handleOpenFile, handleOpenCard,
    addImageToFileSystem, findFile,
  } = useFileSystem({
    initialFileSystem: session.fileSystem,
    isDirtyRef,
    handleAddCard,
    handleUpdateCard,
    onCollectionCreate: (name) => setCollections(prev => [...prev, { id: generateId(), name }]),
  });

  // 8. AI canvas actions (needs all card/connection/chat primitives)
  const { isProcessingAI, handleGenerateAI, handleSendMessage } = useAICanvas({
    ensureKeyForModel, selectedModelId, apiKeys,
    cardsRef, connectionsRef, setConnections,
    handleAddCard, handleUpdateCard, handleDeleteCard, addCardsBatch,
    chatHistory, setChatHistory, setIsChatProcessing,
    handoffContextRef, sessionId: session.id,
  });

  // --- Canvas-only UI state (not suitable for extraction yet) ---
  const [mode, setMode] = useState<ToolMode>('select');
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [dragCardOffset, setDragCardOffset] = useState<Point>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [clickPopup, setClickPopup] = useState<{ x: number, y: number } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const activePointerIdRef = useRef<number | null>(null);
  const autoPanRestoreRef = useRef<ToolMode | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ id1: number; x1: number; y1: number; id2: number; x2: number; y2: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // --- Ensure collections + card assignments on mount ---
  useEffect(() => {
    let updatedCols = [...collections];
    let updatedCards = [...cards];
    let changed = false;
    if (updatedCols.length === 0) { updatedCols = [...INITIAL_COLLECTIONS]; changed = true; }
    updatedCards = updatedCards.map(c => {
      if (!c.collectionId) { changed = true; return { ...c, collectionId: updatedCols[0].id }; }
      return c;
    });
    if (changed) { setCollections(updatedCols); setCards(updatedCards); }
  }, []);

  // Sync session name from prop
  useEffect(() => { setSessionName(session.name); }, [session.name]);

  // Apply full session once when heavy load completes
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
      setViewport({ x: session.viewport_x, y: session.viewport_y, scale: session.viewport_zoom ?? 1 });
    }
    setSessionReady(true);
  }, [session]);

  // Merge strokes + chat on subsequent heavy-load completions
  useEffect(() => {
    if (!session.isFullyLoaded || syncedSessionIdRef.current !== session.id) return;
    if (session.chatHistory?.length) setChatHistory(session.chatHistory);
    if (session.strokes?.length) setStrokes(session.strokes);
  }, [session.id, session.isFullyLoaded, session.chatHistory, session.strokes]);

  // Embedding sync (deferred, low-priority)
  useEffect(() => {
    const sig = cards.map(c => `${c.id}|${c.text}|${c.color}|${c.content || ''}`).join('\n');
    if (cardsEmbeddingSignatureRef.current === sig) return;
    cardsEmbeddingSignatureRef.current = sig;
    const run = () => embeddingService.syncCards(cards).catch(console.error);
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 8000 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [cards]);

  // --- Auto-save ---
  useEffect(() => {
    if (!isHydrated || !sessionReady || !isDirtyRef.current) return;
    const timer = setTimeout(() => {
      isDirtyRef.current = false;
      const updatedSession: Session = {
        ...sessionPropRef.current,
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
        viewport_zoom: viewport.scale,
      };
      onSave(updatedSession);
      saveWorkspace(updatedSession);
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionName, cards, connections, fileSystem, collections, chatHistory, strokes, onSave, viewport, saveWorkspace, isHydrated, sessionReady]);

  // --- Derived values ---
  const activeDoc = useMemo((): FileSystemItem | undefined => {
    const id = activeDocId;
    if (!id) return undefined;
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = cards.find(c => c.id === cardId);
      if (card) return { id, type: 'file', name: card.text || 'Untitled Card', content: card.content || '', createdAt: Date.now() };
    } else {
      return findFile(fileSystem, id) || undefined;
    }
    return undefined;
  }, [activeDocId, cards, fileSystem, findFile]);

  const secondaryDoc = useMemo((): FileSystemItem | undefined => {
    const id = secondaryDocId;
    if (!id) return undefined;
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      const card = cards.find(c => c.id === cardId);
      if (card) return { id, type: 'file', name: card.text || 'Untitled Card', content: card.content || '', createdAt: Date.now() };
    } else {
      return findFile(fileSystem, id) || undefined;
    }
    return undefined;
  }, [secondaryDocId, cards, fileSystem, findFile]);
  const selectedConnection = getSelectedConnection();
  const connToolbarPos = selectedConnection ? getConnToolbarPos(cards) : { x: 0, y: 0 };

  // --- Handlers that stay in Workspace (cross-cutting concerns) ---

  const startConnection = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConnectingFromId(id);
    const card = cardsRef.current.find(c => c.id === id);
    if (card) setMousePos({ x: card.x, y: card.y });
  }, [setConnectingFromId]);

  const handleExportMasterPDF = useCallback(async () => {
    try {
      await generateMasterPDF(sessionName, cards, connections);
    } catch (err) {
      debugLog.error('Workspace', 'PDF export failed', err);
      showToast('Failed to export PDF. Please try again.', 'error');
    }
  }, [sessionName, cards, connections]);

  const handleExportJSON = useCallback(() => {
    const exportData = { name: sessionName, exportedAt: new Date().toISOString(), cards, connections, fileSystem, collections, strokes };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/[^\w\- ]+/g, '_')}-brainstorm.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Session exported as JSON.', 'success');
  }, [sessionName, cards, connections, fileSystem, collections, strokes]);

  // --- Canvas event handlers ---

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handlePointerDownCanvas = useCallback((e: React.PointerEvent) => {
    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouchesRef.current.size === 2) {
      const pts = Array.from(activeTouchesRef.current.entries());
      pinchRef.current = { id1: pts[0][0], x1: pts[0][1].x, y1: pts[0][1].y, id2: pts[1][0], x2: pts[1][1].x, y2: pts[1][1].y };
      setIsDragging(false);
      return;
    }
    if (!e.isPrimary) return;

    if (e.pointerType === 'touch') {
      const now = Date.now();
      const last = lastTapRef.current;
      const dist = last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) : 999;
      if (last && now - last.time < 300 && dist < 40) {
        lastTapRef.current = null;
        handleAddCard(e.clientX, e.clientY);
        return;
      }
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }

    setClickPopup(null);
    if (connectingFromId) {
      if (e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointerIdRef.current = e.pointerId;
      }
      const newId = generateId();
      handleAddCard(e.clientX, e.clientY, { id: newId });
      isDirtyRef.current = true;
      const newConnId = generateId();
      setConnections(prev => [...prev, {
        id: newConnId, fromId: connectingFromId, toId: newId,
        style: DEFAULT_CONNECTION_STYLE, arrowStart: DEFAULT_ARROW_START,
        arrowEnd: DEFAULT_ARROW_END, relationType: DEFAULT_RELATION_TYPE,
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

    if (e.button === 0 && !e.shiftKey && !e.ctrlKey) {
      if (mode === 'draw') {
        const worldMouse = screenToWorld(e.clientX, e.clientY);
        if (drawingTool === 'eraser') setMousePos(worldMouse);
        setIsDragging(true);
        setCurrentStroke({ id: generateId(), tool: drawingTool, color: strokeColor, radius: strokeRadius, points: [worldMouse] });
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
  }, [connectingFromId, mode, drawingTool, strokeColor, strokeRadius, screenToWorld, handleAddCard, setConnections, setConnectingFromId, setSelectedConnectionId, setSelectedId]);

  const handlePointerDownCard = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (!e.isPrimary) return;
    if (wrapperRef.current?.setPointerCapture) {
      wrapperRef.current.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    }
    if (connectingFromId && connectingFromId !== id) {
      isDirtyRef.current = true;
      const newConnId = generateId();
      setConnections(prev => [...prev, {
        id: newConnId, fromId: connectingFromId, toId: id,
        style: DEFAULT_CONNECTION_STYLE, arrowStart: DEFAULT_ARROW_START,
        arrowEnd: DEFAULT_ARROW_END, relationType: DEFAULT_RELATION_TYPE,
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
        const worldMouse = screenToWorld(e.clientX, e.clientY);
        setDragCardOffset({ x: card.x - worldMouse.x, y: card.y - worldMouse.y });
      }
    }
  }, [connectingFromId, mode, screenToWorld, setConnections, setConnectingFromId, setSelectedConnectionId, setSelectedId]);

  const handleCardDoubleClick = useCallback((e: React.MouseEvent, id: string) => {
    const card = cardsRef.current.find(c => c.id === id);
    if (card) handleOpenCard(card);
  }, [handleOpenCard]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchRef.current && activeTouchesRef.current.size >= 2) {
      const { id1, id2 } = pinchRef.current;
      const p1 = activeTouchesRef.current.get(id1);
      const p2 = activeTouchesRef.current.get(id2);
      if (p1 && p2) {
        const prevDist = Math.hypot(pinchRef.current.x2 - pinchRef.current.x1, pinchRef.current.y2 - pinchRef.current.y1);
        const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (prevDist > 0) setViewport(prev => ({ ...prev, scale: Math.min(Math.max(0.1, prev.scale * (newDist / prevDist)), 5) }));
        pinchRef.current = { id1, x1: p1.x, y1: p1.y, id2, x2: p2.x, y2: p2.y };
      }
      return;
    }
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return;
    if (connectingFromId || (mode === 'draw' && drawingTool === 'eraser' && !isDragging)) {
      setMousePos(screenToWorld(e.clientX, e.clientY));
    }
    if (isDragging) {
      const worldMouse = screenToWorld(e.clientX, e.clientY);
      if (mode === 'draw' && drawingTool === 'eraser') setMousePos(worldMouse);
      if (mode === 'draw' && currentStroke) {
        setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, worldMouse] } : null);
      } else if (mode === 'pan') {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
      } else if (mode === 'select' && selectedId) {
        handleUpdateCard(selectedId, { x: worldMouse.x + dragCardOffset.x, y: worldMouse.y + dragCardOffset.y });
      }
    }
  }, [connectingFromId, isDragging, mode, drawingTool, selectedId, dragStart, dragCardOffset, screenToWorld, handleUpdateCard, currentStroke]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    activeTouchesRef.current.delete(e.pointerId);
    if (pinchRef.current && (e.pointerId === pinchRef.current.id1 || e.pointerId === pinchRef.current.id2)) {
      pinchRef.current = null;
      return;
    }
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return;
    setIsDragging(false);
    activePointerIdRef.current = null;
    if (mode === 'draw' && currentStroke) finalizeStroke(currentStroke);
    if (autoPanRestoreRef.current) {
      setMode(autoPanRestoreRef.current);
      autoPanRestoreRef.current = null;
    }
  }, [mode, currentStroke, finalizeStroke]);

  const handleGripDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const card = cardsRef.current.find(c => c.id === id);
    if (!card || !e.isPrimary) return;
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    }
    setMode('select');
    setSelectedId(id);
    setIsDragging(true);
    const worldMouse = screenToWorld(e.clientX, e.clientY);
    setDragCardOffset({ x: card.x - worldMouse.x, y: card.y - worldMouse.y });
  }, [screenToWorld, setSelectedId]);

  // Native wheel — zoom/pan (passive: false required)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target) && target !== wrapperRef.current) return;
      const scrollable = target.closest('textarea, .overflow-auto, .overflow-y-auto, .overflow-scroll, .overflow-y-scroll');
      if (scrollable) {
        const el = scrollable as HTMLElement;
        if (el.scrollHeight > el.clientHeight) {
          const atTop = el.scrollTop <= 0;
          const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 1;
          if (e.deltaY < 0 && !atTop) return;
          if (e.deltaY > 0 && !atBottom) return;
        }
      }
      if (e.ctrlKey || e.metaKey || modeRef.current === 'pan') {
        e.preventDefault();
        setClickPopup(null);
        setViewport(prev => {
          const sensitivity = (modeRef.current === 'pan' && !e.ctrlKey && !e.metaKey) ? 0.0015 : 0.003;
          const newScale = Math.min(Math.max(0.1, prev.scale - e.deltaY * sensitivity), 5);
          return { ...prev, scale: newScale };
        });
      } else {
        e.preventDefault();
        setClickPopup(null);
        setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    const el = wrapperRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (target.tagName === 'TEXTAREA' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const ta = target as HTMLTextAreaElement;
        const cardId = ta.dataset.cardId;
        if (cardId) {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            handleMoveFocusVertical(cardId, e.key === 'ArrowUp' ? 'up' : 'down');
            return;
          }
          if (!e.altKey) {
            const value = ta.value || '';
            const caret = ta.selectionStart ?? 0;
            const before = value.slice(0, caret);
            const currentLineIndex = before.split('\n').length - 1;
            const totalLines = value.split('\n').length;
            if (e.key === 'ArrowUp' && currentLineIndex <= 0) {
              e.preventDefault(); e.stopPropagation();
              handleMoveFocusVertical(cardId, 'up'); return;
            }
            if (e.key === 'ArrowDown' && currentLineIndex >= totalLines - 1) {
              e.preventDefault(); e.stopPropagation();
              handleMoveFocusVertical(cardId, 'down'); return;
            }
          }
        }
      }
      if (e.code === 'Space' && !e.repeat && !isInput) setMode('pan');
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeDocId !== null || fullScreenImage !== null || creationModal.isOpen || collectionSelectModal.isOpen || isApiKeyModalOpen) return;
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
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setMode('select'); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [selectedId, selectedConnectionId, activeDocId, fullScreenImage, creationModal.isOpen, collectionSelectModal.isOpen, isApiKeyModalOpen, handleMoveFocusVertical, handleDeleteCard, deleteConnection, setConnections, setSelectedConnectionId, setConnColorPickerOpen]);

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.clipboardData) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              uploadFileToS3(blob).then(publicUrl => {
                if (publicUrl) {
                  const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                  const pos = findEmptyPosition(center.x, center.y);
                  handleAddCard(undefined, undefined, { x: pos.x, y: pos.y, image: publicUrl, height: 200, style: { ...DEFAULT_CARD_STYLE } });
                  setFileSystem(prev => addImageToFileSystem(prev, publicUrl, blob.type));
                }
              });
              e.preventDefault(); return;
            }
          }
        }
        const text = e.clipboardData.getData('text');
        if (text) {
          const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
          const pos = findEmptyPosition(center.x, center.y);
          handleAddCard(undefined, undefined, { x: pos.x, y: pos.y, text, color: '#ffffff', style: { ...DEFAULT_CARD_STYLE } });
          e.preventDefault();
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleAddCard, screenToWorld, findEmptyPosition, setFileSystem, addImageToFileSystem]);

  // Drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const docId = e.dataTransfer.getData('application/react-dnd-doc-id');
    if (docId) {
      const doc = findFile(fileSystem, docId);
      if (doc) {
        if (doc.mediaType?.startsWith('image/')) {
          handleAddCard(e.clientX, e.clientY, { image: doc.content, height: 200, style: { ...DEFAULT_CARD_STYLE } });
        } else {
          let cardText = doc.content || '';
          if (cardText.startsWith('data:')) {
            cardText = `Document: ${doc.name}`;
          } else {
            try { const p = JSON.parse(cardText); if (Array.isArray(p)) cardText = p.map((b: any) => b.text).join('\n'); } catch {}
          }
          const isPdf = doc.mediaType === 'application/pdf';
          handleAddCard(e.clientX, e.clientY, {
            text: isPdf ? '' : (cardText || doc.name), fileName: doc.name,
            color: '#f8fafc', image: isPdf ? doc.content : undefined,
            width: isPdf ? 400 : undefined, height: isPdf ? 500 : undefined,
            style: { ...DEFAULT_CARD_STYLE, fontSize: 14 },
          });
        }
      }
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file: File, index: number) => {
        uploadFileToS3(file).then(publicUrl => {
          if (!publicUrl) return;
          const dropX = e.clientX + index * 20;
          const dropY = e.clientY + index * 20;
          if (file.type.startsWith('image/')) {
            handleAddCard(dropX, dropY, { image: publicUrl, height: 200, style: { ...DEFAULT_CARD_STYLE } });
            setFileSystem(prev => addImageToFileSystem(prev, publicUrl, file.type));
          } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            handleAddCard(dropX, dropY, { fileName: file.name, text: `Document: ${file.name}`, color: '#f3f4f6' });
          } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            handleAddCard(dropX, dropY, { fileName: file.name, image: publicUrl, text: '', width: 400, height: 500, color: '#f3f4f6' });
          } else {
            handleAddCard(dropX, dropY, { fileName: file.name, text: `File: ${file.name}`, color: '#f3f4f6' });
          }
          if (!file.type.startsWith('image/')) {
            setFileSystem(prev => [...prev, { id: generateId(), type: 'file', name: file.name, content: publicUrl, mediaType: file.type || 'application/octet-stream', createdAt: Date.now() }]);
          }
        });
      });
    }
  };

  // Shards IPC (Electron)
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
      } catch (err) { console.error('Text clipper error', err); }
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
      } catch (err) { console.error('Image clipper error', err); }
    };
    const unsubText = api.onShardTextClip(handleTextClipper);
    const unsubImage = api.onShardImageClip(handleImageClipper);
    return () => { unsubText?.(); unsubImage?.(); };
  }, [handleAddCard, handleUploadImage]);

  // --- Render ---
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
        backgroundSize: `${50 * viewport.scale}px ${50 * viewport.scale}px`,
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
              e.stopPropagation(); e.preventDefault();
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
          onExportJSON={handleExportJSON}
          isSaving={isSaving || hasUnsavedChanges}
          saveStatus={saveStatus}
          error={error}
          onSave={() => {
            const updatedSession: Session = {
              ...session, name: sessionName, cards, connections, fileSystem,
              collections, chatHistory, strokes, lastModified: Date.now(),
              viewport_x: viewport.x, viewport_y: viewport.y, viewport_zoom: viewport.scale,
            };
            onSave(updatedSession);
            saveWorkspace(updatedSession);
          }}
        />
      </div>

      <div
        ref={containerRef}
        className="w-full h-full absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
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
            style={{ left: connToolbarPos.x, top: connToolbarPos.y, transform: 'translate(-50%, -50%)', transition: 'none' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 animate-in fade-in zoom-in duration-200">
              <button
                onClick={() => {
                  const isParentChild = selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT;
                  handleUpdateConnection(selectedConnection.id, { relationType: isParentChild ? RelationType.EQUIVALENCE : RelationType.PARENT_TO_CHILD });
                }}
                className="p-1 hover:bg-gray-100 rounded text-xs font-medium px-2"
              >
                {(selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT) ? 'Parent-Child' : 'Equivalence'}
              </button>
              {(selectedConnection.relationType === RelationType.PARENT_TO_CHILD || selectedConnection.relationType === RelationType.CHILD_TO_PARENT) && (
                <button
                  onClick={() => handleUpdateConnection(selectedConnection.id, {
                    relationType: selectedConnection.relationType === RelationType.PARENT_TO_CHILD ? RelationType.CHILD_TO_PARENT : RelationType.PARENT_TO_CHILD
                  })}
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
              <div className="w-px h-4 bg-gray-200 mx-1" />
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
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <label className="w-6 h-6 rounded-full border border-gray-300 shadow-sm flex items-center justify-center cursor-pointer relative overflow-hidden transition-transform hover:scale-110" title="Custom Color">
                      <input
                        type="color"
                        value={selectedConnection.color || '#3b82f6'}
                        onChange={(e) => handleUpdateConnection(selectedConnection.id, { color: e.target.value })}
                        className="opacity-0 absolute w-[200%] h-[200%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                      />
                      <div className="bg-gradient-to-tr from-rose-400 via-purple-400 to-blue-400 w-full h-full pointer-events-none absolute inset-0 mix-blend-multiply opacity-50" />
                    </label>
                  </div>
                )}
              </div>
              <div className="w-px h-4 bg-gray-200 mx-1" />
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

        {cards.map(card => (
          <ErrorBoundary
            key={card.id}
            label={`card-${card.id}`}
            fallback={
              <div style={{
                position: 'absolute', left: card.x, top: card.y, transform: 'translate(-50%, -50%)',
                width: card.width, height: 60, background: '#fef2f2', border: '1px solid #ef4444',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#ef4444', fontFamily: 'sans-serif',
              }}>
                Card render error
              </div>
            }
          >
            <CardNode
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
          </ErrorBoundary>
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
        cards={cards}
        connections={connections}
        collections={collections}
        onToggleFolder={handleToggleFolder}
        onOpenFile={handleOpenFile}
        onOpenCard={(card) => {
          setViewport({ x: window.innerWidth / 2 - card.x, y: window.innerHeight / 2 - card.y, scale: 1 });
          setSelectedId(card.id);
        }}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onCreateCollection={handleCreateCollection}
        onMoveCardToCollection={handleMoveCardToCollection}
        onRenameFile={(id, newName) => {
          setFileSystem(prev => {
            const update = (items: FileSystemItem[]): FileSystemItem[] =>
              items.map(item => item.id === id
                ? { ...item, name: newName }
                : { ...item, children: item.children ? update(item.children) : undefined }
              );
            return update(prev);
          });
        }}
        onDeleteFile={(id) => {
          const filterRecursive = (items: FileSystemItem[], targetId: string): FileSystemItem[] =>
            items.filter(item => item.id !== targetId).map(item => ({
              ...item, children: item.children ? filterRecursive(item.children, targetId) : undefined
            }));
          setFileSystem(prev => filterRecursive(prev, id));
        }}
        onInitiateMoveFile={handleInitiateMoveFile}
        onUploadToFolder={handleUploadToFolder}
        onMoveFileSystemItem={handleMoveFileSystemItem}
      />

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
        <ErrorBoundary
          label="document-editor"
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm text-center shadow-2xl">
                <p className="text-red-500 font-semibold mb-2">Document failed to load.</p>
                <button onClick={() => setActiveDocId(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Close</button>
              </div>
            </div>
          }
        >
          <div
            className="fixed inset-0 z-[60] flex flex-row items-center justify-center p-4 gap-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => { setActiveDocId(null); setSecondaryDocId(null); setSplitDropdownOpen(null); }}
            onPointerDown={(e) => e.stopPropagation()}
          >
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
        </ErrorBoundary>
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

      {cards.length === 0 && isNewUser && !showOnboarding && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none select-none"
          aria-hidden="true"
          style={{ zIndex: 1 }}
        >
          <MousePointerClick className="w-9 h-9 text-zinc-500 mb-3 animate-canvas-hint" />
          <p className="text-zinc-500 text-sm font-medium tracking-wide animate-canvas-hint">
            Double-click anywhere to add your first idea
          </p>
          <p className="text-zinc-600 text-xs mt-1 animate-canvas-hint">
            or right-click for options
          </p>
        </div>
      )}

      {showOnboarding && <OnboardingOverlay onDone={handleOnboardingDone} />}
    </div>
  );
};
