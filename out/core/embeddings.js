"use strict";
/**
 * Embedding generation using your local DeepSeek FastAPI server
 * With persistent vector storage
 */
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
exports.EmbeddingStorage = void 0;
exports.generateEmbedding = generateEmbedding;
exports.generateEmbeddingWithoutCache = generateEmbedding;
exports.normalizeEmbedding = normalizeEmbedding;
exports.initializeEmbeddingStorage = initializeEmbeddingStorage;
exports.getEmbeddingStorage = getEmbeddingStorage;
exports.generateEmbeddingsWithCache = generateEmbeddingsWithCache;
exports.validateEmbedding = validateEmbedding;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function generateEmbedding(text) {
    try {
        // Use your existing FastAPI server for embeddings
        return await generateDeepSeekEmbedding(text);
    }
    catch (error) {
        return generateHighQualityLocalEmbedding(text);
    }
}
async function generateDeepSeekEmbedding(text) {
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
        }
        catch (healthError) {
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
        const data = await response.json();
        const embedding = data.embedding || data.vector;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('Invalid embedding response format');
        }
        return normalizeEmbedding(embedding);
    }
    catch (error) {
        return generateHighQualityLocalEmbedding(text);
    }
}
// COMPLETELY REPLACE the local embedding function with this:
function generateHighQualityLocalEmbedding(text) {
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
const SEMANTIC_CLUSTERS = {
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
function extractSemanticConcepts(text) {
    const lowerText = text.toLowerCase();
    const concepts = {};
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
        if (lowerText.includes('bubble'))
            concepts.bubble_sort = 2.0;
        if (lowerText.includes('quick'))
            concepts.quick_sort = 2.0;
        if (lowerText.includes('merge'))
            concepts.merge_sort = 2.0;
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
function normalizeEmbedding(embedding) {
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
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
// Persistent storage implementation
class EmbeddingStorage {
    constructor(context) {
        this.cache = null;
        this.storagePath = path.join(context.globalStoragePath, 'embedding-cache.json');
        this.ensureStoragePath();
    }
    ensureStoragePath() {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    getWorkspaceHash() {
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
    async loadCache() {
        if (this.cache) {
            return this.cache;
        }
        try {
            if (fs.existsSync(this.storagePath)) {
                const data = fs.readFileSync(this.storagePath, 'utf8');
                const cached = JSON.parse(data);
                // Validate cache for current workspace
                if (cached.workspaceHash === this.getWorkspaceHash()) {
                    this.cache = cached;
                    return cached;
                }
            }
        }
        catch (error) {
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
    async saveCache() {
        if (!this.cache) {
            return;
        }
        try {
            this.cache.lastUpdated = Date.now();
            const data = JSON.stringify(this.cache, null, 2);
            fs.writeFileSync(this.storagePath, data, 'utf8');
        }
        catch (error) {
            throw error;
        }
    }
    async getEmbedding(text, metadata) {
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
    async getCachedEmbedding(text, metadata) {
        const cache = await this.loadCache();
        const key = this.generateKey(text, metadata);
        const cached = cache.embeddings[key];
        if (cached && (Date.now() - cached.timestamp) < (7 * 24 * 60 * 60 * 1000)) {
            return cached.embedding;
        }
        return null;
    }
    generateKey(text, metadata) {
        const baseText = text.substring(0, 200).toLowerCase().replace(/\s+/g, ' ');
        const metaString = metadata ? JSON.stringify({
            filename: metadata.filename,
            filepath: metadata.filepath,
            language: metadata.language
        }) : '';
        return simpleHash(baseText + metaString).toString();
    }
    async clearCache() {
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
        }
        catch (error) {
            // Ignore deletion errors
        }
    }
    async getCacheStats() {
        const cache = await this.loadCache();
        return {
            total: Object.keys(cache.embeddings).length,
            size: JSON.stringify(cache).length,
            created: cache.created,
            lastUpdated: cache.lastUpdated
        };
    }
    async updateEmbeddingMetadata(key, metadata) {
        const cache = await this.loadCache();
        if (cache.embeddings[key]) {
            cache.embeddings[key].metadata = { ...cache.embeddings[key].metadata, ...metadata };
            await this.saveCache();
        }
    }
}
exports.EmbeddingStorage = EmbeddingStorage;
// Global storage instance
let globalStorage = null;
function initializeEmbeddingStorage(context) {
    if (!globalStorage) {
        globalStorage = new EmbeddingStorage(context);
    }
    return globalStorage;
}
function getEmbeddingStorage() {
    if (!globalStorage) {
        throw new Error('Embedding storage not initialized. Call initializeEmbeddingStorage first.');
    }
    return globalStorage;
}
// Batch embedding generation with caching
async function generateEmbeddingsWithCache(texts, metadataArray = [], storage) {
    const results = [];
    const toGenerate = [];
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
            let embedding;
            if (storage) {
                embedding = await storage.getEmbedding(text, metadata);
            }
            else {
                embedding = await generateEmbedding(text);
            }
            results[index] = embedding;
        }
        catch (error) {
            // Use fallback embedding
            results[index] = generateHighQualityLocalEmbedding(text);
        }
    }
    return results;
}
// Utility function to check if embeddings are valid
function validateEmbedding(embedding) {
    return Array.isArray(embedding) &&
        embedding.length > 0 &&
        embedding.every(val => typeof val === 'number') &&
        !embedding.every(val => val === 0);
}
//# sourceMappingURL=embeddings.js.map