import * as vscode from 'vscode';
import { generateEmbeddingsWithCache, initializeEmbeddingStorage, getEmbeddingStorage, validateEmbedding, normalizeEmbedding } from './embeddings';
import { calculateCosineSimilarity } from './similarity';
import { splitCodeIntoChunksWithContext } from './pipeline';

export interface CodeSnippet {
  filename: string;
  filepath: string;
  content: string;
  language: string;
  lineNumber: number;
  embedding?: number[];
  relevance?: number;
  symbolSignature?: string;
  docComment?: string;
  diagnostic?: string;
  symbolName?: string;
}

// Persistent vector store
let vectorStore: CodeSnippet[] = [];
const VECTOR_STORE_VERSION = '1.0';

interface VectorStoreData {
  version: string;
  workspaceHash: string;
  snippets: CodeSnippet[];
  created: number;
  lastUpdated: number;
}

export class VectorStoreManager {
  private storagePath: string;
  private isInitialized = false;

  constructor(context: vscode.ExtensionContext) {
    this.storagePath = context.globalStoragePath;
    if (!this.storagePath) throw new Error('Storage path not available');
  }

  private getVectorStorePath(): string {
    return `${this.storagePath}/vector-store.json`;
  }

  private getWorkspaceHash(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return 'no-workspace';
    return this.simpleHash(workspaceFolders.map(f => f.uri.fsPath).sort().join('|')).toString();
  }
  private simpleHash(str: string): number {
    let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash);
  }

  async loadVectorStore(): Promise<CodeSnippet[]> {
    if (this.isInitialized && vectorStore.length > 0) return vectorStore;
    try {
      const fs = require('fs'); const path = require('path');
      const storePath = this.getVectorStorePath();
      if (fs.existsSync(storePath)) {
        const data = fs.readFileSync(storePath, 'utf8');
        const store: VectorStoreData = JSON.parse(data);
        if (store.workspaceHash === this.getWorkspaceHash() && store.version === VECTOR_STORE_VERSION) {
          vectorStore = store.snippets;
          this.isInitialized = true;
          return vectorStore;
        }
      }
    } catch { /* ignore */ }
    vectorStore = []; this.isInitialized = true;
    return vectorStore;
  }
  async saveVectorStore(): Promise<void> {
    const fs = require('fs'); const path = require('path');
    const storePath = this.getVectorStorePath();
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({
      version: VECTOR_STORE_VERSION,
      workspaceHash: this.getWorkspaceHash(),
      snippets: vectorStore,
      created: Date.now(),
      lastUpdated: Date.now()
    }, null, 2), 'utf8');
  }
  async clearVectorStore(): Promise<void> {
    vectorStore = []; this.isInitialized = true;
    const fs = require('fs');
    const storePath = this.getVectorStorePath();
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  }
  getStats() {
    return {
      totalSnippets: vectorStore.length,
      snippetsWithEmbeddings: vectorStore.filter(s => s.embedding && validateEmbedding(s.embedding)).length,
      languages: [...new Set(vectorStore.map(s => s.language))],
      isInitialized: this.isInitialized,
    };
  }
}

let vectorStoreManager: VectorStoreManager | null = null;
export function initializeVectorStore(context: vscode.ExtensionContext): VectorStoreManager {
  if (!vectorStoreManager) vectorStoreManager = new VectorStoreManager(context);
  return vectorStoreManager;
}
export function getVectorStoreManager(): VectorStoreManager {
  if (!vectorStoreManager) throw new Error('Vector store not initialized');
  return vectorStoreManager;
}

/**
 * Full-project embedding generation, stores normalized valid embeddings for each chunk
 */
