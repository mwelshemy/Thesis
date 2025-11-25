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
exports.searchIndex = searchIndex;
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
function searchIndex(query, maxResults = 10) {
    try {
        if (!Array.isArray(searchIndexData))
            searchIndexData = [];
        if (!query || !query.trim()) {
            const recent = searchIndexData.slice().sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).slice(0, maxResults);
            log(`🔍 Empty query: returning ${recent.length} recent files`);
            return recent;
        }
        const start = Date.now();
        const tokens = normalizeAndTokenize(query);
        const bigrams = [];
        for (let i = 0; i + 1 < tokens.length; i++)
            bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
        const phraseList = Array.from(new Set([query.toLowerCase(), ...bigrams, ...tokens]));
        const variantMap = {};
        for (const p of phraseList)
            variantMap[p] = generateIdentifierVariants(p);
        const scored = [];
        for (const file of searchIndexData) {
            let score = 0;
            const reasons = [];
            const fName = (file.fileName || '').toLowerCase();
            const fPath = (file.filePath || '').toLowerCase();
            const content = (file.content || '').toLowerCase();
            if (fName === query.toLowerCase()) {
                score += 6;
                reasons.push('filename exact');
            }
            else if (fName.includes(query.toLowerCase())) {
                score += 3.5;
                reasons.push('filename contains');
            }
            if (fPath.includes(query.toLowerCase())) {
                score += 2;
                reasons.push('path contains');
            }
            const cleanedPhrase = tokens.join(' ');
            if (cleanedPhrase && content.includes(cleanedPhrase)) {
                score += 3.5;
                reasons.push('phrase in content');
            }
            let variantMatches = 0;
            for (const p of phraseList) {
                const variants = variantMap[p] || [];
                for (const v of variants) {
                    if (!v)
                        continue;
                    if (content.includes(v) || fName.includes(v) || fPath.includes(v)) {
                        const weight = Math.min(2.0, 0.5 + Math.log(Math.max(2, v.length)) / 4);
                        score += weight;
                        reasons.push(`variant:${v}`);
                        variantMatches++;
                        break;
                    }
                }
            }
            if (variantMatches > 0)
                score += Math.min(2, variantMatches * 0.2);
            const codeWords = splitCodeToWords(file.content || file.fileName || '');
            let tokenMatches = 0;
            for (const t of tokens)
                if (codeWords.includes(t))
                    tokenMatches++;
            if (tokens.length > 0) {
                const coverage = tokenMatches / tokens.length;
                score += Math.min(2, coverage * 2);
                if (tokenMatches > 0)
                    reasons.push(`tokenCoverage:${Math.round(coverage * 100)}%`);
            }
            const lengthPenalty = Math.min(1, (file.content?.length || 0) / 5000);
            if (lengthPenalty > 0.9)
                score *= 0.98;
            if (score > 0.1)
                scored.push({ file, score, reasons });
        }
        scored.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            const ta = a.file.lastModified.getTime();
            const tb = b.file.lastModified.getTime();
            return tb - ta;
        });
        let results = [];
        if (scored.length > 0) {
            results = scored.slice(0, maxResults).map(s => s.file);
        }
        else {
            log(`🔍 No scored results for "${query}" — running fallback substring/variant scan`);
            const fallback = [];
            const joined = tokens.join('');
            const normalCandidates = searchIndexData.slice(0, 800);
            for (const file of normalCandidates) {
                const hay = (file.content + ' ' + file.fileName + ' ' + file.filePath).toLowerCase();
                const anyMatch = query.toLowerCase().length > 2 && hay.includes(query.toLowerCase()) ||
                    (joined && joined.length > 2 && hay.includes(joined)) ||
                    tokens.some(t => t.length > 1 && hay.includes(t));
                if (anyMatch)
                    fallback.push(file);
                if (fallback.length >= maxResults)
                    break;
            }
            results = fallback;
        }
        const duration = Date.now() - start;
        log(`🔍 Search for "${query}": ${results.length} results in ${duration}ms`);
        (scored.slice(0, Math.min(10, scored.length))).forEach((s, i) => log(`  ${i + 1}. ${s.file.fileName} score=${s.score.toFixed(3)} reasons=${s.reasons.join('; ')}`));
        return results.slice(0, maxResults);
    }
    catch (err) {
        log(`❌ searchIndex error: ${String(err)}`);
        return searchIndexData.slice(0, Math.min(maxResults, searchIndexData.length));
    }
}
async function semanticSearch(query, maxResults = 5) {
    try {
        log(`Performing semantic search for: "${query}"`);
        const results = await (0, pipeline_1.runRetrievalPipeline)(query, maxResults);
        if (!results || results.length === 0)
            log('No semantic results found - vector store may be empty');
        else
            log(`Semantic search found ${results.length} snippets`);
        return results || [];
    }
    catch (err) {
        log(`Semantic search error: ${String(err)}`);
        return [];
    }
}
async function initializeSemanticSearch() {
    try {
        log('Initializing semantic search embeddings...');
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