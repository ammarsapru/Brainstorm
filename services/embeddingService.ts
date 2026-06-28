import debugLog from '../utils/debugLog';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

interface StoredCard {
  id: string;
  text: string;
  color: string;
  content?: string;
  kind?: string;
  fileSubtype?: string;
  fileName?: string;
  url?: string;
}

interface StoredVector extends StoredCard {
  vector: number[];
}

export interface CardMatch {
  card: StoredCard;
  score: number;
}

class EmbeddingService {
  private extractor: unknown = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  // Store only the fields needed for search context — avoids duplicating full IdeaCard state
  private vectors: StoredVector[] = [];

  async init() {
    if (this.extractor) return;
    if (this.initPromise) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = (async () => {
      try {
        debugLog('EmbeddingService', 'Loading embedding model...');
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        this.extractor = await pipeline('feature-extraction', MODEL_NAME);
        debugLog('EmbeddingService', 'Embedding model loaded successfully.');
      } catch (err) {
        debugLog.error('EmbeddingService', 'Failed to load embedding model:', err);
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    if (!this.extractor) throw new Error('Embedding model failed to initialize.');
    const output = await (this.extractor as (text: string, opts: Record<string, unknown>) => Promise<{ data: number[] }>)(
      text, { pooling: 'mean', normalize: true }
    );
    return Array.from(output.data);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private parseContentToText(content?: string): string {
    if (!content) return '';
    try {
      const blocks = JSON.parse(content);
      if (Array.isArray(blocks)) {
        return blocks
          .map((b: { text?: string }) => (b.text || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim())
          .filter(Boolean)
          .join(' ');
      }
    } catch { /* not DocBlock JSON */ }
    return content;
  }

  async syncCards(cards: StoredCard[]) {
    const activeIds = new Set(cards.map(c => c.id));
    this.vectors = this.vectors.filter(v => activeIds.has(v.id));

    for (const card of cards) {
      const existing = this.vectors.find(v => v.id === card.id);
      const bodyText = this.parseContentToText(card.content);
      const kindInfo = card.kind === 'file'
        ? `Type: ${card.kind}/${card.fileSubtype || 'other'}, File: ${card.fileName || ''}.`
        : card.kind === 'image'
        ? `Type: image, File: ${card.fileName || ''}.`
        : `Type: ${card.kind || 'text'}.`;
      const searchableContext = `${kindInfo} Title: ${card.text || card.fileName || ''}. Color: ${card.color}. Content: ${bodyText || 'None'}`;

      const changed = !existing
        || existing.text !== card.text
        || existing.color !== card.color
        || existing.content !== card.content
        || existing.fileName !== card.fileName
        || existing.kind !== card.kind;

      if (changed) {
        try {
          const vec = await this.generateEmbedding(searchableContext);
          if (existing) {
            existing.text = card.text;
            existing.color = card.color;
            existing.content = card.content;
            existing.kind = card.kind;
            existing.fileSubtype = card.fileSubtype;
            existing.fileName = card.fileName;
            existing.url = card.url;
            existing.vector = vec;
          } else {
            this.vectors.push({ id: card.id, text: card.text, color: card.color, content: card.content, kind: card.kind, fileSubtype: card.fileSubtype, fileName: card.fileName, url: card.url, vector: vec });
          }
        } catch (e) {
          debugLog.warn('EmbeddingService', 'Failed to vectorize card', card.id);
        }
      }
    }
  }

  async searchSimilar(query: string, topK = 5, threshold = 0.2): Promise<CardMatch[]> {
    if (this.vectors.length === 0) return [];
    try {
      const queryVector = await this.generateEmbedding(query);
      return this.vectors
        .map(v => ({
          card: { id: v.id, text: v.text, color: v.color, content: v.content, kind: v.kind, fileSubtype: v.fileSubtype, fileName: v.fileName },
          score: this.cosineSimilarity(queryVector, v.vector),
        }))
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (e) {
      debugLog.error('EmbeddingService', 'Embedding search failed', e);
      return [];
    }
  }

  getAllCardsContext(): string {
    return this.vectors.map(v => `[ID: ${v.id}, Kind: ${v.kind || 'text'}, File: ${v.fileName || ''}, Text: ${v.text}]`).join('\n');
  }

  async getCardById(id: string): Promise<StoredCard | null> {
    const match = this.vectors.find(v => v.id === id);
    if (!match) return null;
    return { id: match.id, text: match.text, color: match.color, content: match.content, kind: match.kind, fileSubtype: match.fileSubtype, fileName: match.fileName, url: match.url };
  }
}

export const embeddingService = new EmbeddingService();
