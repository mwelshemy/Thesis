"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreManager = void 0;
exports.initializeVectorStore = initializeVectorStore;
exports.getVectorStoreManager = getVectorStoreManager;
exports.generateEmbeddingsForProject = generateEmbeddingsForProject;
exports.retrieveCandidates = retrieveCandidates;
exports.findSimilarSnippets = findSimilarSnippets;
exports.getVectorStoreStats = getVectorStoreStats;
exports.validateVectorStore = validateVectorStore;
exports.clearAllEmbeddings = clearAllEmbeddings;
const vscode = __importStar(require("vscode"));
const embeddings_1 = require("./embeddings");
const similarity_1 = require("./similarity");
const pipeline_1 = require("./pipeline");
// Persistent vector store
let vectorStore = [];
const VECTOR_STORE_VERSION = '1.0';
class VectorStoreManager {
    constructor(context) {
        this.isInitialized = false;
        this.storagePath = context.globalStoragePath;
        if (!this.storagePath)
            throw new Error('Storage path not available');
    }
    getVectorStorePath() {
        return `${this.storagePath}/vector-store.json`;
    }
    getWorkspaceHash() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0)
            return 'no-workspace';
        return this.simpleHash(workspaceFolders.map(f => f.uri.fsPath).sort().join('|')).toString();
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
    async loadVectorStore() {
        if (this.isInitialized && vectorStore.length > 0)
            return vectorStore;
        try {
            const fs = require('fs');
            const path = require('path');
            const storePath = this.getVectorStorePath();
            if (fs.existsSync(storePath)) {
                const data = fs.readFileSync(storePath, 'utf8');
                const store = JSON.parse(data);
                if (store.workspaceHash === this.getWorkspaceHash() && store.version === VECTOR_STORE_VERSION) {
                    vectorStore = store.snippets;
                    this.isInitialized = true;
                    return vectorStore;
                }
            }
        }
        catch { /* ignore */ }
        vectorStore = [];
        this.isInitialized = true;
        return vectorStore;
    }
    async saveVectorStore() {
        const fs = require('fs');
        const path = require('path');
        const storePath = this.getVectorStorePath();
        const dir = path.dirname(storePath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(storePath, JSON.stringify({
            version: VECTOR_STORE_VERSION,
            workspaceHash: this.getWorkspaceHash(),
            snippets: vectorStore,
            created: Date.now(),
            lastUpdated: Date.now()
        }, null, 2), 'utf8');
    }
    async clearVectorStore() {
        vectorStore = [];
        this.isInitialized = true;
        const fs = require('fs');
        const storePath = this.getVectorStorePath();
        if (fs.existsSync(storePath))
            fs.unlinkSync(storePath);
    }
    getStats() {
        return {
            totalSnippets: vectorStore.length,
            snippetsWithEmbeddings: vectorStore.filter(s => s.embedding && (0, embeddings_1.validateEmbedding)(s.embedding)).length,
            languages: [...new Set(vectorStore.map(s => s.language))],
            isInitialized: this.isInitialized,
        };
    }
}
exports.VectorStoreManager = VectorStoreManager;
let vectorStoreManager = null;
function initializeVectorStore(context) {
    if (!vectorStoreManager)
        vectorStoreManager = new VectorStoreManager(context);
    return vectorStoreManager;
}
function getVectorStoreManager() {
    if (!vectorStoreManager)
        throw new Error('Vector store not initialized');
    return vectorStoreManager;
}
/**
 * Full-project embedding generation, stores normalized valid embeddings for each chunk
 */
