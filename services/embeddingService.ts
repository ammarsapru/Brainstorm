import { IdeaCard } from '../types';
import debugLog from '../utils/debugLog';

// We use all-MiniLM-L6-v2 which is highly capable and tiny (22MB)
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

export interface CardMatch {
  card: IdeaCard;
  score: number;
}

class EmbeddingService {
  private extractor: any = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  
  // The In-Memory Mirror
  private vectors: { id: string; card: IdeaCard; vector: number[] }[] = [];

  constructor() {}

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
        debugLog.error("EmbeddingService", "Failed to load embedding model:", err);
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generates a mathematical vector from a string of text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    if (!this.extractor) throw new Error("Embedding model failed to initialize.");
    
    // We pool the last hidden state (mean pooling) and normalize the result for cosine similarity bounds
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Syncs a list of cards to the in-memory array. 
   * It skips cards that are already perfectly matched, 
   * and vectorizes ones that are missing or whose text changed.
   */
  async syncCards(cards: IdeaCard[]) {
    // Collect active IDs
    const activeIds = new Set(cards.map(c => c.id));

    // Remove deleted cards
    this.vectors = this.vectors.filter(v => activeIds.has(v.id));

    // Add or update cards
    for (const card of cards) {
      const existing = this.vectors.find(v => v.id === card.id);
      // Construct the metadata payload to vectorize so it knows color/content
      const searchableContext = `ID: ${card.id}. Color: ${card.color}. Title: ${card.text}. Content: ${card.content || 'None'}`;

      // If the card doesn't exist, or its text/color/content was modified:
      if (!existing || existing.card.text !== card.text || existing.card.color !== card.color || existing.card.content !== card.content) {
        try {
          const vec = await this.generateEmbedding(searchableContext);
          
          if (existing) {
             existing.card = { ...card };
             existing.vector = vec;
          } else {
             this.vectors.push({ id: card.id, card: { ...card }, vector: vec });
          }
        } catch(e) {
          debugLog.warn("EmbeddingService", "Failed to vectorize card", card.id);
        }
      }
    }
  }

  /**
   * RAG tool: Search for the most semantically relevant cards to the query
   */
  async searchSimilar(query: string, topK: number = 3, threshold: number = 0.2): Promise<CardMatch[]> {
    if (this.vectors.length === 0) return [];
    
    try {
      const queryVector = await this.generateEmbedding(query);
      
      const results: CardMatch[] = this.vectors.map(v => {
        return {
          card: v.card,
          score: this.cosineSimilarity(queryVector, v.vector)
        };
      });

      // Filter by threshold and sort by match score
      return results
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch(e) {
      console.error("Embedding search failed", e);
      return [];
    }
  }
  
  // Allow AI to get a dump of the whole board for initial context injection
  getAllCardsContext(): string {
     return this.vectors.map(v => `[ID: ${v.card.id}, Color: ${v.card.color}, Text: ${v.card.text}]`).join('\n');
  }

  // Fetch a specific card by ID for the read_card action
  async getCardById(id: string): Promise<IdeaCard | null> {
    const match = this.vectors.find(v => v.id === id);
    return match ? match.card : null;
  }
}

export const embeddingService = new EmbeddingService();
