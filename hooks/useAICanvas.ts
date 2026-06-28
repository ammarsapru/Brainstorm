import { useState, useRef, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { IdeaCard, Connection, ChatMessage, ChatAttachment, APIKeys, CardKind, Viewport } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_START, DEFAULT_ARROW_END, DEFAULT_RELATION_TYPE, CARD_WIDTH, CARD_HEIGHT, DEFAULT_CARD_STYLE, DEFAULT_COLLECTION_ID } from '../constants';
import { generateRelatedIdeas, getChatResponse } from '../services/aiService';
import { saveChatMessage } from '../services/chatService';
import { filterHistoryForModel } from '../utils/chatModelThread';
import { generateId } from '../utils/generateId';
import { showToast } from '../utils/toast';
import debugLog from '../utils/debugLog';
import { ConnectionStyle, ArrowType } from '../types';
import { parseDocContent } from '../utils/pdfContentParser';
import { extractPdfTextViaGemini } from '../utils/pdfTextExtractor';

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
  viewportRef: MutableRefObject<Viewport>;
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  syncUpdateConnection: (conn: Connection) => void;
  deleteConnection: (id: string) => void;
  handleUpdateConnection: (id: string, updates: Partial<Connection>) => void;
  handleAddCard: (x?: number, y?: number, partial?: Partial<IdeaCard>) => void;
  handleUpdateCard: (id: string, updates: Partial<IdeaCard>) => void;
  handleDeleteCard: (id: string) => void;
  addCardsBatch: (cards: IdeaCard[]) => void;
  panToCards: (ids: string[]) => void;
  chatHistory: ChatMessage[];
  setChatHistory: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsChatProcessing: Dispatch<SetStateAction<boolean>>;
  handoffContextRef: MutableRefObject<string | null>;
  sessionId: string;
}

// ─── File content extraction ──────────────────────────────────────────────────

const TEXT_EXTS = /\.(txt|md|markdown|js|jsx|ts|tsx|py|java|go|rs|rb|php|swift|kt|cs|cpp|c|h|hpp|html|htm|css|scss|sass|json|xml|yaml|yml|toml|sh|bash|sql|csv|r|scala|lua|dart|vue|svelte|env|gitignore|lock|cfg|ini|conf)$/i;

const isTextFile = (name: string) => TEXT_EXTS.test(name);

const fetchTextFile = async (url: string, name: string): Promise<string | null> => {
  if (!isTextFile(name)) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const text = await res.text();
    const MAX = 60_000;
    return text.length > MAX ? text.slice(0, MAX) + '\n[truncated at 60,000 chars]' : text;
  } catch { return null; }
};


/** Resolve non-image file attachments to inline text context. Returns extra text to append. */
const resolveAttachmentTexts = async (attachments: ChatAttachment[]): Promise<string> => {
  const parts: string[] = [];
  for (const att of attachments) {
    if (att.type === 'image') continue;
    const name = att.name || 'file';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') {
      showToast('Extracting PDF text...', 'info', 4000);
      try {
        const text = await extractPdfText(att.url);
        parts.push(text
          ? `[PDF content from "${name}"]:\n${text}`
          : `[PDF "${name}" — pages loaded but no text found; may be a scanned/image-only PDF]`);
      } catch (e) {
        debugLog.error('useAICanvas', 'PDF extraction error', e);
        parts.push(`[PDF "${name}" — could not extract text (${e instanceof Error ? e.message : 'unknown error'})]`);
      }
    } else if (isTextFile(name)) {
      const text = await fetchTextFile(att.url, name);
      if (text) parts.push(`[File content from "${name}"]:\n\`\`\`${ext}\n${text}\n\`\`\``);
    } else {
      parts.push(`[Attached file: "${name}" — ${att.url}]`);
    }
  }
  return parts.join('\n\n');
};

// ─── Canvas spatial helpers ───────────────────────────────────────────────────

/** Returns a world-space point below and centred on all existing cards. */
const suggestEmptyPosition = (cards: IdeaCard[]): { x: number; y: number } => {
  if (!cards.length) return { x: 400, y: 200 };
  const maxY = Math.max(...cards.map(c => c.y + (c.height || CARD_HEIGHT)));
  const avgX = cards.reduce((s, c) => s + c.x, 0) / cards.length;
  return { x: Math.round(avgX), y: Math.round(maxY + 240) };
};

// ─── AI actions JSON extraction ─────────────────────────────────────────────────

interface ActionsBlock {
  raw: string;   // the JSON substring (may be missing closers if truncated)
  start: number; // index in the source text where the object begins
  end: number;   // index just past the located block
}

