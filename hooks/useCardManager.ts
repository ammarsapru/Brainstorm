import { useState, useRef, useEffect, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { IdeaCard, Connection, Collection, Point } from '../types';
import { CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID } from '../constants';
import { generateId } from '../utils/generateId';

export interface UseCardManagerResult {
  cards: IdeaCard[];
  setCards: Dispatch<SetStateAction<IdeaCard[]>>;
  cardsRef: MutableRefObject<IdeaCard[]>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  newCardId: string | null;
  collectionSelectModal: { isOpen: boolean; pendingCard?: Partial<IdeaCard>; pendingPos?: Point };
  setCollectionSelectModal: Dispatch<SetStateAction<{ isOpen: boolean; pendingCard?: Partial<IdeaCard>; pendingPos?: Point }>>;
  handleUpdateCard: (id: string, updates: Partial<IdeaCard>) => void;
  handleDeleteCard: (id: string) => void;
  handleAddCard: (x?: number, y?: number, partial?: Partial<IdeaCard>) => void;
  finalizeCardCreation: (pos: Point, collectionId: string, partial?: Partial<IdeaCard>) => void;
  findEmptyPosition: (startX: number, startY: number) => Point;
  handleCollectionSelect: (collectionId: string) => void;
  handleMoveCardToCollection: (cardId: string, collectionId: string) => void;
  registerCardTextarea: (cardId: string, el: HTMLTextAreaElement | null) => void;
  handleMoveFocusVertical: (fromCardId: string, direction: 'up' | 'down') => void;
  addCardsBatch: (newCards: IdeaCard[]) => void;
}

interface UseCardManagerOptions {
  initialCards: IdeaCard[];
  isDirtyRef: MutableRefObject<boolean>;
  syncUpdateCard: (card: IdeaCard) => void;
  deleteCard: (id: string) => void;
  deleteConnection: (id: string) => void;
  connectionsRef: MutableRefObject<Connection[]>;
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  collections: Collection[];
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
}

export function useCardManager({
  initialCards,
  isDirtyRef,
  syncUpdateCard,
  deleteCard,
  deleteConnection,
  connectionsRef,
  setConnections,
  collections,
  screenToWorld,
}: UseCardManagerOptions): UseCardManagerResult {
  const [cards, setCards] = useState<IdeaCard[]>(initialCards);
  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [collectionSelectModal, setCollectionSelectModal] = useState<{
    isOpen: boolean;
    pendingCard?: Partial<IdeaCard>;
    pendingPos?: Point;
  }>({ isOpen: false });

  const cardTextareaMapRef = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  const handleUpdateCard = useCallback((id: string, updates: Partial<IdeaCard>) => {
    isDirtyRef.current = true;
    const existing = cardsRef.current.find(c => c.id === id);
    if (existing) syncUpdateCard({ ...existing, ...updates });
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [isDirtyRef, syncUpdateCard]);

  const handleDeleteCard = useCallback((id: string) => {
    isDirtyRef.current = true;
    deleteCard(id);
    const associated = connectionsRef.current.filter(c => c.fromId === id || c.toId === id);
    associated.forEach(c => deleteConnection(c.id));
    setCards(prev => prev.filter(c => c.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, [deleteCard, deleteConnection, connectionsRef, setConnections]);

  const findEmptyPosition = useCallback((startX: number, startY: number): Point => {
    const PADDING = 20;
    const CHECK_WIDTH = CARD_WIDTH + PADDING;
    const CHECK_HEIGHT = CARD_HEIGHT + PADDING;

    const isColliding = (x: number, y: number) =>
      cardsRef.current.some(card =>
        Math.abs(card.x - x) < CHECK_WIDTH && Math.abs(card.y - y) < CHECK_HEIGHT
      );

    if (!isColliding(startX, startY)) return { x: startX, y: startY };

    let angle = 0;
    let radius = 50;
    const maxRadius = 2000;
    const angleIncrement = 0.5;
    const radiusIncrement = 10;

    while (radius < maxRadius) {
      const x = startX + radius * Math.cos(angle);
      const y = startY + radius * Math.sin(angle);
      if (!isColliding(x, y)) return { x, y };
      angle += angleIncrement;
      radius += radiusIncrement / (2 * Math.PI);
    }
    return { x: startX + 50, y: startY + 50 };
  }, []);

  const finalizeCardCreation = useCallback((pos: Point, collectionId: string, partial?: Partial<IdeaCard>) => {
    isDirtyRef.current = true;
    const newCard: IdeaCard = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      text: '',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      color: '#ffffff',
      style: { ...DEFAULT_CARD_STYLE },
      collectionId,
      cardType: 'note',
      ...partial,
    };
    cardsRef.current = [...cardsRef.current, newCard];
    setCards(prev => {
      if (prev.find(c => c.id === newCard.id)) return prev;
      return [...prev, newCard];
    });
    setSelectedId(newCard.id);
    setNewCardId(newCard.id);
    setTimeout(() => setNewCardId(null), 400);
  }, [isDirtyRef]);

  const handleAddCard = useCallback((x?: number, y?: number, partial?: Partial<IdeaCard>) => {
    let worldPos: Point;
    if (x !== undefined && y !== undefined) {
      const rawPos = screenToWorld(x, y);
      worldPos = findEmptyPosition(rawPos.x, rawPos.y);
    } else {
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
      worldPos = findEmptyPosition(center.x, center.y);
    }

    if (collections.length <= 1) {
      finalizeCardCreation(worldPos, collections[0]?.id || DEFAULT_COLLECTION_ID, partial);
    } else {
      setCollectionSelectModal({ isOpen: true, pendingPos: worldPos, pendingCard: partial });
    }
  }, [collections, screenToWorld, findEmptyPosition, finalizeCardCreation]);

  const handleCollectionSelect = useCallback((collectionId: string) => {
    setCollectionSelectModal(prev => {
      if (prev.pendingPos) {
        finalizeCardCreation(prev.pendingPos, collectionId, prev.pendingCard);
      }
      return { isOpen: false };
    });
  }, [finalizeCardCreation]);

  const handleMoveCardToCollection = useCallback((cardId: string, collectionId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, collectionId } : c));
  }, []);

  const registerCardTextarea = useCallback((cardId: string, el: HTMLTextAreaElement | null) => {
    const map = cardTextareaMapRef.current;
    if (el) map.set(cardId, el);
    else map.delete(cardId);
  }, []);

  const focusCardTextarea = useCallback((cardId: string) => {
    cardTextareaMapRef.current.get(cardId)?.focus();
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
      const score = Math.abs(c.y - from.y) * 10000 + Math.abs(c.x - from.x);
      if (score < bestScore) { bestScore = score; bestId = c.id; }
    }
    return bestId;
  }, []);

  const handleMoveFocusVertical = useCallback((fromCardId: string, direction: 'up' | 'down') => {
    const nextId = findNearestCardVertical(fromCardId, direction);
    if (!nextId) return;
    setSelectedId(nextId);
    requestAnimationFrame(() => focusCardTextarea(nextId));
  }, [findNearestCardVertical, focusCardTextarea]);

  // Batch-create cards from AI brainstorm (bypasses collection modal, queues each for sync)
  const addCardsBatch = useCallback((newCards: IdeaCard[]) => {
    isDirtyRef.current = true;
    newCards.forEach(card => syncUpdateCard(card));
    cardsRef.current = [...cardsRef.current, ...newCards];
    setCards(prev => [...prev, ...newCards]);
  }, [isDirtyRef, syncUpdateCard]);

  return {
    cards, setCards, cardsRef,
    selectedId, setSelectedId,
    newCardId,
    collectionSelectModal, setCollectionSelectModal,
    handleUpdateCard,
    handleDeleteCard,
    handleAddCard,
    finalizeCardCreation,
    findEmptyPosition,
    handleCollectionSelect,
    handleMoveCardToCollection,
    registerCardTextarea,
    handleMoveFocusVertical,
    addCardsBatch,
  };
}
