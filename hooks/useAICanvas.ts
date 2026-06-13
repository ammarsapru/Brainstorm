import { useState, useRef, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { IdeaCard, Connection, ChatMessage, ChatAttachment, APIKeys } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_START, DEFAULT_ARROW_END, DEFAULT_RELATION_TYPE, CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID } from '../constants';
import { generateRelatedIdeas, getChatResponse } from '../services/aiService';
import { saveChatMessage } from '../services/chatService';
import { filterHistoryForModel } from '../utils/chatModelThread';
import { generateId } from '../utils/generateId';
import { showToast } from '../utils/toast';
import debugLog from '../utils/debugLog';
import { ConnectionStyle, ArrowType } from '../types';

export interface UseAICanvasResult {
  isProcessingAI: boolean;
  handleGenerateAI: (sourceId: string) => Promise<void>;
  handleSendMessage: (text: string, attachments?: ChatAttachment[], modelId?: string) => Promise<void>;
}

interface UseAICanvasOptions {
  ensureKeyForModel: (modelId: string) => boolean;
  selectedModelId: string;
  apiKeys: APIKeys;
  cardsRef: MutableRefObject<IdeaCard[]>;
  connectionsRef: MutableRefObject<Connection[]>;
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  handleUpdateConnection: (id: string, updates: Partial<Connection>) => void;
  handleAddCard: (x?: number, y?: number, partial?: Partial<IdeaCard>) => void;
  handleUpdateCard: (id: string, updates: Partial<IdeaCard>) => void;
  handleDeleteCard: (id: string) => void;
  addCardsBatch: (cards: IdeaCard[]) => void;
  chatHistory: ChatMessage[];
  setChatHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsChatProcessing: Dispatch<SetStateAction<boolean>>;
  handoffContextRef: MutableRefObject<string | null>;
  sessionId: string;
}

