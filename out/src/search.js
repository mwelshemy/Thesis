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
exports.fullTextSearch = fullTextSearch;
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
// In-memory search index
let searchIndexData = [];
let isIndexing = false;
let searchOutputChannel;
/** Safe logger (writes to VS Search channel if available else console) */
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
/**
 * Initialize search functionality with output channel and file watchers
 */
function initializeSearch(context) {
    try {
        searchOutputChannel = vscode.window.createOutputChannel('VS Search');
        context.subscriptions.push(searchOutputChannel);
        log('🔍 Search functionality initialized (output channel created)');
        // Start semantic search initialization in background (best-effort)
        initializeSemanticSearch().catch(err => {
            log(`⚠️ Semantic search init failed: ${String(err)}`);
        });
        // File watcher to auto-rebuild index on project changes
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
/**
 * Build search index by scanning workspace files (safe & resumable)
 */
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
        for (const uri of files.slice(0, 2000)) { // hard cap for performance
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
                } // skip huge files
                newIndex.push({
                    filePath: uri.fsPath,
                    fileName: path.basename(uri.fsPath),
                    language: doc.languageId,
                    content: text.substring(0, 20000), // keep a reasonable snippet
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
/** Expose index for debug tooling */
function __getIndexForDebug() {
    return searchIndexData;
}
/**
 * Normalize and tokenize a query into meaningful tokens (removes common stopwords).
 * Always returns an array (maybe empty).
 */
function normalizeAndTokenize(query) {
    if (!query)
        return [];
    const lower = query.toLowerCase().trim();
    // Replace punctuation except underscore and hyphen with space
    const cleaned = lower.replace(/[^\w\s_-]/g, ' ');
    const raw = cleaned.split(/\s+/).map(t => t.trim()).filter(Boolean);
    const stopwords = new Set([
        'where', 'can', 'i', 'find', 'the', 'a', 'an', 'how', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'my', 'that', 'this', 'please', 'show', 'me', 'by'
    ]);
    return raw.filter(t => !stopwords.has(t) && t.length > 0);
}
/** Generate identifier variants for matching code identifiers */
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
/** Split code/content into searchable words (handles camelCase, snake_case, punctuation) */
function splitCodeToWords(code) {
    if (!code)
        return [];
    const camelSplit = code.replace(/([a-z])([A-Z])/g, '$1 $2');
    const replaced = camelSplit.replace(/[_\-.]/g, ' ');
    return replaced.toLowerCase().split(/\W+/).filter(Boolean);
}
/** Extract common function/identifier names from a content snippet (lightweight heuristic) */
function extractTopIdentifiers(content, max = 10) {
    if (!content)
        return [];
    const names = new Set();
    try {
        // JS/TS function declarations and variable assignments
        const jsRegex = /function\s+([A-Za-z_]\w+)|(?:const|let|var)\s+([A-Za-z_]\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)|class\s+([A-Za-z_]\w+)/g;
        let m;
        while ((m = jsRegex.exec(content)) !== null) {
            const n = (m[1] || m[2] || m[3] || '').toLowerCase();
            if (n)
                names.add(n);
            if (names.size >= max)
                break;
        }
        // Python defs/classes
        const pyRegex = /def\s+([A-Za-z_]\w+)\s*\(|class\s+([A-Za-z_]\w+)\s*\(?/g;
        while ((m = pyRegex.exec(content)) !== null) {
            const n = (m[1] || m[2] || '').toLowerCase();
            if (n)
                names.add(n);
            if (names.size >= max)
                break;
        }
        // Java-like methods and classes
        const javaRegex = /(?:public|private|protected)\s+(?:static\s+)?[A-Za-z_<>\[\]]+\s+([A-Za-z_]\w+)\s*\(|class\s+([A-Za-z_]\w+)/g;
        while ((m = javaRegex.exec(content)) !== null) {
            const n = (m[1] || m[2] || '').toLowerCase();
            if (n)
                names.add(n);
            if (names.size >= max)
                break;
        }
    }
    catch (err) {
        // ignore heuristics errors
    }
    return Array.from(names).slice(0, max);
}
/**
 * Primary search function.
 * - Robust to empty query, missing index, and noisy queries.
 * - Uses multi-factor scoring: filename/path, phrase match, identifier variants, token coverage.
 * - Falls back to simple substring/identifier search if nothing scored.
 */
function searchIndex(query, maxResults = 10) {
    try {
        // Defensive: ensure index exists
        if (!Array.isArray(searchIndexData))
            searchIndexData = [];
        // If query empty, return recent files (or top by lines)
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
        // Build phrase list to consider
        const phraseList = Array.from(new Set([query.toLowerCase(), ...bigrams, ...tokens]));
        // Precompute variant map for phrases
        const variantMap = {};
        for (const p of phraseList)
            variantMap[p] = generateIdentifierVariants(p);
        const scored = [];
        // Iterate index and compute score (fast heuristics)
        for (const file of searchIndexData) {
            let score = 0;
            const reasons = [];
            const fName = (file.fileName || '').toLowerCase();
            const fPath = (file.filePath || '').toLowerCase();
            const content = (file.content || '').toLowerCase();
            // filename/path signals (high weight)
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
            // phrase match in content (strong)
            const cleanedPhrase = tokens.join(' ');
            if (cleanedPhrase && content.includes(cleanedPhrase)) {
                score += 3.5;
                reasons.push('phrase in content');
            }
            // identifier variant matches (stronger boost for identifier/function name matches)
            let variantMatches = 0;
            for (const p of phraseList) {
                const variants = variantMap[p] || [];
                for (const v of variants) {
                    if (!v)
                        continue;
                    if (content.includes(v) || fName.includes(v) || fPath.includes(v)) {
                        // weight by length (longer variants are stronger)
                        const weight = Math.min(3.0, 0.8 + Math.log(Math.max(2, v.length)) / 3);
                        score += weight;
                        reasons.push(`variant:${v}`);
                        variantMatches++;
                        break;
                    }
                }
            }
            if (variantMatches > 0)
                score += Math.min(3, variantMatches * 0.4);
            // IDENTIFIER / FUNCTION NAME MATCH: extract top identifiers and boost if any match query tokens
            const identifiers = extractTopIdentifiers(file.content || '', 8);
            let idMatches = 0;
            for (const id of identifiers) {
                for (const t of tokens) {
                    if (id.includes(t) || t.includes(id)) {
                        idMatches++;
                        break;
                    }
                }
            }
            if (idMatches > 0) {
                const idBoost = Math.min(3, 1.2 + idMatches * 0.6);
                score += idBoost;
                reasons.push(`identifiers:${idMatches}`);
            }
            // token coverage in code words (weaker)
            const codeWords = splitCodeToWords(file.content || file.fileName || '');
            let tokenMatches = 0;
            for (const t of tokens)
                if (codeWords.includes(t))
                    tokenMatches++;
            if (tokens.length > 0) {
                const coverage = tokenMatches / tokens.length;
                score += Math.min(2, coverage * 2); // 0..2
                if (tokenMatches > 0)
                    reasons.push(`tokenCoverage:${Math.round(coverage * 100)}%`);
            }
            // small prefer shorter snippet files (reduce noise)
            const lengthPenalty = Math.min(1, (file.content?.length || 0) / 5000);
            if (lengthPenalty > 0.9)
                score *= 0.98;
            if (score > 0.1)
                scored.push({ file, score, reasons });
        }
        // Sort scored results
        scored.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            const ta = a.file.lastModified.getTime();
            const tb = b.file.lastModified.getTime();
            return tb - ta;
        });
        // If no scored results, run fallback direct scanning with identifier variants (guarantee some behavior)
        let results = [];
        if (scored.length > 0) {
            results = scored.slice(0, maxResults).map(s => s.file);
        }
        else {
            log(`🔍 No scored results for "${query}" — running fallback substring/identifier scan`);
            const fallback = [];
            const joined = tokens.join('');
            const normalCandidates = searchIndexData.slice(0, 800); // cap work
            for (const file of normalCandidates) {
                const hay = (file.content + ' ' + file.fileName + ' ' + file.filePath).toLowerCase();
                // also check identifiers
                const ids = extractTopIdentifiers(file.content || '', 6);
                const identifierMatch = ids.some(id => tokens.some(t => id.includes(t) || t.includes(id)));
                const anyMatch = (query.toLowerCase().length > 2 && hay.includes(query.toLowerCase())) ||
                    (joined && joined.length > 2 && hay.includes(joined)) ||
                    tokens.some(t => t.length > 1 && hay.includes(t)) ||
                    identifierMatch;
                if (anyMatch)
                    fallback.push(file);
                if (fallback.length >= maxResults)
                    break;
            }
            results = fallback;
        }
        const duration = Date.now() - start;
        log(`🔍 Search for "${query}": ${results.length} results in ${duration}ms`);
        // debug top reasons if available
        (scored.slice(0, Math.min(10, scored.length))).forEach((s, i) => log(`  ${i + 1}. ${s.file.fileName} score=${s.score.toFixed(3)} reasons=${s.reasons.join('; ')}`));
        return results.slice(0, maxResults);
    }
    catch (err) {
        log(`❌ searchIndex error: ${String(err)}`);
        // On unexpected error, return recent files rather than nothing
        return searchIndexData.slice(0, Math.min(maxResults, searchIndexData.length));
    }
}
/**
 * New: Full-text project-wide substring search (behavior like VS Code Ctrl+F but across files).
 * - Case-insensitive by default (matches VS default behavior), can be toggled via caseInsensitive flag.
 * - Two-pass approach:
 *    1) Fast check against in-memory index snippets (cheap).
 *    2) If needed (or forced), scan workspace files by opening documents to search full content.
 *
 * Returns array of FileIndexEntry objects (filePath/fileName/language/lineCount/lastModified and a content snippet).
 */
async function fullTextSearch(query, maxResults = 50, caseInsensitive = true) {
    try {
        if (!query || !query.trim())
            return [];
        const q = caseInsensitive ? query.toLowerCase() : query;
        // Ensure we have an index to run the quick pass
        if (!Array.isArray(searchIndexData))
            searchIndexData = [];
        const quickMatches = [];
        for (const f of searchIndexData) {
            try {
                const hay = caseInsensitive ? (f.content || '').toLowerCase() : (f.content || '');
                const nameHay = caseInsensitive ? (f.fileName || '').toLowerCase() : (f.fileName || '');
                const pathHay = caseInsensitive ? (f.filePath || '').toLowerCase() : (f.filePath || '');
                if ((q.length > 0 && hay.includes(q)) || nameHay.includes(q) || pathHay.includes(q)) {
                    quickMatches.push(f);
                    if (quickMatches.length >= maxResults)
                        break;
                }
            }
            catch (e) {
                // ignore per-file errors
            }
        }
        if (quickMatches.length >= Math.min(5, maxResults)) {
            // If we found a handful of good matches quickly, return them immediately (fast UX).
            return quickMatches.slice(0, maxResults);
        }
        // If quick pass found some but less than desired, or none, perform a workspace-wide scan.
        const results = [...quickMatches];
        // Limit how many files we will open to avoid slowing VS too much.
        const maxFilesToOpen = 800;
        const workspaceFiles = await vscode.workspace.findFiles('**/*', '**/node_modules/**', maxFilesToOpen);
        for (const uri of workspaceFiles) {
            if (results.length >= maxResults)
                break;
            try {
                // Skip files already in quickMatches
                if (results.some(r => r.filePath === uri.fsPath))
                    continue;
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                const hay = caseInsensitive ? text.toLowerCase() : text;
                if (hay.includes(q)) {
                    results.push({
                        filePath: uri.fsPath,
                        fileName: path.basename(uri.fsPath),
                        language: doc.languageId,
                        content: text.substring(0, 2000), // include small snippet
                        lineCount: doc.lineCount,
                        lastModified: new Date(),
                    });
                }
            }
            catch (err) {
                // ignore files we can't open
                continue;
            }
        }
        // Sort results: prefer files where query appears earlier and shorter files
        results.sort((a, b) => {
            try {
                const aContent = caseInsensitive ? (a.content || '').toLowerCase() : (a.content || '');
                const bContent = caseInsensitive ? (b.content || '').toLowerCase() : (b.content || '');
                const ai = aContent.indexOf(q);
                const bi = bContent.indexOf(q);
                if (ai !== bi)
                    return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
                // fallback tie-breaker: more recent first
                return (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0);
            }
            catch {
                return 0;
            }
        });
        return results.slice(0, maxResults);
    }
    catch (err) {
        log(`fullTextSearch error: ${String(err)}`);
        return [];
    }
}
/**
 * Semantic search using embeddings (best-effort).
 * If the pipeline fails, logs and returns an empty array so callers can fallback.
 */
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
/**
 * Initialize semantic search system (embedding generation). Best-effort.
 */
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
/** Utility getters & management */
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
/** Small helper to estimate index size */
function calculateIndexSize(entries) {
    const total = entries.reduce((s, f) => s + (f.content?.length || 0) + (f.filePath?.length || 0) + (f.fileName?.length || 0), 0);
    return `${Math.round(total / 1024)} KB`;
}
//# sourceMappingURL=search.js.map