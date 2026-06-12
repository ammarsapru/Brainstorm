import debugLog from '../utils/debugLog';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

interface StoredCard {
  id: string;
  text: string;
  color: string;
  content?: string;
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

  async syncCards(cards: StoredCard[]) {
    const activeIds = new Set(cards.map(c => c.id));
    this.vectors = this.vectors.filter(v => activeIds.has(v.id));

    for (const card of cards) {
      const existing = this.vectors.find(v => v.id === card.id);
      const searchableContext = `ID: ${card.id}. Color: ${card.color}. Title: ${card.text}. Content: ${card.content || 'None'}`;

      if (!existing || existing.text !== card.text || existing.color !== card.color || existing.content !== card.content) {
        try {
          const vec = await this.generateEmbedding(searchableContext);
          if (existing) {
            existing.text = card.text;
            existing.color = card.color;
            existing.content = card.content;
            existing.vector = vec;
          } else {
            this.vectors.push({ id: card.id, text: card.text, color: card.color, content: card.content, vector: vec });
          }
        } catch (e) {
          debugLog.warn('EmbeddingService', 'Failed to vectorize card', card.id);
        }
      }
    }
  }

  async searchSimilar(query: string, topK = 3, threshold = 0.2): Promise<CardMatch[]> {
    if (this.vectors.length === 0) return [];
    try {
      const queryVector = await this.generateEmbedding(query);
      return this.vectors
        .map(v => ({
          card: { id: v.id, text: v.text, color: v.color, content: v.content },
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
    return this.vectors.map(v => `[ID: ${v.id}, Color: ${v.color}, Text: ${v.text}]`).join('\n');
  }

  async getCardById(id: string): Promise<StoredCard | null> {
    const match = this.vectors.find(v => v.id === id);
    if (!match) return null;
    return { id: match.id, text: match.text, color: match.color, content: match.content };
  }
}

export const embeddingService = new EmbeddingService();
