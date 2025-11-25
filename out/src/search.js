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
exports.initializeSearch = initializeSearch;
exports.buildSearchIndex = buildSearchIndex;
exports.__getIndexForDebug = __getIndexForDebug;
exports.semanticSearch = semanticSearch;
exports.initializeSemanticSearch = initializeSemanticSearch;
exports.getSearchStats = getSearchStats;
exports.clearSearchIndex = clearSearchIndex;
exports.getFileByPath = getFileByPath;
exports.searchByLanguage = searchByLanguage;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const pipeline_1 = require("../core/pipeline");
const retrieve_1 = require("../core/retrieve");
let searchIndexData = [];
let isIndexing = false;
let searchOutputChannel;
function log(msg) {
    try {
        if (searchOutputChannel)
            searchOutputChannel.appendLine(msg);
        else
            console.log(msg);
    }
    catch {
        console.log(msg);
    }
}
function initializeSearch(context) {
    try {
        searchOutputChannel = vscode.window.createOutputChannel('VS Search');
        context.subscriptions.push(searchOutputChannel);
        log('🔍 Search functionality initialized (output channel created)');
        initializeSemanticSearch().catch(err => {
            log(`⚠️ Semantic search init failed: ${String(err)}`);
        });
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,py,java,cs,cpp,md,json,html,css}');
        watcher.onDidCreate((uri) => { log(`📁 File created: ${uri.fsPath}`); buildSearchIndex().catch(() => { }); });
        watcher.onDidChange((uri) => { log(`📁 File changed: ${uri.fsPath}`); buildSearchIndex().catch(() => { }); });
        watcher.onDidDelete((uri) => { log(`📁 File deleted: ${uri.fsPath}`); buildSearchIndex().catch(() => { }); });
        context.subscriptions.push(watcher);
        return searchOutputChannel;
    }
    catch (err) {
        console.error('Failed to initialize search output channel', err);
        throw err;
    }
}
async function buildSearchIndex() {
    if (isIndexing) {
        log('⚠️ Indexing already in progress...');
        return searchIndexData;
    }
    isIndexing = true;
    const start = Date.now();
    try {
        log('📁 Building search index...');
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            log('⚠️ No workspace open - cannot build index');
            isIndexing = false;
            return searchIndexData;
        }
        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,cs,cpp,md,json,html,css}', '**/node_modules/**');
        log(`⏱️ Scanning workspace: found ${files.length} file candidates`);
        const newIndex = [];
        let processed = 0;
        let skipped = 0;
        for (const uri of files.slice(0, 2000)) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                if (!text || text.trim().length === 0) {
                    skipped++;
                    continue;
                }
                if (text.length > 200000) {
                    skipped++;
                    continue;
                }
                newIndex.push({
                    filePath: uri.fsPath,
                    fileName: path.basename(uri.fsPath),
                    language: doc.languageId,
                    content: text.substring(0, 20000),
                    lineCount: doc.lineCount,
                    lastModified: new Date(),
                });
                processed++;
            }
            catch (err) {
                skipped++;
                continue;
            }
        }
        searchIndexData = newIndex;
        const duration = Date.now() - start;
        log(`✅ Search index built in ${duration}ms`);
        log(`📊 Statistics: ${processed} files indexed, ${skipped} skipped`);
        log(`💾 Total index size: ${calculateIndexSize(searchIndexData)}`);
        isIndexing = false;
        return searchIndexData;
    }
    catch (err) {
        isIndexing = false;
        log(`❌ Error building index: ${String(err)}`);
        return searchIndexData;
    }
}
function __getIndexForDebug() {
    return searchIndexData;
}
function normalizeAndTokenize(query) {
    if (!query)
        return [];
    const lower = query.toLowerCase().trim();
    const cleaned = lower.replace(/[^\w\s_-]/g, ' ');
    const raw = cleaned.split(/\s+/).map(t => t.trim()).filter(Boolean);
    const stopwords = new Set([
        'where', 'can', 'i', 'find', 'the', 'a', 'an', 'how', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'my', 'that', 'this', 'please', 'show', 'me'
    ]);
    return raw.filter(t => !stopwords.has(t) && t.length > 0);
}
function generateIdentifierVariants(phrase) {
    if (!phrase)
        return [];
    const parts = phrase.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    if (parts.length === 0)
        return [];
    const joined = parts.join('');
    const snake = parts.join('_');
    const kebab = parts.join('-');
    const camel = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const variants = Array.from(new Set([phrase.toLowerCase(), ...parts, joined, snake, camel, pascal, kebab]));
    return variants;
}
function splitCodeToWords(code) {
    if (!code)
        return [];
    const camelSplit = code.replace(/([a-z])([A-Z])/g, '$1 $2');
    const replaced = camelSplit.replace(/[_\-.]/g, ' ');
    return replaced.toLowerCase().split(/\W+/).filter(Boolean);
}
function semanticFallback(query, maxResults = 10, language = 'any') {
    const tokens = normalizeAndTokenize(query);
    if (tokens.length === 0)
        return [];
    const candidates = (searchIndexData || []).filter(f => language === 'any' || (f.language || '').toLowerCase().includes(language.toLowerCase()));
    const scored = candidates.map(f => {
        const hay = (f.content + ' ' + f.fileName + ' ' + f.filePath).toLowerCase();
        let score = 0;
        for (const t of tokens) {
            if (hay.includes(t))
                score += 1;
            if ((f.fileName || '').toLowerCase().includes(t))
                score += 1.5;
        }
        const norm = Math.min(1, score / Math.max(1, tokens.length * 2));
        return { item: f, score: norm };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);
    return scored.map(s => ({
        filePath: s.item.filePath,
        fileName: s.item.fileName,
        language: s.item.language,
        codeSnippet: (s.item.content || '').substring(0, 800),
        lineNumber: 1,
        confidence: s.score,
        explanation: `Keyword overlap: ${(s.score * 100).toFixed(0)}%`
    }));
}
async function semanticSearch(query, maxResults = 6, language = 'any') {
    try {
        log(`🔬 Performing semantic search for: "${query}" (language=${language})`);
        if (!searchIndexData || searchIndexData.length === 0) {
            await buildSearchIndex();
        }
        try {
            const results = await (0, pipeline_1.runRetrievalPipeline)(query, maxResults);
            if (results && results.length > 0) {
                log(`🔬 Embedding pipeline returned ${results.length} snippets`);
                const mapped = results.map(r => {
                    const filePath = r.filePath || r.path || r.file || r.file_name || r.filename || '';
                    const fileName = filePath ? path.basename(filePath) : (r.fileName || r.name || 'unknown');
                    const languageDetected = (r.language || r.lang || (r.metadata && r.metadata.language) || '').toLowerCase() || (r.filePath ? getLanguageFromExtension(r.filePath.split('.').pop() || '') : '');
                    const codeSnippet = (r.code || r.snippet || r.text || r.content || '').toString().substring(0, 1200);
                    const lineNumber = Number(r.startLine || r.lineNumber || r.start || 1) || 1;
                    const confidence = Number(r.score ?? r.similarity ?? r.confidence ?? 0.6) || 0.6;
                    const explanation = r.explanation || r.meta || 'Embedding similarity match';
                    return { filePath, fileName, language: languageDetected, codeSnippet, lineNumber, confidence, explanation };
                });
                const filtered = mapped.filter(m => language === 'any' || (m.language || '').toLowerCase().includes((language || '').toLowerCase()));
                return filtered.slice(0, maxResults);
            }
            else {
                log('🔬 Embedding pipeline returned no results - falling back');
            }
        }
        catch (err) {
            log(`⚠️ Embedding pipeline error: ${String(err)} - falling back to token-based search`);
        }
        const fallback = semanticFallback(query, maxResults, language);
        log(`🔁 Fallback semantic returned ${fallback.length} results`);
        return fallback;
    }
    catch (err) {
        log(`❌ semanticSearch error: ${String(err)}`);
        return [];
    }
}
async function initializeSemanticSearch() {
    try {
        log('Initializing semantic search embeddings (best-effort)...');
        const embeddings = await (0, retrieve_1.generateEmbeddingsForProject)().catch(err => {
            log(`⚠️ generateEmbeddingsForProject failed: ${String(err)}`);
            return [];
        });
        log(`Generated ${embeddings?.length ?? 0} embeddings (may be 0 if failed)`);
    }
    catch (err) {
        log(`Semantic init failed: ${String(err)}`);
    }
}
function getSearchStats() {
    return {
        fileCount: searchIndexData.length,
        totalLines: searchIndexData.reduce((sum, f) => sum + (f.lineCount || 0), 0),
        isIndexing,
        totalIndexSize: calculateIndexSize(searchIndexData),
        lastIndexBuild: searchIndexData.length > 0 ? new Date() : null,
    };
}
function clearSearchIndex() {
    searchIndexData = [];
    log('🗑️ Search index cleared');
}
function getFileByPath(filePath) {
    return searchIndexData.find(f => f.filePath === filePath);
}
function searchByLanguage(language) {
    return searchIndexData.filter(f => f.language === language);
}
function calculateIndexSize(entries) {
    const total = entries.reduce((s, f) => s + (f.content?.length || 0) + (f.filePath?.length || 0) + (f.fileName?.length || 0), 0);
    return `${Math.round(total / 1024)} KB`;
}
//# sourceMappingURL=search.js.map