/**
 * Locate the `{ ... "actions": [ ... ] ... }` object inside a model response
 * using string-aware bracket matching rather than a greedy regex. This is
 * robust to: prose before/after the JSON, newlines/indentation inside the
 * JSON, and — crucially — a missing final `}` (models frequently forget it).
 */
const locateActionsBlock = (text: string): ActionsBlock | null => {
  const keyIdx = text.indexOf('"actions"');
  if (keyIdx === -1) return null;

  const objStart = text.lastIndexOf('{', keyIdx);
  const arrStart = text.indexOf('[', keyIdx);
  if (objStart === -1 || arrStart === -1) return null;

  // Bracket-match the actions array, ignoring brackets inside strings.
  let depth = 0;
  let inStr = false;
  let escaped = false;
  let arrEnd = -1;
  for (let i = arrStart; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { arrEnd = i; break; }
    }
  }

  if (arrEnd === -1) {
    // Truncated array — take everything from the object start onward.
    return { raw: text.slice(objStart), start: objStart, end: text.length };
  }

  // Include the root object's closing `}` if present (skip whitespace after `]`).
  let j = arrEnd + 1;
  while (j < text.length && /\s/.test(text[j])) j++;
  const end = text[j] === '}' ? j + 1 : arrEnd + 1;
  return { raw: text.slice(objStart, end), start: objStart, end };
};

/**
 * Best-effort repair of truncated/unbalanced JSON: closes any open strings
 * and appends missing `]`/`}` closers so JSON.parse can succeed when a model
 * forgets a trailing bracket.
 */
const repairJson = (raw: string): string => {
  const stack: string[] = [];
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = raw;
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, ''); // drop a dangling trailing comma
  while (stack.length) out += stack.pop();
  return out;
};

