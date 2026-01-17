import { Pinecone } from '@pinecone-database/pinecone';
import { v4 as uuidv4 } from 'uuid';
import { contextLogger } from '../logger/enhanced-logger';
import { pipeline } from '@xenova/transformers';

export interface MemoryEntry {
  id: string;
  agentId: string;
  role: string;
  content: string;
  keyInsights: string[];
  decisions: string[];
  artifacts: string[];
  timestamp: number;
  workflowId?: string;
  metadata: Record<string, any>;
}

export interface PineconeConfig {
  api_key?: string;
  index_name: string;
  namespace: string;
  dimension: number;
  embedding_provider?: 'openai' | 'local';
}

export interface RelevantMemory {
  agentId: string;
  role: string;
  content: string;
  keyInsights: string[];
  decisions: string[];
  timestamp: number;
  score: number;
}

export class PersistentMemoryManager {
  private pinecone: Pinecone | null = null;
  private indexName: string;
  private namespace: string;
  private dimension: number;
  private embeddingProvider: 'openai' | 'local';
  private initialized: boolean = false;

  constructor(private config: PineconeConfig) {
    this.indexName = config.index_name;
    this.namespace = config.namespace;
    this.dimension = config.dimension;
    this.embeddingProvider = config.embedding_provider || 'local';

    contextLogger.info({
      event: 'MEMORY_MANAGER_CREATED',
      embeddingProvider: this.embeddingProvider,
      dimension: this.dimension,
    }, `📦 Memory manager using ${this.embeddingProvider} embeddings (${this.dimension}D)`);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const apiKey = this.config.api_key || process.env.PINECONE_API_KEY;
      
      if (!apiKey) {
        contextLogger.warn({
          event: 'PERSISTENT_MEMORY_DISABLED',
        }, '⚠️ Pinecone API key not provided - persistent memory disabled');
        return;
      }

      this.pinecone = new Pinecone({ apiKey });

      // Check if index exists
      const indexes = await this.pinecone.listIndexes();
      const existingIndex = indexes.indexes?.find(idx => idx.name === this.indexName);

      if (existingIndex) {
        // Check if dimensions match
        const existingDimension = existingIndex.dimension;
        if (existingDimension !== this.dimension) {
          contextLogger.warn({
            event: 'INDEX_DIMENSION_MISMATCH',
            indexName: this.indexName,
            existingDimension,
            requiredDimension: this.dimension,
          }, `⚠️ Index dimension mismatch (${existingDimension} vs ${this.dimension}) - deleting and recreating`);

          // Delete the old index
          await this.pinecone.deleteIndex(this.indexName);
          contextLogger.info({
            event: 'INDEX_DELETED',
            indexName: this.indexName,
          }, `🗑️ Deleted old index: ${this.indexName}`);

          // Wait for deletion to complete
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          contextLogger.info({
            event: 'INDEX_EXISTS',
            indexName: this.indexName,
            dimension: this.dimension,
          }, `✅ Using existing index: ${this.indexName} (${this.dimension}D)`);
          this.initialized = true;
          return;
        }
      }

      // Create new index
      contextLogger.info({
        event: 'CREATING_PINECONE_INDEX',
        indexName: this.indexName,
        dimension: this.dimension,
      }, `🗄️ Creating Pinecone index: ${this.indexName} (${this.dimension}D)`);

      await this.pinecone.createIndex({
        name: this.indexName,
        dimension: this.dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      // Wait for index to be ready
      contextLogger.info({
        event: 'WAITING_FOR_INDEX',
        indexName: this.indexName,
      }, `⏳ Waiting for index to be ready...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      this.initialized = true;

      contextLogger.info({
        event: 'PERSISTENT_MEMORY_INITIALIZED',
        indexName: this.indexName,
        namespace: this.namespace,
        dimension: this.dimension,
        embeddingProvider: this.embeddingProvider,
      }, `✅ Persistent memory initialized with ${this.embeddingProvider} embeddings (${this.dimension}D)`);
    } catch (error) {
      contextLogger.error({
        event: 'PERSISTENT_MEMORY_INIT_ERROR',
        error: error instanceof Error ? error.message : String(error),
      }, `❌ Failed to initialize persistent memory`);
      this.initialized = false;
    }
  }

  async storeMemory(entry: MemoryEntry, embedding: number[]): Promise<void> {
    if (!this.initialized || !this.pinecone) {
      contextLogger.debug({
        event: 'MEMORY_STORE_SKIPPED',
        reason: 'not_initialized',
      }, '⏭️ Skipping memory storage - not initialized');
      return;
    }

    try {
      const index = this.pinecone.index(this.indexName);

      await index.namespace(this.namespace).upsert([
        {
          id: entry.id,
          values: embedding,
          metadata: {
            agentId: entry.agentId,
            role: entry.role,
            content: entry.content.substring(0, 40000), // Pinecone metadata limit
            keyInsights: JSON.stringify(entry.keyInsights),
            decisions: JSON.stringify(entry.decisions),
            artifacts: JSON.stringify(entry.artifacts),
            timestamp: entry.timestamp,
            workflowId: entry.workflowId || '',
            ...entry.metadata,
          },
        },
      ]);

      contextLogger.info({
        event: 'MEMORY_STORED',
        memoryId: entry.id,
        agentId: entry.agentId,
        role: entry.role,
      }, `💾 Stored memory for agent: ${entry.agentId}`);
    } catch (error) {
      contextLogger.error({
        event: 'MEMORY_STORE_ERROR',
        agentId: entry.agentId,
        error: error instanceof Error ? error.message : String(error),
      }, `❌ Failed to store memory for agent: ${entry.agentId}`);
    }
  }

  async queryRelevantMemories(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<RelevantMemory[]> {
    if (!this.initialized || !this.pinecone) {
      contextLogger.debug({
        event: 'MEMORY_QUERY_SKIPPED',
        reason: 'not_initialized',
      }, '⏭️ Skipping memory query - not initialized');
      return [];
    }

    try {
      const index = this.pinecone.index(this.indexName);

      const queryResponse = await index.namespace(this.namespace).query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter,
      });

      const memories: RelevantMemory[] = queryResponse.matches.map((match: any) => {
        const metadata = match.metadata || {};
        return {
          agentId: metadata.agentId || '',
          role: metadata.role || '',
          content: metadata.content || '',
          keyInsights: metadata.keyInsights ? JSON.parse(metadata.keyInsights) : [],
          decisions: metadata.decisions ? JSON.parse(metadata.decisions) : [],
          timestamp: metadata.timestamp || 0,
          score: match.score || 0,
        };
      });

      contextLogger.info({
        event: 'MEMORY_QUERY_COMPLETE',
        resultsCount: memories.length,
        topScore: memories[0]?.score || 0,
      }, `🔍 Retrieved ${memories.length} relevant memories`);

      return memories;
    } catch (error) {
      contextLogger.error({
        event: 'MEMORY_QUERY_ERROR',
        error: error instanceof Error ? error.message : String(error),
      }, `❌ Failed to query memories`);
      return [];
    }
  }

  async queryMemoriesWithText(
    queryText: string,
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<RelevantMemory[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      contextLogger.info({
        event: 'QUERYING_MEMORIES',
        queryText: queryText.substring(0, 100),
        topK,
      }, `🔍 Querying memories: "${queryText.substring(0, 50)}..."`);

      const embedding = await createEmbedding(queryText, this.embeddingProvider);
      const memories = await this.queryRelevantMemories(embedding, topK, filter);

      if (memories.length > 0) {
        contextLogger.info({
          event: 'MEMORIES_FOUND',
          count: memories.length,
          topScore: memories[0]?.score || 0,
        }, `✅ Found ${memories.length} relevant memories (top score: ${(memories[0]?.score || 0).toFixed(3)})`);
      } else {
        contextLogger.debug({
          event: 'NO_MEMORIES_FOUND',
        }, `ℹ️ No relevant memories found`);
      }

      return memories;
    } catch (error) {
      contextLogger.error({
        event: 'MEMORY_QUERY_TEXT_ERROR',
        error: error instanceof Error ? error.message : String(error),
      }, `❌ Failed to query memories with text`);
      return [];
    }
  }

  async deleteMemoriesByWorkflow(workflowId: string): Promise<void> {
    if (!this.initialized || !this.pinecone) {
      return;
    }

    try {
      const index = this.pinecone.index(this.indexName);

      await index.namespace(this.namespace).deleteMany({
        filter: { workflowId: { $eq: workflowId } },
      });

      contextLogger.info({
        event: 'WORKFLOW_MEMORIES_DELETED',
        workflowId,
      }, `🗑️ Deleted memories for workflow: ${workflowId}`);
    } catch (error) {
      contextLogger.error({
        event: 'MEMORY_DELETE_ERROR',
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      }, `❌ Failed to delete workflow memories`);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getEmbeddingProvider(): 'openai' | 'local' {
    return this.embeddingProvider;
  }

  getDimension(): number {
    return this.dimension;
  }
}

// Simple in-memory cache for embeddings
class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private maxSize = 100; // Cache up to 100 embeddings

  get(text: string): number[] | undefined {
    return this.cache.get(text);
  }

  set(text: string, embedding: number[]): void {
    // Simple LRU: if cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, embedding);
  }

  has(text: string): boolean {
    return this.cache.has(text);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global embedding cache and rate limiter
const embeddingCache = new EmbeddingCache();
let lastEmbeddingCall = 0;
const EMBEDDING_RATE_LIMIT_MS = 100; // Minimum 100ms between calls

// Lazy-loaded transformer model
let transformerModel: any = null;
let transformerLoading: Promise<any> | null = null;

async function getTransformerModel() {
  if (transformerModel) {
    return transformerModel;
  }

  if (transformerLoading) {
    return transformerLoading;
  }

  transformerLoading = (async () => {
    try {
      contextLogger.info({
        event: 'TRANSFORMER_MODEL_LOADING',
      }, '📥 Loading local sentence transformer model...');

      // Use a small, fast model (384 dimensions)
      transformerModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

      contextLogger.info({
        event: 'TRANSFORMER_MODEL_LOADED',
      }, '✅ Local transformer model loaded successfully');

      return transformerModel;
    } catch (error) {
      contextLogger.error({
        event: 'TRANSFORMER_MODEL_ERROR',
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Failed to load transformer model');
      throw error;
    }
  })();

  return transformerLoading;
}

// Utility function to create embeddings using local transformers (NO API CALLS)
async function createLocalEmbedding(text: string): Promise<number[]> {
  try {
    const model = await getTransformerModel();

    // Generate embedding
    const output = await model(text, { pooling: 'mean', normalize: true });

    // Convert to regular array
    const embedding = Array.from(output.data) as number[];

    contextLogger.debug({
      event: 'LOCAL_EMBEDDING_CREATED',
      textLength: text.length,
      dimension: embedding.length,
    }, '✅ Created local embedding (no API call)');

    return embedding;
  } catch (error) {
    contextLogger.error({
      event: 'LOCAL_EMBEDDING_ERROR',
      error: error instanceof Error ? error.message : String(error),
    }, '❌ Failed to create local embedding');

    // Fallback to zero vector
    return new Array(384).fill(0);
  }
}

// Utility function to create embeddings using OpenAI API
async function createOpenAIEmbedding(text: string, openaiApiKey?: string): Promise<number[]> {
  const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    contextLogger.warn({
      event: 'OPENAI_KEY_MISSING',
    }, '⚠️ No OpenAI API key - falling back to local embeddings');
    return createLocalEmbedding(text);
  }

  // Rate limiting: wait if needed
  const now = Date.now();
  const timeSinceLastCall = now - lastEmbeddingCall;
  if (timeSinceLastCall < EMBEDDING_RATE_LIMIT_MS) {
    const waitTime = EMBEDDING_RATE_LIMIT_MS - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastEmbeddingCall = Date.now();

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Main embedding creation function with caching and provider selection
export async function createEmbedding(
  text: string,
  provider: 'openai' | 'local' = 'local',
  openaiApiKey?: string
): Promise<number[]> {
  // Check cache first
  const cacheKey = `${provider}:${text}`;
  if (embeddingCache.has(cacheKey)) {
    contextLogger.debug({
      event: 'EMBEDDING_CACHE_HIT',
      provider,
      textLength: text.length,
    }, '💾 Using cached embedding');
    return embeddingCache.get(cacheKey)!;
  }

  try {
    let embedding: number[];

    if (provider === 'local') {
      contextLogger.debug({
        event: 'USING_LOCAL_EMBEDDINGS',
      }, '🏠 Using local sentence transformers (no API calls)');
      embedding = await createLocalEmbedding(text);
    } else {
      contextLogger.debug({
        event: 'USING_OPENAI_EMBEDDINGS',
      }, '☁️ Using OpenAI embeddings API');
      embedding = await createOpenAIEmbedding(text, openaiApiKey);
    }

    // Cache the result
    embeddingCache.set(cacheKey, embedding);

    contextLogger.debug({
      event: 'EMBEDDING_CREATED',
      provider,
      textLength: text.length,
      dimension: embedding.length,
    }, `✅ Created and cached ${provider} embedding`);

    return embedding;
  } catch (error) {
    contextLogger.error({
      event: 'EMBEDDING_CREATION_ERROR',
      provider,
      error: error instanceof Error ? error.message : String(error),
    }, `❌ Failed to create ${provider} embedding`);

    // Fallback strategy
    if (provider === 'openai') {
      contextLogger.warn({
        event: 'FALLING_BACK_TO_LOCAL',
      }, '⚠️ OpenAI failed, trying local embeddings');
      try {
        const localEmbedding = await createLocalEmbedding(text);
        embeddingCache.set(cacheKey, localEmbedding);
        return localEmbedding;
      } catch {
        // Ultimate fallback
        return new Array(384).fill(0);
      }
    }

    // Return zero vector as ultimate fallback
    const dimension = provider === 'local' ? 384 : 1536;
    return new Array(dimension).fill(0);
  }
}

// Export cache for testing/debugging
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  contextLogger.info({
    event: 'EMBEDDING_CACHE_CLEARED',
  }, '🧹 Embedding cache cleared');
}
