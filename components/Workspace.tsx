import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CardNode } from './CardNode';
import { ConnectionLayer } from './ConnectionLayer';
import { Sidebar } from './Controls';
import { Header } from './Header';
import { DocumentEditor } from './DocumentEditor';
import { HelpGuide } from './HelpGuide';
import { AIChat } from './AIChat';
import { SummaryModal } from './SummaryModal';
import { CreationModal } from './CreationModal';
import { CollectionSelectorModal } from './CollectionSelectorModal';
import { IdeaCard, Connection, Viewport, ToolMode, Point, ConnectionStyle, ArrowType, FileSystemItem, Session, RelationType, ChatMessage, ChatAttachment, Collection, UserProfile } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_END, DEFAULT_ARROW_START, DEFAULT_RELATION_TYPE, CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID, INITIAL_COLLECTIONS } from '../constants';
import { generateRelatedIdeas, generateProjectSummary, getChatResponse } from '../services/aiService';
import { Minus, Plus, RefreshCcw, Save, Cloud, CheckCircle, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../src/integrations/supabase/hooks/use-workspace';


const generateId = () => crypto.randomUUID();

interface WorkspaceProps {
  session: Session;
  onSave: (session: Session) => void;
  onBack: () => void;
  onGoHome: () => void;
  user?: UserProfile;
  onLogin: () => void;
  onLogout: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ session, onSave, onBack, onGoHome, user, onLogin, onLogout }) => {
  // --- State Initialized from Session ---
  const [sessionName, setSessionName] = useState(session.name);
  const [cards, setCards] = useState<IdeaCard[]>(session.cards);
  const [connections, setConnections] = useState<Connection[]>(session.connections);
  const [fileSystem, setFileSystem] = useState<FileSystemItem[]>(session.fileSystem);
  const [collections, setCollections] = useState<Collection[]>(session.collections || INITIAL_COLLECTIONS);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(session.chatHistory || []);

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
  const [mode, setMode] = useState<ToolMode>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [dragCardOffset, setDragCardOffset] = useState<Point>({ x: 0, y: 0 });
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  // Summary State
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryContent, setSummaryContent] = useState<string | null>(null);

  // Creation Modal State (Folders/Files/Collection creation)
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder' | 'collection';
    parentId: string | null;
  }>({ isOpen: false, type: 'file', parentId: null });

  // Collection Selection State (For new cards)
  const [collectionSelectModal, setCollectionSelectModal] = useState<{
    isOpen: boolean;
    pendingCard?: Partial<IdeaCard>;
    pendingPos?: Point;
  }>({ isOpen: false });

  // Chat State
  const [isChatProcessing, setIsChatProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Supabase Integration ---
  const {
    saveWorkspace,
    hasUnsavedChanges,
    saveStatus,
    lastSaved,
    error // Add this
  } = useWorkspace(session.id);

  // --- Auto-Save Effect ---
  useEffect(() => {
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

    }, 1000); // Debounce saves by 1s
    return () => clearTimeout(timer);
  }, [sessionName, cards, connections, fileSystem, collections, chatHistory, session, onSave, viewport, saveWorkspace]);


  // --- Helpers ---
  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - viewport.x) / viewport.scale,
      y: (sy - viewport.y) / viewport.scale,
    };
  }, [viewport]);

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
  const handleUpdateCard = (id: string, updates: Partial<IdeaCard>) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDeleteCard = (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdateConnection = (id: string, updates: Partial<Connection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  // === CARD CREATION LOGIC WITH COLLECTION CHECK ===
  const handleAddCard = (x?: number, y?: number, partial?: Partial<IdeaCard>) => {
    let worldPos;
    if (x !== undefined && y !== undefined) {
      worldPos = screenToWorld(x, y);
    } else {
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      const offsetX = cards.length > 0 ? (Math.random() * 60 - 30) : 0;
      const offsetY = cards.length > 0 ? (Math.random() * 60 - 30) : 0;
      worldPos = { x: center.x + offsetX, y: center.y + offsetY };
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
  };

  const finalizeCardCreation = (pos: Point, collectionId: string, partial?: Partial<IdeaCard>) => {
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
    setCards(prev => [...prev, newCard]);
    setSelectedId(newCard.id);
    setSelectedConnectionId(null);
  };

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

  const handleToggleFolder = (id: string) => {
    setFileSystem(prev => updateFileSystem(prev, id, item => ({ ...item, isOpen: !item.isOpen })));
  };

  const handleCreateFile = (parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'file', parentId });
  };

  const handleCreateFolder = (parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'folder', parentId });
  };

  const handleCreateCollection = () => {
    setCreationModal({ isOpen: true, type: 'collection' as any, parentId: null });
  };

  const handleMoveCardToCollection = (cardId: string, collectionId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, collectionId } : c));
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
      let plainText = content;
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          plainText = parsed.map((b: any) => {
            const prefix = b.style?.listType === 'bullet' ? '• ' :
              b.style?.listType === 'number' ? '1. ' : '';
            return prefix + (b.text || '');
          }).join('\n');
        }
      } catch (e) { }

      handleUpdateCard(cardId, { text: plainText, content: content });
      return;
    }
    setFileSystem(prev => updateFileSystem(prev, id, item => ({ ...item, content, name })));
  };

  const handleUploadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result as string;
        handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
          image: dataUrl,
          height: 200,
          style: { ...DEFAULT_CARD_STYLE }
        });

        const newItem: FileSystemItem = {
          id: generateId(),
          type: 'file',
          name: file.name,
          content: dataUrl,
          mediaType: file.type,
          createdAt: Date.now()
        };
        setFileSystem(prev => [...prev, newItem]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadDoc = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result as string;

        handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
          fileName: file.name,
          text: `Document: ${file.name}`,
          color: '#f3f4f6'
        });

        const newItem: FileSystemItem = {
          id: generateId(),
          type: 'file',
          name: file.name,
          content: dataUrl,
          mediaType: file.type || 'application/octet-stream',
          createdAt: Date.now()
        };
        setFileSystem(prev => [...prev, newItem]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenFile = (item: FileSystemItem) => {
    if (item.content?.startsWith('data:')) {
      const type = item.mediaType || '';
      if (type.includes('pdf') || type.includes('image/') || type.includes('text/plain')) {
        const win = window.open();
        if (win) {
          win.document.write(
            `<iframe src="${item.content}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
          );
          win.document.title = item.name;
        }
        return;
      } else {
        const link = document.createElement('a');
        link.href = item.content;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
    }
    setActiveDocId(item.id);
  };

  const handleOpenCard = (card: IdeaCard) => {
    if (card.image) return;

    if (card.fileName) {
      const fileItem = findFileByName(fileSystem, card.fileName);
      if (fileItem) {
        handleOpenFile(fileItem);
      }
      return;
    }

    if (!card.fileName) {
      setActiveDocId(`card-${card.id}`);
    }
  };

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    const summary = await generateProjectSummary(cards, connections, fileSystem);
    setSummaryContent(summary);
    setIsGeneratingSummary(false);
  };

  const handleSendMessage = async (text: string, attachments: ChatAttachment[] = []) => {
    setIsChatProcessing(true);
    const newUserMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: Date.now(),
      attachments
    };
    const updatedHistory = [...chatHistory, newUserMsg];
    setChatHistory(updatedHistory);

    const context = `
      Cards on Board:
      ${cards.map(c => `- ${c.text || c.fileName || 'Untitled Card'}`).join('\n')}
    `;

    const responseText = await getChatResponse(updatedHistory, text, context);

    const newAiMsg: ChatMessage = {
      id: generateId(),
      role: 'model',
      text: responseText,
      timestamp: Date.now()
    };
    setChatHistory([...updatedHistory, newAiMsg]);
    setIsChatProcessing(false);
  };

  // Canvas Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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

          handleAddCard(e.clientX, e.clientY, {
            text: cardText || doc.name,
            fileName: doc.name,
            color: '#f8fafc',
            style: { ...DEFAULT_CARD_STYLE, fontSize: 14 }
          });
        }
      }
    }
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (connectingFromId) {
      setConnectingFromId(null);
      return;
    }

    setSelectedConnectionId(null);
    setSelectedId(null);

    if (mode === 'pan' || e.button === 1 || e.shiftKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setMode('pan');
    }
  };

  const handleMouseDownCard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
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
      const card = cards.find(c => c.id === id);
      if (card) {
        const worldMouse = screenToWorld(e.clientX, e.clientY);
        setDragCardOffset({ x: card.x - worldMouse.x, y: card.y - worldMouse.y });
      }
    }
  };

  const handleCardDoubleClick = (e: React.MouseEvent, id: string) => {
    const card = cards.find(c => c.id === id);
    if (card) handleOpenCard(card);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldMouse = screenToWorld(e.clientX, e.clientY);
    setMousePos(worldMouse);
    if (isDragging) {
      if (mode === 'pan') {
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
  };

  const startConnection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConnectingFromId(id);
    const card = cards.find(c => c.id === id);
    if (card) setMousePos({ x: card.x, y: card.y });
  };

  const handleGenerateAI = async (sourceId: string) => {
    const sourceCard = cards.find(c => c.id === sourceId);
    if (!sourceCard || !sourceCard.text.trim()) return;
    setIsProcessingAI(true);
    const existingIdeas = cards.map(c => c.text);
    const ideas = await generateRelatedIdeas(sourceCard.text, existingIdeas);

    if (ideas.length > 0) {
      const radius = 300;
      const angleStep = Math.PI / (ideas.length + 1);
      const startAngle = -Math.PI / 2 - (angleStep * (ideas.length - 1)) / 2;
      const newCards: IdeaCard[] = [];
      const newConnections: Connection[] = [];

      const targetCollectionId = sourceCard.collectionId || collections[0]?.id || DEFAULT_COLLECTION_ID;

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
  };

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLTextAreaElement)) setMode('pan');
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedId && !(e.target instanceof HTMLTextAreaElement)) {
          handleDeleteCard(selectedId);
        } else if (selectedConnectionId && !(e.target instanceof HTMLTextAreaElement)) {
          setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
          setSelectedConnectionId(null);
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
  }, [selectedId, selectedConnectionId]);

  const selectedConnection = connections.find(c => c.id === selectedConnectionId);
  let connToolbarPos = { x: 0, y: 0 };
  if (selectedConnection) {
    const c1 = cards.find(c => c.id === selectedConnection.fromId);
    const c2 = cards.find(c => c.id === selectedConnection.toId);
    if (c1 && c2) {
      connToolbarPos = {
        x: (c1.x + c2.x) / 2,
        y: (c1.y + c2.y) / 2
      };
    }
  }

  let activeDoc: FileSystemItem | undefined;
  if (activeDocId) {
    if (activeDocId.startsWith('card-')) {
      const cardId = activeDocId.replace('card-', '');
      const card = cards.find(c => c.id === cardId);
      if (card) {
        const contentToUse = card.content || card.text;

        activeDoc = {
          id: activeDocId,
          type: 'file',
          name: card.text.substring(0, 20) || 'Untitled Card',
          content: contentToUse,
          createdAt: Date.now()
        };
      }
    } else {
      activeDoc = findFile(fileSystem, activeDocId) || undefined;
    }
  }

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Native Wheel Listener to prevent browser zoom (passive: false required)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Increased zoom sensitivity (3x faster)
        const newScale = Math.min(Math.max(0.2, viewport.scale - e.deltaY * 0.003), 3);
        setViewport(prev => ({ ...prev, scale: newScale }));
      } else {
        e.preventDefault();
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
  }, [viewport.scale]);

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 overflow-hidden bg-black select-none font-sans"
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setIsDragging(false)}
      onDoubleClick={(e) => { if (e.target === containerRef.current) handleAddCard(e.clientX, e.clientY); }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        backgroundImage: 'radial-gradient(#333333 1px, transparent 1px)',
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`
      }}
    >
      <div onMouseDown={(e) => e.stopPropagation()}>
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
        />

        {/* Sync Status Indicator */}
        <div className="absolute top-4 right-[380px] z-50 pointer-events-none transition-all duration-300">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md shadow-sm border
             ${saveStatus === 'error' ? 'bg-red-50/80 text-red-600 border-red-200' :
              hasUnsavedChanges ? 'bg-amber-50/80 text-amber-600 border-amber-200' :
                'bg-green-50/80 text-green-600 border-green-200'}
           `}>
            {saveStatus === 'error' ? <AlertCircle className="w-3 h-3" /> :
              hasUnsavedChanges ? <Cloud className="w-3 h-3 animate-pulse" /> :
                <CheckCircle className="w-3 h-3" />}

            <span>
              {saveStatus === 'error' ? 'Sync Failed' :
                hasUnsavedChanges ? 'Saving...' :
                  'Saved'}
            </span>
          </div>
          {saveStatus === 'error' && error && (
            <div className="absolute top-full right-0 mt-2 bg-red-100 text-red-800 text-xs p-2 rounded shadow-md border border-red-200 whitespace-nowrap z-50">
              {error}
            </div>
          )}
        </div>
      </div>


      <div
        ref={containerRef}
        className="w-full h-full absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        <ConnectionLayer
          connections={connections}
          cards={cards}
          connectingLine={connectingFromId ? { from: cards.find(c => c.id === connectingFromId)!, to: mousePos } : null}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={setSelectedConnectionId}
        />

        {selectedConnection && (
          <div
            className="absolute flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in duration-200"
            style={{
              left: connToolbarPos.x,
              top: connToolbarPos.y - 40,
              transform: 'translate(-50%, -50%)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-bold text-gray-400 px-2">Type</div>
            <div className="w-px h-4 bg-gray-200 mx-1"></div>
            <button
              onClick={() => handleUpdateConnection(selectedConnection.id, { relationType: RelationType.EQUIVALENCE })}
              className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${selectedConnection.relationType === RelationType.EQUIVALENCE ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600'}`}
              title="Equivalence"
            >
              &larr;&rarr; Eq
            </button>
            <button
              onClick={() => handleUpdateConnection(selectedConnection.id, { relationType: RelationType.PARENT_TO_CHILD })}
              className={`px-2 py-1 text-xs rounded hover:bg-gray-100 ${selectedConnection.relationType === RelationType.PARENT_TO_CHILD ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600'}`}
              title="Parent -> Child"
            >
              &#9675;&rarr; P-C
            </button>
          </div>
        )}

        {cards.map(card => (
          <CardNode
            key={card.id}
            card={card}
            scale={viewport.scale}
            isSelected={selectedId === card.id}
            isProcessingAI={isProcessingAI && selectedId === card.id}
            onMouseDown={handleMouseDownCard}
            onDoubleClick={handleCardDoubleClick}
            onUpdate={handleUpdateCard}
            onDelete={handleDeleteCard}
            onConnectStart={startConnection}
            onGenerateAI={handleGenerateAI}
          />
        ))}
      </div>

      <div onMouseDown={(e) => e.stopPropagation()}>
        <Sidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          mode={mode}
          setMode={setMode}
          onAddCard={() => handleAddCard()}
          onUploadImage={handleUploadImage}
          onUploadDoc={handleUploadDoc}
          onGenerateSummary={handleGenerateSummary}
          fileSystem={fileSystem}
          cards={cards}
          connections={connections}
          collections={collections}
          onToggleFolder={handleToggleFolder}
          onOpenFile={handleOpenFile}
          onOpenCard={handleOpenCard}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onCreateCollection={handleCreateCollection}
          onMoveCardToCollection={handleMoveCardToCollection}
          isGeneratingSummary={isGeneratingSummary}
        />
      </div>

      <div onMouseDown={(e) => e.stopPropagation()}>
        <HelpGuide />
      </div>

      <div onMouseDown={(e) => e.stopPropagation()}>
        <AIChat
          history={chatHistory}
          onSendMessage={handleSendMessage}
          isProcessing={isChatProcessing}
        />
      </div>

      {summaryContent && (
        <SummaryModal
          content={summaryContent}
          onClose={() => setSummaryContent(null)}
        />
      )}

      {/* NEW CREATION MODAL - Generic for files/folders/collections */}
      <CreationModal
        isOpen={creationModal.isOpen}
        type={creationModal.type === 'collection' ? 'session' : creationModal.type} // Cheat to reuse session icon/color style for collection, or we could update CreationModal.tsx
        initialValue={creationModal.type === 'collection' ? 'New Collection' : undefined}
        onClose={() => setCreationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmCreation}
      />

      {/* COLLECTION SELECTOR MODAL - For forcing selection on card create */}
      <CollectionSelectorModal
        isOpen={collectionSelectModal.isOpen}
        collections={collections}
        onSelect={handleCollectionSelect}
        onCancel={() => setCollectionSelectModal({ isOpen: false })}
      />

      <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-white p-2 rounded-xl shadow-lg border border-gray-100 z-50" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={() => setViewport(prev => ({ ...prev, scale: Math.max(0.2, prev.scale - 0.1) }))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg"><Minus className="w-4 h-4" /></button>
        <span className="w-12 text-center text-sm font-medium text-gray-600">{Math.round(viewport.scale * 100)}%</span>
        <button onClick={() => setViewport(prev => ({ ...prev, scale: Math.min(2, prev.scale + 0.1) }))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg"><Plus className="w-4 h-4" /></button>
        <div className="w-px h-6 bg-gray-200 mx-2" />
        <button onClick={() => setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 })} className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg"><RefreshCcw className="w-4 h-4" /></button>
      </div>

      {connectingFromId && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg z-50 text-sm font-semibold animate-bounce pointer-events-none">
          Select another card to connect
        </div>
      )}

      {activeDoc && (
        <DocumentEditor
          doc={activeDoc}
          onSave={handleSaveDoc}
          onClose={() => setActiveDocId(null)}
        />
      )}
    </div>
  );
};