/** Parse an actions block, attempting a repair pass if the raw JSON is invalid. */
const parseActions = (raw: string): { actions: unknown[] } | null => {
  for (const candidate of [raw, repairJson(raw)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.actions)) return parsed;
    } catch { /* try the repaired candidate next */ }
  }
  return null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAICanvas({
  ensureKeyForModel,
  selectedModelId,
  apiKeys,
  cardsRef,
  connectionsRef,
  viewportRef,
  setConnections,
  syncUpdateConnection,
  deleteConnection,
  handleUpdateConnection,
  handleAddCard,
  handleUpdateCard,
  handleDeleteCard,
  addCardsBatch,
  panToCards,
  chatHistory,
  setChatHistory,
  setIsChatProcessing,
  handoffContextRef,
  sessionId,
}: UseAICanvasOptions): UseAICanvasResult {
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const lastBrainstormRef = useRef<number>(0);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  // Cache extracted file content so we don't re-parse on every message send
  const fileContentCacheRef = useRef<Map<string, string>>(new Map());

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
          kind: 'text',
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
      newConns.forEach(conn => syncUpdateConnection(conn));
      setTimeout(() => panToCards(newCards.map(c => c.id)), 150);
    }
    setIsProcessingAI(false);
  }, [ensureKeyForModel, selectedModelId, apiKeys, cardsRef, addCardsBatch, setConnections, syncUpdateConnection, panToCards]);

  const handleSendMessage = useCallback(async (
    text: string,
    attachments: ChatAttachment[] = [],
    modelId: string = selectedModelId
  ) => {
    if (!ensureKeyForModel(modelId)) throw new Error('MISSING_API_KEY');

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

    // ── Resolve file/PDF attachments to inline text ──────────────────────────
    const attachmentContext = await resolveAttachmentTexts(attachments);
    const enrichedMessage = attachmentContext
      ? `${text}\n\n${attachmentContext}`
      : text;

    // ── Build canvas context ─────────────────────────────────────────────────
    const truncate = (str: string, max = 60) =>
      str.length > max ? str.substring(0, max).replace(/\n/g, ' ') + '...' : str.replace(/\n/g, ' ');

    const getBodySnippet = (card: IdeaCard): string => {
      if (!card.content) return '';
      const blocks = parseDocContent(card.content);
      const bodyText = blocks
        .map(b => b.text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim())
        .filter(Boolean)
        .join(' ');
      if (!bodyText.trim()) return '';
      // File/PDF cards get a much larger preview so the AI has real context;
      // text cards get a shorter snippet to keep the context concise.
      const maxChars = card.kind === 'file' ? 3000 : 200;
      if (bodyText.length > maxChars) {
        return ` | body_preview:"${bodyText.slice(0, maxChars)}..." [TRUNCATED — use read_card for full content]`;
      }
      return ` | body:"${bodyText}"`;
    };

    const cardLines = cardsRef.current
      .map(c => {
        let kindTag: string;
        if (c.kind === 'file') kindTag = `[file/${c.fileSubtype || 'other'} "${c.fileName || ''}"]`;
        else if (c.kind === 'image') kindTag = `[image "${c.fileName || c.url || ''}"]`;
        else if (c.kind === 'label') kindTag = `[label]`;
        else if (c.kind === 'browser') kindTag = `[browser "${c.url || ''}"]`;
        else kindTag = `[text]`;
        const title = truncate(c.text || c.fileName || 'Untitled');
        const snippet = (c.kind === 'text' || c.kind === 'file') ? getBodySnippet(c) : '';
        return `- [${c.id}] ${kindTag} "${title}"${snippet} color:${c.color} pos:(${Math.round(c.x)},${Math.round(c.y)})`;
      })
      .join('\n');

    const connLines = connectionsRef.current.length > 0
      ? `\nConnections (${connectionsRef.current.length}):\n` +
        connectionsRef.current.slice(0, 30).map(c =>
          `- [${c.id}] ${c.fromId} -> ${c.toId} style:${c.style}${c.color ? ` color:${c.color}` : ''} relation:${c.relationType}`
        ).join('\n')
      : '\nConnections: none yet';

    // Proactively inject full text of every file card.
    // Extraction priority: LlamaParse (best) → Gemini vision → stored pdfjs text.
    // Results are cached so re-extraction only happens once per card per session.
    const fileCards = cardsRef.current.filter(c => c.kind === 'file');
    const fileContentParts: string[] = [];

    for (const c of fileCards) {
      const cardName = c.text || c.fileName || 'Untitled';
      const cacheKey = `${c.id}:${c.url || ''}`;

      let extractedText = fileContentCacheRef.current.get(cacheKey);

      if (!extractedText) {
        // Stored pdfjs content (extracted at upload time)
        let storedText = '';
        if (c.content) {
          const blocks = parseDocContent(c.content);
          storedText = blocks
            .map(b => b.text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim())
            .filter(Boolean)
            .join('\n');
        }

        if (c.url && apiKeys.llamacloud) {
          try {
            showToast(`Reading "${cardName}" with LlamaParse…`, 'info', 6000);
            const { extractPdfTextViaLlamaParse } = await import('../utils/pdfTextExtractor');
            extractedText = await extractPdfTextViaLlamaParse(c.url, apiKeys.llamacloud);
          } catch (e) {
            debugLog.warn('useAICanvas', 'LlamaParse failed, trying Gemini', e);
          }
        }

        if (!extractedText && c.url && apiKeys.gemini) {
          try {
            showToast(`Reading "${cardName}" with Gemini vision…`, 'info', 6000);
            extractedText = await extractPdfTextViaGemini(c.url, apiKeys.gemini);
          } catch (e) {
            debugLog.warn('useAICanvas', 'Gemini extraction failed, using stored content', e);
          }
        }

        if (!extractedText) extractedText = storedText;
        if (extractedText) fileContentCacheRef.current.set(cacheKey, extractedText);
      }

      if (extractedText) {
        const MAX = 25_000;
        const body = extractedText.length > MAX
          ? extractedText.slice(0, MAX) + '\n[truncated]'
          : extractedText;
        fileContentParts.push(`=== FILE: "${cardName}" [id:${c.id}] ===\n${body}\n=== END FILE ===`);
      }
    }

    const fileContentBlock = fileContentParts.length > 0
      ? '\n\n' + fileContentParts.join('\n\n')
      : '';

    const vp = viewportRef.current;
    const vpCenterX = Math.round((window.innerWidth / 2 - vp.x) / vp.scale);
    const vpCenterY = Math.round((window.innerHeight / 2 - vp.y) / vp.scale);
    const suggested = suggestEmptyPosition(cardsRef.current);

    const context = `Canvas (${cardsRef.current.length} cards):
Viewport center: world(${vpCenterX},${vpCenterY}) zoom:${vp.scale.toFixed(2)}
Suggested position for new cards: (${suggested.x},${suggested.y})
Cards:
${cardLines}${connLines}${fileContentBlock}`;

    const truncatedHistory = filterHistoryForModel(chatHistory, modelId).slice(-10);

    let responseText: string;
    try {
      responseText = await getChatResponse(
        truncatedHistory.filter(m => !m.isHandoff),
        enrichedMessage,
        context,
        apiKeys,
        modelId,
        { handoffContext: handoffContextRef.current ?? undefined, signal: controller.signal, attachments }
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

    // Locate and strip the actions JSON FIRST — independent of whether it
    // parses — so the raw dictionary never leaks into the chat message even
    // when the model emits malformed/truncated JSON.
    const block = locateActionsBlock(responseText);
    let actionsExecuted = false;
    if (block) {
      const before = responseText.slice(0, block.start).trim();
      const after = responseText.slice(block.end).trim();
      // Post-action confirmation (text after the JSON) is preferred — the
      // pre-amble is usually a disallowed "I will create…" announcement.
      finalDisplayMsg = after || before;
    }

    try {
      const parsed = block ? parseActions(block.raw) : null;
      if (parsed) {
        {
          actionsExecuted = true;
          const tempIdToRealId = new Map<string, string>();
          let batchCards: IdeaCard[] = [];

          parsed.actions.forEach((action: any) => {
            if (action.type === 'create_cards' && Array.isArray(action.cards)) {
              const count = action.cards.length;
              const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
              const existing = cardsRef.current;
              const fallbackPos = suggestEmptyPosition(existing);
              const baseX = fallbackPos.x - (cols * (CARD_WIDTH + 60)) / 2;
              const baseY = fallbackPos.y;

              const cards: IdeaCard[] = action.cards.map((cardData: any, idx: number) => {
                const realId = generateId();
                if (cardData.id) tempIdToRealId.set(String(cardData.id), realId);
                const col = idx % cols;
                const row = Math.floor(idx / cols);

                const kind: CardKind = (['text', 'label', 'image', 'file', 'browser'] as CardKind[])
                  .includes(cardData.kind) ? (cardData.kind as CardKind) : 'text';

                return {
                  id: realId,
                  x: cardData.x ?? (baseX + col * (CARD_WIDTH + 360)),
                  y: cardData.y ?? (baseY + row * (CARD_HEIGHT + 300)),
                  text: cardData.text || 'New Idea',
                  content: cardData.content,
                  color: cardData.color || '#ffffff',
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  style: { ...DEFAULT_CARD_STYLE },
                  collectionId: DEFAULT_COLLECTION_ID,
                  kind,
                  ...(cardData.url      && { url: cardData.url }),
                  ...(cardData.fileName && { fileName: cardData.fileName }),
                  ...(kind === 'file' && cardData.fileSubtype && { fileSubtype: cardData.fileSubtype }),
                  ...(kind === 'label' && (['rectangle', 'diamond', 'circle', 'square'] as const).includes(cardData.shape)
                    && { shape: cardData.shape }),
                  createdAt: Date.now(),
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
                const toId   = tempIdToRealId.get(String(conn.toId))   ?? conn.toId;
                const fromValid = cardsRef.current.some(c => c.id === fromId) || batchIds.has(fromId);
                const toValid   = cardsRef.current.some(c => c.id === toId)   || batchIds.has(toId);
                if (fromId && toId && fromValid && toValid) {
                  const validStyles    = ['solid', 'dashed', 'dotted'];
                  const validRelations = ['equivalence', 'parent-child', 'child-parent'];
                  newConns.push({
                    id: generateId(),
                    fromId,
                    toId,
                    style: validStyles.includes(conn.style) ? conn.style : DEFAULT_CONNECTION_STYLE,
                    color: conn.color || undefined,
                    arrowStart: DEFAULT_ARROW_START,
                    arrowEnd:   DEFAULT_ARROW_END,
                    relationType: validRelations.includes(conn.relationType) ? conn.relationType : DEFAULT_RELATION_TYPE,
                  });
                }
              });
              if (newConns.length > 0) {
                setConnections(prev => [...prev, ...newConns]);
                newConns.forEach(conn => syncUpdateConnection(conn));
              }
            }

            if (action.type === 'update_connections' && Array.isArray(action.updates)) {
              const validStyles    = ['solid', 'dashed', 'dotted'];
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
              (action.ids as string[])
                .filter(id => connectionsRef.current.some(c => c.id === id))
                .forEach(id => deleteConnection(id));
            }
          });

          // Pan to newly created cards after state has settled
          if (batchCards.length > 0) {
            setTimeout(() => panToCards(batchCards.map(c => c.id)), 150);
          }
        }
      }
    } catch (e) {
      debugLog.error('useAICanvas', 'Failed to parse AI actions payload', e);
    }

    finalDisplayMsg = finalDisplayMsg
      .replace(/```[a-zA-Z]*\s*```/g, '')
      .replace(/```[a-zA-Z]*/g, '')
      .trim();

    if (!finalDisplayMsg) finalDisplayMsg = actionsExecuted ? 'Done.' : "I've updated your canvas!";

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
    cardsRef, connectionsRef, viewportRef, setConnections, handleUpdateConnection,
    syncUpdateConnection, deleteConnection,
    setChatHistory, setIsChatProcessing, handoffContextRef,
    addCardsBatch, panToCards,
  ]);

  return { isProcessingAI, handleGenerateAI, handleSendMessage };
}
