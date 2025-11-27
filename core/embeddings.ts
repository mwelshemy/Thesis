/**
 * Embedding generation using your local DeepSeek FastAPI server
 * With persistent vector storage
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredEmbedding {
  text: string;
  embedding: number[];
  timestamp: number;
  metadata: {
    filename?: string;
    filepath?: string;
    language?: string;
    lineNumber?: number;
  };
}

export interface EmbeddingCache {
  version: string;
  workspaceHash: string;
  embeddings: { [key: string]: StoredEmbedding };
  created: number;
  lastUpdated: number;
}

// Type definitions for API responses
interface DeepSeekEmbeddingResponse {
  embedding?: number[];
  vector?: number[];
  error?: string;
  note?: string;
}

interface DeepSeekGenerationResponse {
  generated_text?: string;
  generated_code?: string;
  error?: string;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Use your existing FastAPI server for embeddings
    return await generateDeepSeekEmbedding(text);
  } catch (error) {
    return generateHighQualityLocalEmbedding(text);
  }
}

async function generateDeepSeekEmbedding(text: string): Promise<number[]> {
  try {
    // First, check if server is responsive with a quick health check
    try {
      const healthResponse = await fetch('http://localhost:8000/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000) // 2 second timeout for health check
      });
      
      if (!healthResponse.ok) {
        return generateHighQualityLocalEmbedding(text);
      }
    } catch (healthError) {
      return generateHighQualityLocalEmbedding(text);
    }

    // If server is healthy, try the embedding request with shorter timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Reduced to 5 seconds
    
    const response = await fetch('http://localhost:8000/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.substring(0, 1000) // Reduced length
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data: DeepSeekEmbeddingResponse = await response.json();
    
    const embedding = data.embedding || data.vector;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response format');
    }
    
    return normalizeEmbedding(embedding);
  } catch (error) {
    return generateHighQualityLocalEmbedding(text);
  }
}

// COMPLETELY REPLACE the local embedding function with this:
function generateHighQualityLocalEmbedding(text: string): number[] {
  const words = text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 1)
    .filter(w => !STOP_WORDS.has(w));
  
  const embedding = new Array(2048).fill(0);
  
  // Enhanced semantic hashing with multiple hash functions
  words.forEach(word => {
    // Use multiple hash functions for better distribution
    for (let i = 0; i < 3; i++) {
      const hash = simpleHash(word + i.toString()) % 2048;
      embedding[hash] += 1.0 / (i + 1); // Decreasing weights
    }
  });
  
  // Boost for semantic concepts
  const lowerText = text.toLowerCase();
  const concepts = extractSemanticConcepts(lowerText);
  
  Object.entries(concepts).forEach(([concept, weight]) => {
    const hash = simpleHash(concept) % 2048;
    embedding[hash] += weight;
  });
  
  // Boost for code structure patterns
  if (lowerText.includes('function') || lowerText.match(/(const|let|var)\s+\w+\s*=\s*\(/)) {
    const hash = simpleHash('function_pattern') % 2048;
    embedding[hash] += 2.0;
  }
  
  if (lowerText.includes('class') || lowerText.includes('interface')) {
    const hash = simpleHash('class_pattern') % 2048;
    embedding[hash] += 2.0;
  }
  
  if (lowerText.includes('sort') || lowerText.includes('order') || lowerText.includes('arrange')) {
    const hash = simpleHash('sorting_pattern') % 2048;
    embedding[hash] += 3.0; // Higher boost for sorting-related terms
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}


// Semantic clusters for code understanding
const SEMANTIC_CLUSTERS: {[key: string]: string[]} = {
  // Configuration concepts
  'config': ['configuration', 'settings', 'options', 'properties', 'preferences'],
  'settings': ['config', 'options', 'preferences', 'parameters'],
  'options': ['settings', 'config', 'choices', 'parameters'],
  
  // Function concepts
  'function': ['method', 'procedure', 'routine', 'func'],
  'method': ['function', 'procedure', 'operation'],
  
  // Algorithm concepts  
  'sort': ['ordering', 'arrange', 'organize', 'bubble', 'quick', 'merge'],
  'search': ['find', 'lookup', 'seek', 'query', 'binary', 'linear'],
  'filter': ['screen', 'select', 'sieve', 'refine'],
  
  // Data concepts
  'array': ['list', 'collection', 'sequence'],
  'object': ['map', 'dictionary', 'hash', 'keyvalue'],
  
  // UI concepts
  'component': ['widget', 'element', 'control', 'view'],
  'button': ['click', 'press', 'action', 'submit'],
  
  // API concepts
  'api': ['endpoint', 'interface', 'rest', 'http'],
  'endpoint': ['api', 'route', 'url', 'path']
};

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an', 
  'this', 'that', 'with', 'by', 'as', 'from'
]);

function extractSemanticConcepts(text: string): {[key: string]: number} {
  const lowerText = text.toLowerCase();
  const concepts: {[key: string]: number} = {};
  
  // Code structure concepts
  if (lowerText.includes('function') || lowerText.includes('const') || lowerText.includes('let')) {
    concepts.function = 2.0;
  }
  if (lowerText.includes('class') || lowerText.includes('interface')) {
    concepts.class = 1.5;
  }
  if (lowerText.includes('export') || lowerText.includes('import')) {
    concepts.module = 1.0;
  }
  
  // Configuration concepts
  if (lowerText.includes('config') || lowerText.includes('setting') || lowerText.includes('option')) {
    concepts.configuration = 2.0;
  }
  if (lowerText.includes('environment') || lowerText.includes('env') || lowerText.includes('variable')) {
    concepts.environment = 1.5;
  }
  
  // Algorithm concepts
  if (lowerText.includes('sort') || lowerText.includes('order') || lowerText.includes('arrange')) {
    concepts.algorithm = 1.5;
    if (lowerText.includes('bubble')) concepts.bubble_sort = 2.0;
    if (lowerText.includes('quick')) concepts.quick_sort = 2.0;
    if (lowerText.includes('merge')) concepts.merge_sort = 2.0;
  }
  if (lowerText.includes('search') || lowerText.includes('find') || lowerText.includes('lookup')) {
    concepts.search_algorithm = 1.5;
  }
  
  // Data concepts
  if (lowerText.includes('array') || lowerText.includes('list') || lowerText.includes('collection')) {
    concepts.data_structure = 1.0;
  }
  if (lowerText.includes('object') || lowerText.includes('map') || lowerText.includes('dictionary')) {
    concepts.data_structure = 1.0;
  }
  
  // Framework concepts
  if (lowerText.includes('react') || lowerText.includes('component') || lowerText.includes('jsx')) {
    concepts.react = 1.5;
  }
  if (lowerText.includes('api') || lowerText.includes('endpoint') || lowerText.includes('http')) {
    concepts.api = 1.5;
  }
  
  return concepts;
}
export function normalizeEmbedding(embedding: number[]): number[] {
  if (!embedding || embedding.length === 0) {
    return new Array(2048).fill(0);
  }
  
  // Ensure consistent dimensions
  const targetDimension = 2048;
  const normalized = new Array(targetDimension).fill(0);
  
  for (let i = 0; i < Math.min(embedding.length, targetDimension); i++) {
    normalized[i] = embedding[i];
  }
  
  // Normalize to unit length
  const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return normalized.map(val => val / magnitude);
  }
  
  return normalized;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Persistent storage implementation
export class EmbeddingStorage {
  private cache: EmbeddingCache | null = null;
  private storagePath: string;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = path.join(context.globalStoragePath, 'embedding-cache.json');
    this.ensureStoragePath();
  }

  private ensureStoragePath(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getWorkspaceHash(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'no-workspace';
    }
    
    const workspaceInfo = workspaceFolders
      .map(folder => folder.uri.fsPath)
      .sort()
      .join('|');
    
    return simpleHash(workspaceInfo).toString();
  }

  async loadCache(): Promise<EmbeddingCache> {
    if (this.cache) {
      return this.cache;
    }

    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        const cached: EmbeddingCache = JSON.parse(data);
        
        // Validate cache for current workspace
        if (cached.workspaceHash === this.getWorkspaceHash()) {
          this.cache = cached;
          return cached;
        }
      }
    } catch (error) {
      // Create new cache on error
    }

    // Create new cache
    this.cache = {
      version: '1.0',
      workspaceHash: this.getWorkspaceHash(),
      embeddings: {},
      created: Date.now(),
      lastUpdated: Date.now()
    };

    return this.cache;
  }

  async saveCache(): Promise<void> {
    if (!this.cache) {
      return;
    }

    try {
      this.cache.lastUpdated = Date.now();
      const data = JSON.stringify(this.cache, null, 2);
      fs.writeFileSync(this.storagePath, data, 'utf8');
    } catch (error) {
      throw error;
    }
  }

  async getEmbedding(text: string, metadata?: any): Promise<number[]> {
    const cache = await this.loadCache();
    const key = this.generateKey(text, metadata);
    
    const cached = cache.embeddings[key];
    
    // Check if cache is valid (less than 7 days old)
    if (cached && (Date.now() - cached.timestamp) < (7 * 24 * 60 * 60 * 1000)) {
      return cached.embedding;
    }

    // Generate new embedding
    const embedding = await generateEmbedding(text);
    
    // Cache it
    cache.embeddings[key] = {
      text: text.substring(0, 500), // Store truncated text
      embedding,
      timestamp: Date.now(),
      metadata: metadata || {}
    };

    await this.saveCache();
    return embedding;
  }

  async getCachedEmbedding(text: string, metadata?: any): Promise<number[] | null> {
    const cache = await this.loadCache();
    const key = this.generateKey(text, metadata);
    
    const cached = cache.embeddings[key];
    if (cached && (Date.now() - cached.timestamp) < (7 * 24 * 60 * 60 * 1000)) {
      return cached.embedding;
    }
    
    return null;
  }

  private generateKey(text: string, metadata?: any): string {
    const baseText = text.substring(0, 200).toLowerCase().replace(/\s+/g, ' ');
    const metaString = metadata ? JSON.stringify({
      filename: metadata.filename,
      filepath: metadata.filepath,
      language: metadata.language
    }) : '';
    
    return simpleHash(baseText + metaString).toString();
  }

  async clearCache(): Promise<void> {
    this.cache = {
      version: '1.0',
      workspaceHash: this.getWorkspaceHash(),
      embeddings: {},
      created: Date.now(),
      lastUpdated: Date.now()
    };
    
    try {
      if (fs.existsSync(this.storagePath)) {
        fs.unlinkSync(this.storagePath);
      }
    } catch (error) {
      // Ignore deletion errors
    }
  }

  async getCacheStats(): Promise<{
    total: number;
    size: number;
    created: number;
    lastUpdated: number;
  }> {
    const cache = await this.loadCache();
    
    return {
      total: Object.keys(cache.embeddings).length,
      size: JSON.stringify(cache).length,
      created: cache.created,
      lastUpdated: cache.lastUpdated
    };
  }

  async updateEmbeddingMetadata(key: string, metadata: any): Promise<void> {
    const cache = await this.loadCache();
    
    if (cache.embeddings[key]) {
      cache.embeddings[key].metadata = { ...cache.embeddings[key].metadata, ...metadata };
      await this.saveCache();
    }
  }
}

// Global storage instance
let globalStorage: EmbeddingStorage | null = null;

export function initializeEmbeddingStorage(context: vscode.ExtensionContext): EmbeddingStorage {
  if (!globalStorage) {
    globalStorage = new EmbeddingStorage(context);
  }
  return globalStorage;
}

export function getEmbeddingStorage(): EmbeddingStorage {
  if (!globalStorage) {
    throw new Error('Embedding storage not initialized. Call initializeEmbeddingStorage first.');
  }
  return globalStorage;
}

// Batch embedding generation with caching
export async function generateEmbeddingsWithCache(
  texts: string[], 
  metadataArray: any[] = [],
  storage?: EmbeddingStorage
): Promise<number[][]> {
  
  const results: number[][] = [];
  const toGenerate: { text: string; index: number; metadata?: any }[] = [];
  
  // First pass: check cache
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const metadata = metadataArray[i];
    
    if (storage) {
      const cached = await storage.getCachedEmbedding(text, metadata);
      if (cached) {
        results[i] = cached;
        continue;
      }
    }
    
    toGenerate.push({ text, index: i, metadata });
  }

  // Generate missing embeddings
  for (const { text, index, metadata } of toGenerate) {
    try {
      let embedding: number[];
      
      if (storage) {
        embedding = await storage.getEmbedding(text, metadata);
      } else {
        embedding = await generateEmbedding(text);
      }
      
      results[index] = embedding;
    } catch (error) {
      // Use fallback embedding
      results[index] = generateHighQualityLocalEmbedding(text);
    }
  }

  return results;
}

// Utility function to check if embeddings are valid
export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && 
         embedding.length > 0 && 
         embedding.every(val => typeof val === 'number') &&
         !embedding.every(val => val === 0);
}

// Export the original function for backward compatibility
export { generateEmbedding as generateEmbeddingWithoutCache };