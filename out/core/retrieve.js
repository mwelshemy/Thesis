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
exports.splitCodeIntoChunksWithContext = splitCodeIntoChunksWithContext;
exports.retrieveCandidates = retrieveCandidates;
exports.quickTextSearch = quickTextSearch;
exports.findSimilarSnippets = findSimilarSnippets;
exports.getVectorStoreStats = getVectorStoreStats;
exports.validateVectorStore = validateVectorStore;
exports.clearAllEmbeddings = clearAllEmbeddings;
const vscode = __importStar(require("vscode"));
const embeddings_1 = require("./embeddings");
const similarity_1 = require("./similarity");
// Persistent vector store with file system backup
let vectorStore = [];
const VECTOR_STORE_VERSION = '1.0';
class VectorStoreManager {
    constructor(context) {
        this.isInitialized = false;
        this.storagePath = context.globalStoragePath;
        this.ensureStoragePath();
    }
    ensureStoragePath() {
        if (!this.storagePath) {
            throw new Error('Storage path not available');
        }
    }
    getVectorStoreFilePath() {
        return `${this.storagePath}/vector-store.json`;
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
        return this.simpleHash(workspaceInfo).toString();
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
        if (this.isInitialized && vectorStore.length > 0) {
            return vectorStore;
        }
        try {
            const storePath = this.getVectorStoreFilePath();
            const fs = require('fs');
            const path = require('path');
            if (fs.existsSync(storePath)) {
                const data = fs.readFileSync(storePath, 'utf8');
                const storedData = JSON.parse(data);
                // Validate store for current workspace and version
                if (storedData.workspaceHash === this.getWorkspaceHash() &&
                    storedData.version === VECTOR_STORE_VERSION) {
                    vectorStore = storedData.snippets;
                    this.isInitialized = true;
                    console.log(`Loaded ${vectorStore.length} snippets from persistent storage`);
                    return vectorStore;
                }
                else {
                    console.log('Workspace or version changed, clearing old vector store');
                }
            }
        }
        catch (error) {
            console.warn('Failed to load vector store from disk:', error);
        }
        vectorStore = [];
        this.isInitialized = true;
        return vectorStore;
    }
    async saveVectorStore() {
        try {
            const storeData = {
                version: VECTOR_STORE_VERSION,
                workspaceHash: this.getWorkspaceHash(),
                snippets: vectorStore,
                created: Date.now(),
                lastUpdated: Date.now()
            };
            const fs = require('fs');
            const path = require('path');
            const storePath = this.getVectorStoreFilePath();
            // Ensure directory exists
            const dir = path.dirname(storePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = JSON.stringify(storeData, null, 2);
            fs.writeFileSync(storePath, data, 'utf8');
            console.log(`Saved ${vectorStore.length} snippets to persistent storage`);
        }
        catch (error) {
            console.error('Failed to save vector store:', error);
            throw error;
        }
    }
    async clearVectorStore() {
        vectorStore = [];
        this.isInitialized = true;
        try {
            const fs = require('fs');
            const storePath = this.getVectorStoreFilePath();
            if (fs.existsSync(storePath)) {
                fs.unlinkSync(storePath);
            }
        }
        catch (error) {
            console.warn('Failed to delete vector store file:', error);
        }
    }
    getStats() {
        return {
            totalSnippets: vectorStore.length,
            snippetsWithEmbeddings: vectorStore.filter(s => s.embedding && (0, embeddings_1.validateEmbedding)(s.embedding)).length,
            languages: [...new Set(vectorStore.map(s => s.language))],
            isInitialized: this.isInitialized
        };
    }
}
exports.VectorStoreManager = VectorStoreManager;
// Global vector store manager
let vectorStoreManager = null;
function initializeVectorStore(context) {
    if (!vectorStoreManager) {
        vectorStoreManager = new VectorStoreManager(context);
    }
    return vectorStoreManager;
}
function getVectorStoreManager() {
    if (!vectorStoreManager) {
        throw new Error('Vector store not initialized. Call initializeVectorStore first.');
    }
    return vectorStoreManager;
}
/**
 * Generate embeddings for all project files and store in vector store
 */
async function generateEmbeddingsForProject() {
    try {
        if (!vscode.workspace.workspaceFolders) {
            console.warn('No workspace folder open.');
            return [];
        }
        // Initialize storage systems
        const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
        const vectorManager = getVectorStoreManager();
        // Load existing vector store first
        await vectorManager.loadVectorStore();
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        console.log(`Generating embeddings for workspace: ${workspacePath}`);
        const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs}', '**/node_modules/**');
        console.log(`Found ${files.length} files to process`);
        if (files.length === 0) {
            console.warn('No source files found in workspace');
            return [];
        }
        // Clear existing store for fresh generation
        await vectorManager.clearVectorStore();
        vectorStore = [];
        let processedFiles = 0;
        let totalSnippets = 0;
        for (const file of files.slice(0, 200)) { // Limit for performance
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const content = document.getText();
                if (content.length < 10 || content.length > 10000)
                    continue;
                // Split file into smaller chunks (function/class level)
                const chunks = splitCodeIntoChunksWithContext(content, document.languageId);
                if (chunks.length === 0)
                    continue;
                // Prepare chunks for batch embedding
                const chunkContents = chunks.map(chunk => chunk.content);
                const chunkMetadata = chunks.map((chunk, i) => ({
                    filename: `${file.fsPath.split('/').pop()}#${i + 1}`,
                    filepath: file.fsPath,
                    language: document.languageId,
                    lineNumber: chunk.startLine
                }));
                // Generate embeddings in batch with caching
                const embeddings = await (0, embeddings_1.generateEmbeddingsWithCache)(chunkContents, chunkMetadata, embeddingStorage);
                // Create snippets with embeddings
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const embedding = embeddings[i];
                    const normalizedEmbedding = (0, embeddings_1.normalizeEmbedding)(embedding);
                    if ((0, embeddings_1.validateEmbedding)(normalizedEmbedding)) {
                        const snippet = {
                            filename: chunkMetadata[i].filename,
                            filepath: file.fsPath,
                            content: chunk.content,
                            language: document.languageId,
                            lineNumber: chunk.startLine,
                            embedding: normalizedEmbedding,
                            symbolSignature: chunk.symbolSignature,
                            docComment: chunk.docComment,
                            diagnostic: undefined,
                            symbolName: undefined
                        };
                        vectorStore.push(snippet);
                        totalSnippets++;
                    }
                }
                processedFiles++;
                if (processedFiles % 10 === 0) {
                    console.log(`Processed ${processedFiles} files, generated ${totalSnippets} snippets...`);
                }
            }
            catch (error) {
                console.warn(`Failed to process ${file.fsPath}:`, error);
            }
        }
        // Save the complete vector store to disk
        await vectorManager.saveVectorStore();
        console.log(`Generated ${vectorStore.length} code snippet embeddings from ${processedFiles} files`);
        return vectorStore;
    }
    catch (error) {
        console.error('Error generating embeddings:', error);
        return [];
    }
}
/**
 * New: Enhanced chunk splitting with symbol Signature & doc comment
 */
function splitCodeIntoChunksWithContext(content, language) {
    const blocks = [];
    try {
        const lines = content.split('\n');
        let currentBlock = [];
        let startLine = 1;
        let symbolSignature = '';
        let docCommentLines = [];
        const symbolRegex = /^\s*(export\s+)?(class|function|interface|type|const|let|var|def)\s+([A-Za-z_]\w*)/;
        function pushBlock() {
            if (currentBlock.length > 0) {
                blocks.push({
                    content: currentBlock.join('\n'),
                    startLine,
                    symbolSignature: symbolSignature || undefined,
                    docComment: docCommentLines.join(' ') || undefined
                });
            }
            currentBlock = [];
            symbolSignature = '';
            docCommentLines = [];
        }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (/^\/\/|^\/\*|^\*/.test(trimmed)) {
                // accumulate comment lines to attach as docComment when symbol appears
                docCommentLines.push(trimmed.replace(/^\/\/\s*|^\/\*\s*|^\*\s*/, ''));
                continue;
            }
            const m = trimmed.match(symbolRegex);
            if (m) {
                // start of symbol - flush previous block, attach docComment and signature
                if (currentBlock.length > 0)
                    pushBlock();
                symbolSignature = trimmed;
                startLine = i + 1;
                currentBlock.push(line);
                // reset docComment accumulator for next block
                docCommentLines = docCommentLines;
            }
            else {
                currentBlock.push(line);
            }
            // Force chunk if too large and not a symbol block
            if (currentBlock.length >= 40) {
                pushBlock();
                startLine = i + 2;
            }
        }
        pushBlock();
    }
    catch (err) {
        // fall back to simple chunk
        const fallback = content.substring(0, 500);
        return [{ content: fallback, startLine: 1 }];
    }
    return blocks;
}
/**
 * Retrieve candidate code snippets based on query similarity
 */
async function retrieveCandidates(query, maxResults = 10) {
    try {
        const vectorManager = getVectorStoreManager();
        await vectorManager.loadVectorStore();
        if (vectorStore.length === 0) {
            console.warn('Vector store is empty. Generating embeddings first...');
            await generateEmbeddingsForProject();
            if (vectorStore.length === 0) {
                console.warn('Still no snippets after generation');
                return [];
            }
        }
        console.log(`Searching ${vectorStore.length} snippets for: "${query}"`);
        const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
        const queryEmbedding = await embeddingStorage.getEmbedding(query, { type: 'query' });
        const normalizedQueryEmbedding = (0, embeddings_1.normalizeEmbedding)(queryEmbedding);
        if (!(0, embeddings_1.validateEmbedding)(normalizedQueryEmbedding)) {
            console.error('Invalid query embedding generated');
            return [];
        }
        console.log(`Query embedding dimension: ${normalizedQueryEmbedding.length}`);
        const scoredSnippets = [];
        // Calculate similarity for each snippet with valid embedding
        for (const snippet of vectorStore) {
            if (snippet.embedding && (0, embeddings_1.validateEmbedding)(snippet.embedding)) {
                try {
                    const similarity = (0, similarity_1.calculateCosineSimilarity)(normalizedQueryEmbedding, snippet.embedding);
                    scoredSnippets.push({
                        ...snippet,
                        relevance: similarity
                    });
                }
                catch (error) {
                    console.warn(`Failed to calculate similarity for ${snippet.filename}:`, error);
                }
            }
        }
        console.log(`Found ${scoredSnippets.length} valid snippets with embeddings`);
        // Return top matches - ensure we return something even if scores are low
        const results = scoredSnippets
            .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
            .slice(0, maxResults);
        console.log(`Returning ${results.length} results (best score: ${results[0]?.relevance?.toFixed(3)})`);
        if (results.length === 0 && scoredSnippets.length > 0) {
            console.log(' No results passed threshold, returning top 3 for debugging');
            return scoredSnippets.slice(0, 3);
        }
        return results;
    }
    catch (error) {
        console.error('Error retrieving candidates:', error);
        return [];
    }
}
/**
 * Quick search without generating query embedding (for simple text matching)
 */
async function quickTextSearch(query, maxResults = 10) {
    try {
        const vectorManager = getVectorStoreManager();
        await vectorManager.loadVectorStore();
        if (vectorStore.length === 0) {
            return [];
        }
        const queryLower = query.toLowerCase();
        const scoredSnippets = [];
        for (const snippet of vectorStore) {
            let score = 0;
            // Simple text matching scoring
            if (snippet.filename.toLowerCase().includes(queryLower)) {
                score += 0.5;
            }
            if (snippet.content.toLowerCase().includes(queryLower)) {
                score += 0.3;
            }
            if (snippet.language.toLowerCase().includes(queryLower)) {
                score += 0.2;
            }
            if (score > 0) {
                scoredSnippets.push({
                    ...snippet,
                    relevance: score
                });
            }
        }
        return scoredSnippets
            .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
            .slice(0, maxResults);
    }
    catch (error) {
        console.error('Error in quick text search:', error);
        return [];
    }
}
/**
 * Get similar snippets to a given code snippet
 */
async function findSimilarSnippets(referenceSnippet, maxResults = 5) {
    try {
        const vectorManager = getVectorStoreManager();
        await vectorManager.loadVectorStore();
        if (vectorStore.length === 0 || !referenceSnippet.embedding) {
            return [];
        }
        const scoredSnippets = [];
        for (const snippet of vectorStore) {
            if (snippet.embedding && snippet.filename !== referenceSnippet.filename) {
                try {
                    const similarity = (0, similarity_1.calculateCosineSimilarity)(referenceSnippet.embedding, snippet.embedding);
                    scoredSnippets.push({
                        ...snippet,
                        relevance: similarity
                    });
                }
                catch (error) {
                    // Skip similarity calculation errors
                }
            }
        }
        return scoredSnippets
            .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
            .slice(0, maxResults);
    }
    catch (error) {
        console.error('Error finding similar snippets:', error);
        return [];
    }
}
/**
 * Split code into logical chunks (functions, classes, methods) with improved chunking
 */
/**
 * Split code into meaningful chunks (functions, classes, methods) with proper boundaries
 */
/**
 * Simple and reliable code chunking - keep functions/classes intact
 */
/**
 * Better chunking - keep complete functions/methods together
 */
function splitCodeIntoChunks(content, language) {
    const chunks = [];
    const lines = content.split('\n');
    let currentChunk = [];
    let chunkStartLine = 1;
    let braceCount = 0;
    let inFunction = false;
    let functionStartLine = 1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Skip empty lines at the start
        if (trimmed === '' && currentChunk.length === 0) {
            chunkStartLine = i + 2;
            continue;
        }
        // Count braces to detect function boundaries
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        // Detect function/class starts
        const isFunctionStart = isFunctionOrClassStart(trimmed, language);
        if (isFunctionStart && !inFunction) {
            // If we were collecting something, save it first
            if (currentChunk.length > 0) {
                const chunkContent = currentChunk.join('\n').trim();
                if (chunkContent.length >= 10) {
                    chunks.push({
                        content: chunkContent,
                        startLine: chunkStartLine
                    });
                }
            }
            // Start new function chunk
            currentChunk = [line];
            chunkStartLine = i + 1;
            functionStartLine = i + 1;
            inFunction = true;
        }
        else if (inFunction && braceCount === 0 && currentChunk.length > 0) {
            // Function ended - save the complete function
            currentChunk.push(line);
            const chunkContent = currentChunk.join('\n').trim();
            if (chunkContent.length >= 20) {
                chunks.push({
                    content: chunkContent,
                    startLine: functionStartLine
                });
            }
            currentChunk = [];
            inFunction = false;
            chunkStartLine = i + 2;
        }
        else {
            currentChunk.push(line);
        }
        // Force chunk every 40 lines if no structure found (for comments, configs, etc.)
        if (currentChunk.length >= 40 && !inFunction) {
            const chunkContent = currentChunk.join('\n').trim();
            if (chunkContent.length >= 10) {
                chunks.push({
                    content: chunkContent,
                    startLine: chunkStartLine
                });
            }
            currentChunk = [];
            chunkStartLine = i + 2;
        }
    }
    // Add any remaining content
    if (currentChunk.length > 0) {
        const chunkContent = currentChunk.join('\n').trim();
        if (chunkContent.length >= 10) {
            chunks.push({
                content: chunkContent,
                startLine: chunkStartLine
            });
        }
    }
    console.log(`✅ Split ${lines.length} lines into ${chunks.length} COMPLETE chunks for ${language}`);
    // Log function chunks for debugging
    const functionChunks = chunks.filter(chunk => isFunctionOrClassStart(chunk.content.split('\n')[0], language));
    console.log(`   📊 Found ${functionChunks.length} complete functions/classes`);
    return chunks;
}
function isFunctionOrClassStart(line, language) {
    const patterns = [
        /^export\s+class\s+\w+/, // export class SortingAlgorithms
        /^class\s+\w+/, // class SortingAlgorithms  
        /^export\s+function\s+\w+/, // export function bubbleSort
        /^function\s+\w+/, // function bubbleSort
        /^public\s+static\s+\w+\(/, // public static bubbleSort(
        /^private\s+static\s+\w+\(/, // private static bubbleSort(
        /^protected\s+static\s+\w+\(/, // protected static bubbleSort(
        /^static\s+\w+\(/, // static bubbleSort(
        /^const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{/, // const bubbleSort = () => {
        /^let\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{/, // let bubbleSort = () => {
        /^var\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{/, // var bubbleSort = () => {
        /^export\s+default\s+class/, // export default class
        /^export\s+default\s+function/ // export default function
    ];
    return patterns.some(pattern => pattern.test(line.trim()));
}
function isFunctionDeclaration(line, language) {
    const patterns = {
        typescript: [
            /^(export\s+)?(async\s+)?function\s+\w+\s*\(/,
            /^(export\s+)?(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:{=]/,
            /^(export\s+)?(async\s+)?(const|let|var)\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=>{]/,
            /^(export\s+)?(async\s+)?class\s+\w/,
            /^\([^)]*\)\s*=>\s*{/,
        ],
        javascript: [
            /^(export\s+)?(async\s+)?function\s+\w+\s*\(/,
            /^(export\s+)?(async\s+)?\w+\s*\([^)]*\)\s*{/,
            /^(export\s+)?(async\s+)?(const|let|var)\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=>{]/,
            /^(export\s+)?(async\s+)?class\s+\w/,
            /^\([^)]*\)\s*=>\s*{/,
        ],
        typescriptreact: [
            /^(export\s+)?(async\s+)?function\s+\w+\s*\(/,
            /^(export\s+)?(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:{=]/,
            /^(export\s+)?(async\s+)?(const|let|var)\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=>{]/,
            /^(export\s+)?(async\s+)?class\s+\w/,
            /^\([^)]*\)\s*=>\s*{/,
            /^const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{/,
        ]
    };
    const languagePatterns = patterns[language] || patterns.typescript;
    return languagePatterns.some(pattern => pattern.test(line));
}
function isClassDeclaration(line, language) {
    return /^(export\s+)?class\s+\w/.test(line) ||
        /^(export\s+)?interface\s+\w/.test(line);
}
function countBraces(line) {
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    return openBraces - closeBraces;
}
function hasCompleteStructure(content, language) {
    // Check if the chunk has at least one complete function/class structure
    return isFunctionDeclaration(content.split('\n')[0], language) ||
        isClassDeclaration(content.split('\n')[0], language) ||
        content.includes('function ') ||
        content.includes('class ') ||
        content.includes('const ') && content.includes('=>');
}
/**
 * Enhanced function detection
 */
function isFunctionStart(line, language) {
    const patterns = {
        typescript: [
            /^(export\s+)?(async\s+)?function\s+\w/,
            /^(export\s+)?(async\s+)?\w+\s*\([^)]*\)\s*[:{=]/,
            /^(export\s+)?(async\s+)?const\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^(export\s+)?(async\s+)?let\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^(export\s+)?(async\s+)?var\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^\([^)]*\)\s*=>/,
        ],
        javascript: [
            /^(export\s+)?(async\s+)?function\s+\w/,
            /^(export\s+)?(async\s+)?\w+\s*\([^)]*\)\s*\{/,
            /^(export\s+)?(async\s+)?const\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^(export\s+)?(async\s+)?let\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^(export\s+)?(async\s+)?var\s+\w+\s*=\s*(\([^)]*\)|function)\s*[=:{]/,
            /^\([^)]*\)\s*=>/,
        ],
        python: [
            /^def\s+\w/,
            /^class\s+\w/,
            /^async\s+def\s+\w/,
            /^@\w+/,
        ],
        java: [
            /^(public|private|protected|static|\s)+\s+.*\w+\s*\([^)]*\)\s*\{/,
            /^class\s+\w/,
            /^interface\s+\w/,
        ],
    };
    const languagePatterns = patterns[language] || patterns.typescript;
    return languagePatterns.some(pattern => pattern.test(line));
}
function isClassStart(line, language) {
    const patterns = {
        typescript: [
            /^(export\s+)?class\s+\w/,
            /^(export\s+)?interface\s+\w/,
            /^(export\s+)?type\s+\w/,
            /^(export\s+)?enum\s+\w/,
        ],
        javascript: [
            /^(export\s+)?class\s+\w/,
        ],
        python: [
            /^class\s+\w/,
        ],
        java: [
            /^(public|private|protected)?\s*class\s+\w/,
            /^interface\s+\w/,
            /^enum\s+\w/,
        ],
    };
    const languagePatterns = patterns[language] || patterns.typescript;
    return languagePatterns.some(pattern => pattern.test(line));
}
function isMethodStart(line, language) {
    const patterns = {
        typescript: [
            /^\w+\s*\([^)]*\)\s*\{/,
            /^get\s+\w+\s*\([^)]*\)\s*\{/,
            /^set\s+\w+\s*\([^)]*\)\s*\{/,
            /^constructor\s*\([^)]*\)\s*\{/,
        ],
        javascript: [
            /^\w+\s*\([^)]*\)\s*\{/,
            /^get\s+\w+\s*\([^)]*\)\s*\{/,
            /^set\s+\w+\s*\([^)]*\)\s*\{/,
        ],
        python: [
            /^def\s+\w/,
        ],
        java: [
            /^\w+\s*\([^)]*\)\s*\{/,
        ],
    };
    const languagePatterns = patterns[language] || patterns.typescript;
    return languagePatterns.some(pattern => pattern.test(line));
}
/**
 * Diagnostic functions
 */
async function getVectorStoreStats() {
    const vectorManager = getVectorStoreManager();
    await vectorManager.loadVectorStore();
    return vectorManager.getStats();
}
async function validateVectorStore() {
    const issues = [];
    const vectorManager = getVectorStoreManager();
    try {
        await vectorManager.loadVectorStore();
        const stats = vectorManager.getStats();
        if (stats.totalSnippets === 0) {
            issues.push('Vector store is empty');
        }
        if (stats.snippetsWithEmbeddings === 0) {
            issues.push('No snippets have valid embeddings');
        }
        const invalidEmbeddings = vectorStore.filter(snippet => snippet.embedding && !(0, embeddings_1.validateEmbedding)(snippet.embedding)).length;
        if (invalidEmbeddings > 0) {
            issues.push(`${invalidEmbeddings} snippets have invalid embeddings`);
        }
        return {
            valid: issues.length === 0,
            issues,
            stats
        };
    }
    catch (error) {
        return {
            valid: false,
            issues: [`Failed to validate vector store: ${error}`],
            stats: {}
        };
    }
}
async function clearAllEmbeddings() {
    const vectorManager = getVectorStoreManager();
    const embeddingStorage = (0, embeddings_1.getEmbeddingStorage)();
    await vectorManager.clearVectorStore();
    await embeddingStorage.clearCache();
    console.log(' Cleared all embeddings and vector store');
}
//# sourceMappingURL=retrieve.js.map