export async function generateEmbeddingsForProject(): Promise<CodeSnippet[]> {
  try {
    if (!vscode.workspace.workspaceFolders) return [];
    const embeddingStorage = getEmbeddingStorage();
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs}', '**/node_modules/**');
    await vectorManager.clearVectorStore();
    vectorStore = [];
    for (const file of files.slice(0, 200)) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText();
        if (content.length < 10 || content.length > 12000) continue;
        const chunks = splitCodeIntoChunksWithContext(content, doc.languageId);
        if (chunks.length === 0) continue;
        const chunkContents = chunks.map(c => c.content);
        const chunkMetas = chunks.map((chunk, i) => ({
          filename: `${file.fsPath.split('/').pop()}#${i + 1}`,
          filepath: file.fsPath,
          language: doc.languageId,
          lineNumber: chunk.startLine
        }));
        const embeddings = await generateEmbeddingsWithCache(
          chunkContents,
          chunkMetas,
          embeddingStorage
        );
        for (let i = 0; i < chunks.length; i++) {
          const emb = normalizeEmbedding(embeddings[i]);
          if (validateEmbedding(emb)) {
            vectorStore.push({
              filename: chunkMetas[i].filename,
              filepath: file.fsPath,
              content: chunks[i].content,
              language: doc.languageId,
              lineNumber: chunkMetas[i].lineNumber,
              embedding: emb,
              symbolSignature: chunks[i].symbolSignature,
              docComment: chunks[i].docComment,
              diagnostic: undefined,
              symbolName: undefined
            });
          }
        }
      } catch { }
    }
    await vectorManager.saveVectorStore();
    return vectorStore;
  } catch { return []; }
}

/**
 * Main: retrieve candidates given a query, using semantic similarity
 */
export async function retrieveCandidates(query: string, maxResults: number = 10): Promise<CodeSnippet[]> {
  const vectorManager = getVectorStoreManager();
  await vectorManager.loadVectorStore();

  // If store is empty, forcibly rebuild it
  if (vectorStore.length === 0) {
    await generateEmbeddingsForProject();
    if (vectorStore.length === 0) return [];
  }

  // Always generate query embedding and normalize
  const embeddingStorage = getEmbeddingStorage();
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddingStorage.getEmbedding(query, { type: 'query' });
  } catch {
    // Fallback: local embedding
    queryEmbedding = normalizeEmbedding(embeddingStorage['generateHighQualityLocalEmbedding'](query));
  }
  const normQueryEmbedding = normalizeEmbedding(queryEmbedding);
  if (!validateEmbedding(normQueryEmbedding)) return [];

  // Compare with each snippet and score
  const scoredSnippets: CodeSnippet[] = [];
  for (const snippet of vectorStore) {
    if (snippet.embedding && validateEmbedding(snippet.embedding)) {
      try {
        const similarity = calculateCosineSimilarity(normQueryEmbedding, snippet.embedding);
        scoredSnippets.push({
          ...snippet,
          relevance: similarity
        });
      } catch { }
    }
  }
  // sort and filter: always return at least top 3 for debugging unless store is completely empty
  const results = scoredSnippets
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, Math.max(maxResults, 3));
  return results;
}

/** Find similar snippets to a given reference snippet */
export async function findSimilarSnippets(referenceSnippet: CodeSnippet, maxResults: number = 5): Promise<CodeSnippet[]> {
  const vectorManager = getVectorStoreManager();
  await vectorManager.loadVectorStore();
  if (vectorStore.length === 0 || !referenceSnippet.embedding) return [];
  const scored: CodeSnippet[] = [];
  for (const snippet of vectorStore) {
    if (snippet.embedding && snippet.filename !== referenceSnippet.filename) {
      try {
        const similarity = calculateCosineSimilarity(referenceSnippet.embedding, snippet.embedding);
        scored.push({ ...snippet, relevance: similarity });
      } catch { }
    }
  }
  return scored.sort((a, b) => (b.relevance || 0) - (a.relevance || 0)).slice(0, maxResults);
}

/** Diagnostic */
export async function getVectorStoreStats() {
  const vectorManager = getVectorStoreManager();
  await vectorManager.loadVectorStore();
  return vectorManager.getStats();
}

export async function validateVectorStore() {
  const issues: string[] = [];
  const vectorManager = getVectorStoreManager();
  await vectorManager.loadVectorStore();
  const stats = vectorManager.getStats();
  if (stats.totalSnippets === 0) issues.push('Vector store empty');
  if (stats.snippetsWithEmbeddings === 0) issues.push('No valid embeddings');
  const invalid = vectorStore.filter(snippet => snippet.embedding && !validateEmbedding(snippet.embedding)).length;
  if (invalid > 0) issues.push(`${invalid} snippets have invalid embeddings`);
  return { valid: issues.length === 0, issues, stats };
}

export async function clearAllEmbeddings() {
  const vectorManager = getVectorStoreManager();
  const embeddingStorage = getEmbeddingStorage();
  await vectorManager.clearVectorStore();
  await embeddingStorage.clearCache();
}