export function useAICanvas({
  ensureKeyForModel,
  selectedModelId,
  apiKeys,
  cardsRef,
  connectionsRef,
  setConnections,
  handleUpdateConnection,
  handleAddCard,
  handleUpdateCard,
  handleDeleteCard,
  addCardsBatch,
  chatHistory,
  setChatHistory,
  setIsChatProcessing,
  handoffContextRef,
  sessionId,
}: UseAICanvasOptions): UseAICanvasResult {
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const lastBrainstormRef = useRef<number>(0);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  const handleGenerateAI = useCallback(async (sourceId: string) => {
    const sourceCard = cardsRef.current.find(c => c.id === sourceId);
    if (!sourceCard || !sourceCard.text.trim()) return;
    if (!ensureKeyForModel(selectedModelId)) return;

    const now = Date.now();
    if (now - lastBrainstormRef.current < 2000) {
      showToast('Please wait a moment before brainstorming again.', 'info');
      return;
    }
    lastBrainstormRef.current = now;

    setIsProcessingAI(true);
    const existingIdeas = cardsRef.current.map(c => c.text);
    const ideas = await generateRelatedIdeas(selectedModelId, apiKeys, sourceCard.text, existingIdeas);

    if (ideas.length > 0) {
      const radius = 300;
      const angleStep = Math.PI / (ideas.length + 1);
      const startAngle = -Math.PI / 2 - (angleStep * (ideas.length - 1)) / 2;
      const targetCollectionId = sourceCard.collectionId || DEFAULT_COLLECTION_ID;

      const newCards: IdeaCard[] = [];
      const newConns: Connection[] = [];

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
          collectionId: targetCollectionId,
          cardType: 'note',
        });
        newConns.push({
          id: generateId(),
          fromId: sourceId,
          toId: id,
          style: ConnectionStyle.DASHED,
          arrowStart: ArrowType.NONE,
          arrowEnd: ArrowType.STANDARD,
          relationType: DEFAULT_RELATION_TYPE,
        });
      });

      addCardsBatch(newCards);
      setConnections(prev => [...prev, ...newConns]);
    }
    setIsProcessingAI(false);
  }, [ensureKeyForModel, selectedModelId, apiKeys, cardsRef, addCardsBatch, setConnections]);

  const handleSendMessage = useCallback(async (
    text: string,
    attachments: ChatAttachment[] = [],
    modelId: string = selectedModelId
  ) => {
    if (!ensureKeyForModel(modelId)) throw new Error('MISSING_API_KEY');

    // Cancel any in-flight request before starting a new one
    chatAbortControllerRef.current?.abort();
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

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
    const userSave = await saveChatMessage(sessionId, newUserMsg);
    if (!userSave.ok) {
      debugLog.error('useAICanvas', 'Failed to save user message', userSave.error);
      showToast('Message could not be saved to history.', 'error');
    }

    const truncate = (str: string, max = 60) =>
      str.length > max ? str.substring(0, max).replace(/\n/g, ' ') + '…' : str.replace(/\n/g, ' ');
    const cardLines = cardsRef.current
      .map(c => `- [${c.id}] "${truncate(c.text || c.fileName || 'Untitled')}" color:${c.color} pos:(${Math.round(c.x)},${Math.round(c.y)})`)
      .join('\n');
    const connLines = connectionsRef.current.length > 0
      ? `\nConnections (${connectionsRef.current.length}):\n` +
        connectionsRef.current.slice(0, 30).map(c =>
          `- [${c.id}] ${c.fromId} → ${c.toId} style:${c.style}${c.color ? ` color:${c.color}` : ''} relation:${c.relationType}`
        ).join('\n')
      : '\nConnections: none yet';
    const context = `Canvas (${cardsRef.current.length} cards):\n${cardLines}${connLines}`;

    const truncatedHistory = filterHistoryForModel(chatHistory, modelId).slice(-10);

    let responseText: string;
    try {
      responseText = await getChatResponse(
        truncatedHistory.filter(m => !m.isHandoff),
        text,
        context,
        apiKeys,
        modelId,
        { handoffContext: handoffContextRef.current ?? undefined, signal: controller.signal }
      );
    } catch (err: any) {
      setIsChatProcessing(false);
      if (err?.name !== 'AbortError') {
        showToast('AI request failed. Please try again.', 'error');
      }
      return;
    }
    handoffContextRef.current = null;

    let finalDisplayMsg = responseText;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*"actions"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.actions && Array.isArray(parsed.actions)) {
          finalDisplayMsg = responseText.replace(jsonMatch[0], '').trim();

          // Maps AI-provided temp ids (e.g. "c1") to real UUIDs generated here.
          // Populated by create_cards, consumed by connect_cards in the same response.
          const tempIdToRealId = new Map<string, string>();
          let batchCards: IdeaCard[] = [];

          parsed.actions.forEach((action: any) => {
            if (action.type === 'create_cards' && Array.isArray(action.cards)) {
              const count = action.cards.length;
              const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
              const existing = cardsRef.current;
              // Place below the lowest existing card, centered on their x midpoint
              const baseX = existing.length > 0
                ? existing.reduce((s, c) => s + c.x, 0) / existing.length - (cols * (CARD_WIDTH + 60)) / 2
                : 200;
              const baseY = existing.length > 0
                ? Math.max(...existing.map(c => c.y + (c.height || CARD_HEIGHT))) + 100
                : 200;

              const cards: IdeaCard[] = action.cards.map((cardData: any, idx: number) => {
                const realId = generateId();
                if (cardData.id) tempIdToRealId.set(String(cardData.id), realId);
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                return {
                  id: realId,
                  x: baseX + col * (CARD_WIDTH + 360),
                  y: baseY + row * (CARD_HEIGHT + 300),
                  text: cardData.text || 'New Idea',
                  content: cardData.content,
                  color: cardData.color || '#ffffff',
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  style: { ...DEFAULT_CARD_STYLE },
                  collectionId: DEFAULT_COLLECTION_ID,
                  cardType: 'note' as const,
                };
              });
              batchCards = [...batchCards, ...cards];
              addCardsBatch(cards);
            }
            if (action.type === 'update_cards' && Array.isArray(action.updates)) {
              action.updates.forEach((updateData: any) => {
                if (updateData.id && cardsRef.current.some(c => c.id === updateData.id)) {
                  handleUpdateCard(updateData.id, updateData);
                }
              });
            }
            if (action.type === 'delete_cards' && Array.isArray(action.ids)) {
              (action.ids as string[])
                .filter(id => cardsRef.current.some(c => c.id === id))
                .forEach((id: string) => handleDeleteCard(id));
            }
            if (action.type === 'connect_cards' && Array.isArray(action.connections)) {
              const batchIds = new Set(batchCards.map(c => c.id));
              const newConns: Connection[] = [];
              action.connections.forEach((conn: any) => {
                const fromId = tempIdToRealId.get(String(conn.fromId)) ?? conn.fromId;
                const toId = tempIdToRealId.get(String(conn.toId)) ?? conn.toId;
                const fromValid = cardsRef.current.some(c => c.id === fromId) || batchIds.has(fromId);
                const toValid = cardsRef.current.some(c => c.id === toId) || batchIds.has(toId);
                if (fromId && toId && fromValid && toValid) {
                  const validStyles = ['solid', 'dashed', 'dotted'];
                  const validRelations = ['equivalence', 'parent-child', 'child-parent'];
                  newConns.push({
                    id: generateId(),
                    fromId,
                    toId,
                    style: validStyles.includes(conn.style) ? conn.style : DEFAULT_CONNECTION_STYLE,
                    color: conn.color || undefined,
                    arrowStart: DEFAULT_ARROW_START,
                    arrowEnd: DEFAULT_ARROW_END,
                    relationType: validRelations.includes(conn.relationType) ? conn.relationType : DEFAULT_RELATION_TYPE,
                  });
                }
              });
              if (newConns.length > 0) setConnections(prev => [...prev, ...newConns]);
            }
            if (action.type === 'update_connections' && Array.isArray(action.updates)) {
              const validStyles = ['solid', 'dashed', 'dotted'];
              const validRelations = ['equivalence', 'parent-child', 'child-parent'];
              action.updates.forEach((upd: any) => {
                if (upd.id && connectionsRef.current.some(c => c.id === upd.id)) {
                  const updates: Partial<Connection> = {};
                  if (upd.style && validStyles.includes(upd.style)) updates.style = upd.style;
                  if (upd.color !== undefined) updates.color = upd.color || undefined;
                  if (upd.relationType && validRelations.includes(upd.relationType)) updates.relationType = upd.relationType;
                  handleUpdateConnection(upd.id, updates);
                }
              });
            }
            if (action.type === 'delete_connections' && Array.isArray(action.ids)) {
              const toDelete = new Set(action.ids as string[]);
              setConnections(prev => prev.filter(c => !toDelete.has(c.id)));
            }
          });
        }
      }
    } catch (e) {
      debugLog.error('useAICanvas', 'Failed to parse AI actions payload', e);
    }

    finalDisplayMsg = finalDisplayMsg
      .replace(/```[a-zA-Z]*\s*```/g, '')
      .replace(/```[a-zA-Z]*/g, '')
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
    const assistantSave = await saveChatMessage(sessionId, assistantMsg);
    if (!assistantSave.ok) {
      debugLog.error('useAICanvas', 'Failed to save assistant message', assistantSave.error);
      showToast('Reply could not be saved to history.', 'error');
    }
  }, [
    chatHistory, apiKeys, ensureKeyForModel, selectedModelId,
    sessionId, handleAddCard, handleUpdateCard, handleDeleteCard,
    cardsRef, connectionsRef, setConnections, handleUpdateConnection,
    setChatHistory, setIsChatProcessing, handoffContextRef, addCardsBatch,
  ]);

  return { isProcessingAI, handleGenerateAI, handleSendMessage };
}
