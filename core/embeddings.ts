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

// Type definitions for API response
interface DeepSeekEmbeddingResponse {
  embedding?: number[];
  vector?: number[];
  error?: string;
  note?: string;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return await generateDeepSeekEmbedding(text);
  } catch {
    return generateHighQualityLocalEmbedding(text);
  }
}

async function generateDeepSeekEmbedding(text: string): Promise<number[]> {
  try {
    const healthResponse = await fetch('http://localhost:8000/health', { method: 'GET', signal: AbortSignal.timeout(2000) });
    if (!healthResponse.ok) return generateHighQualityLocalEmbedding(text);
  } catch { return generateHighQualityLocalEmbedding(text); }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('http://localhost:8000/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.substring(0, 1000) }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
    const data: DeepSeekEmbeddingResponse = await response.json();
    const embedding = (data.embedding ?? data.vector) as number[] | undefined;
    if (!embedding || !Array.isArray(embedding)) throw new Error('Invalid embedding response format');
    return normalizeEmbedding(embedding);
  } catch { return generateHighQualityLocalEmbedding(text); }
}

function generateHighQualityLocalEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 1).filter(w => !STOP_WORDS.has(w));
  const embedding = new Array(2048).fill(0);
  words.forEach(word => {
    for (let i = 0; i < 3; i++) {
      const hash = simpleHash(word + i.toString()) % 2048;
      embedding[hash] += 1.0 / (i + 1);
    }
  });
  const lowerText = text.toLowerCase();
  if (lowerText.includes('function') || lowerText.match(/(const|let|var)\s+\w+\s*=\s*\(/)) embedding[simpleHash('function_pattern') % 2048] += 2.0;
  if (lowerText.includes('class') || lowerText.includes('interface')) embedding[simpleHash('class_pattern') % 2048] += 2.0;
  if (lowerText.includes('sort')) embedding[simpleHash('sorting_pattern') % 2048] += 3.0;
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}

const STOP_WORDS = new Set(['the','and','or','is','in','on','at','to','for','of','a','an','this','that','with','by','as','from']);

// Utility functions (unchanged)
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}
export function normalizeEmbedding(embedding: number[]): number[] {
  if (!embedding || embedding.length === 0) return new Array(2048).fill(0);
  const targetDimension = 2048;
  const normalized = new Array(targetDimension).fill(0);
  for (let i = 0; i < Math.min(embedding.length, targetDimension); i++) normalized[i] = embedding[i];
  const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? normalized.map(val => val / magnitude) : normalized;
}
export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every(val => typeof val === 'number') && !embedding.every(val => val === 0);
}

// --- EMBEDDING STORAGE CLASS & EXPORTS ---

export class EmbeddingStorage {
  private cache: EmbeddingCache | null = null;
  private storagePath: string;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = path.join(context.globalStoragePath, 'embedding-cache.json');
    this.ensureStoragePath();
  }
  private ensureStoragePath(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  private getWorkspaceHash(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return 'no-workspace';
    const workspaceInfo = workspaceFolders.map(folder => folder.uri.fsPath).sort().join('|');
    return simpleHash(workspaceInfo).toString();
  }

  async loadCache(): Promise<EmbeddingCache> {
    if (this.cache) return this.cache;
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        const cached: EmbeddingCache = JSON.parse(data);
        if (cached.workspaceHash === this.getWorkspaceHash()) {
          this.cache = cached;
          return cached;
        }
      }
    } catch { }
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
    if (!this.cache) return;
    this.cache.lastUpdated = Date.now();
    const data = JSON.stringify(this.cache, null, 2);
    fs.writeFileSync(this.storagePath, data, 'utf8');
  }
  async getEmbedding(text: string, metadata?: any): Promise<number[]> {
    const cache = await this.loadCache();
    const key = this.generateKey(text, metadata);
    const cached = cache.embeddings[key];
    if (cached && (Date.now() - cached.timestamp) < (7 * 24 * 60 * 60 * 1000)) return cached.embedding;
    const embedding = await generateEmbedding(text);
    cache.embeddings[key] = {
      text: text.substring(0, 500),
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
    if (cached && (Date.now() - cached.timestamp) < (7 * 24 * 60 * 60 * 1000)) return cached.embedding;
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
    try { if (fs.existsSync(this.storagePath)) fs.unlinkSync(this.storagePath); } catch { }
  }
  async getCacheStats(): Promise<{ total: number; size: number; created: number; lastUpdated: number }> {
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

// --- Ensure global storage pattern ---
let globalStorage: EmbeddingStorage | null = null;
export function initializeEmbeddingStorage(context: vscode.ExtensionContext): EmbeddingStorage {
  if (!globalStorage) globalStorage = new EmbeddingStorage(context);
  return globalStorage;
}
export function getEmbeddingStorage(): EmbeddingStorage {
  if (!globalStorage) throw new Error('Embedding storage not initialized. Call initializeEmbeddingStorage first.');
  return globalStorage;
}

// --- Batch embedding generation with caching ---
export async function generateEmbeddingsWithCache(
  texts: string[],
  metadataArray: any[] = [],
  storage?: EmbeddingStorage
): Promise<number[][]> {
  const results: number[][] = [];
  const toGenerate: { text: string; index: number; metadata?: any }[] = [];
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
  for (const { text, index, metadata } of toGenerate) {
    try {
      let embedding: number[];
      if (storage) embedding = await storage.getEmbedding(text, metadata);
      else embedding = await generateEmbedding(text);
      results[index] = embedding;
    } catch { results[index] = generateHighQualityLocalEmbedding(text); }
  }
  return results;
}