async function generateEmbeddingsForProject() {
    try {
        if (!vscode.workspace.workspaceFolders)
            return [];
        const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
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
                if (content.length < 10 || content.length > 12000)
                    continue;
                const chunks = (0, pipeline_1.splitCodeIntoChunksWithContext)(content, doc.languageId);
                if (chunks.length === 0)
                    continue;
                const chunkContents = chunks.map(c => c.content);
                const chunkMetas = chunks.map((chunk, i) => ({
                    filename: `${file.fsPath.split('/').pop()}#${i + 1}`,
                    filepath: file.fsPath,
                    language: doc.languageId,
                    lineNumber: chunk.startLine
                }));
                const embeddings = await (0, embeddings_1.generateEmbeddingsWithCache)(chunkContents, chunkMetas, embeddingStorage);
                for (let i = 0; i < chunks.length; i++) {
                    const emb = (0, embeddings_1.normalizeEmbedding)(embeddings[i]);
                    if ((0, embeddings_1.validateEmbedding)(emb)) {
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
            }
            catch { }
        }
        await vectorManager.saveVectorStore();
        return vectorStore;
    }
    catch {
        return [];
    }
}
/**
 * Main: retrieve candidates given a query, using semantic similarity
 */
async function retrieveCandidates(query, maxResults = 10) {
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    // If store is empty, forcibly rebuild it
    if (vectorStore.length === 0) {
        await generateEmbeddingsForProject();
        if (vectorStore.length === 0)
            return [];
    }
    // Always generate query embedding and normalize
    const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
    let queryEmbedding;
    try {
        queryEmbedding = await embeddingStorage.getEmbedding(query, { type: 'query' });
    }
    catch {
        // Fallback: local embedding
        queryEmbedding = (0, embeddings_1.normalizeEmbedding)(embeddingStorage['generateHighQualityLocalEmbedding'](query));
    }
    const normQueryEmbedding = (0, embeddings_1.normalizeEmbedding)(queryEmbedding);
    if (!(0, embeddings_1.validateEmbedding)(normQueryEmbedding))
        return [];
    // Compare with each snippet and score
    const scoredSnippets = [];
    for (const snippet of vectorStore) {
        if (snippet.embedding && (0, embeddings_1.validateEmbedding)(snippet.embedding)) {
            try {
                const similarity = (0, similarity_1.calculateCosineSimilarity)(normQueryEmbedding, snippet.embedding);
                scoredSnippets.push({
                    ...snippet,
                    relevance: similarity
                });
            }
            catch { }
        }
    }
    // sort and filter: always return at least top 3 for debugging unless store is completely empty
    const results = scoredSnippets
        .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
        .slice(0, Math.max(maxResults, 3));
    return results;
}
/** Find similar snippets to a given reference snippet */
async function findSimilarSnippets(referenceSnippet, maxResults = 5) {
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    if (vectorStore.length === 0 || !referenceSnippet.embedding)
        return [];
    const scored = [];
    for (const snippet of vectorStore) {
        if (snippet.embedding && snippet.filename !== referenceSnippet.filename) {
            try {
                const similarity = (0, similarity_1.calculateCosineSimilarity)(referenceSnippet.embedding, snippet.embedding);
                scored.push({ ...snippet, relevance: similarity });
            }
            catch { }
        }
    }
    return scored.sort((a, b) => (b.relevance || 0) - (a.relevance || 0)).slice(0, maxResults);
}
/** Diagnostic */
async function getVectorStoreStats() {
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    return vectorManager.getStats();
}
async function validateVectorStore() {
    const issues = [];
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    const stats = vectorManager.getStats();
    if (stats.totalSnippets === 0)
        issues.push('Vector store empty');
    if (stats.snippetsWithEmbeddings === 0)
        issues.push('No valid embeddings');
    const invalid = vectorStore.filter(snippet => snippet.embedding && !(0, embeddings_1.validateEmbedding)(snippet.embedding)).length;
    if (invalid > 0)
        issues.push(`${invalid} snippets have invalid embeddings`);
    return { valid: issues.length === 0, issues, stats };
}
async function clearAllEmbeddings() {
    const vectorManager = getVectorStoreManager();
    const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
    await vectorManager.clearVectorStore();
    await embeddingStorage.clearCache();
}
//# sourceMappingURL=retrieve.js.map