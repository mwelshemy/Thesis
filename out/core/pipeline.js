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
exports.generateEmbeddingsForProject = void 0;
exports.runRetrievalPipeline = runRetrievalPipeline;
exports.initializeEmbeddings = initializeEmbeddings;
const retrieve_1 = require("./retrieve");
const rank_1 = require("./rank");
const queryUnderstanding_1 = require("./queryUnderstanding");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const callAI_1 = require("../src/ai/callAI"); // use unified AI wrapper with health checks + timeouts
var retrieve_2 = require("./retrieve");
Object.defineProperty(exports, "generateEmbeddingsForProject", { enumerable: true, get: function () { return retrieve_2.generateEmbeddingsForProject; } });
/**
 * Utility: call the local AI via callAI wrapper (handles health, retries, timeouts).
 * The callAI function returns a string body already (see callAI.ts).
 */
async function callLocalAI(prompt, timeoutMs = 45000) {
    // callAI handles health gating and timeouts internally; we still enforce a outer timeout.
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await (0, callAI_1.callAI)(prompt); // uses callAI.ts robust wrapper
        clearTimeout(id);
        return resp;
    }
    catch (err) {
        clearTimeout(id);
        throw err;
    }
}
/**
 * Levenshtein distance for fuzzy matching to handle typos (e.g., "dunction" -> "function", "searchutils" vs "SearchUtils")
 */
function levenshtein(a, b) {
    const A = a || '';
    const B = b || '';
    const n = A.length;
    const m = B.length;
    if (n === 0)
        return m;
    if (m === 0)
        return n;
    const v0 = new Array(m + 1);
    const v1 = new Array(m + 1);
    for (let j = 0; j <= m; j++)
        v0[j] = j;
    for (let i = 0; i < n; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < m; j++) {
            const cost = A[i] === B[j] ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= m; j++)
            v0[j] = v1[j];
    }
    return v1[m];
}
function fuzzyEquals(a, b, maxRatio = 0.35) {
    if (!a || !b)
        return false;
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    const l = Math.max(la.length, lb.length);
    if (l === 0)
        return true;
    const dist = levenshtein(la, lb);
    return dist / l <= maxRatio;
}
/**
 * Generate identifier variants for a candidate token.
 * E.g., "searchutils" -> ["searchutils","search_utils","search-utils","searchUtils","SearchUtils"]
 */
function generateIdentifierVariants(token) {
    const t = token.replace(/[^A-Za-z0-9_]/g, '');
    if (!t)
        return [];
    const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
    const snake = parts.map(p => p.toLowerCase()).join('_');
    const kebab = parts.map(p => p.toLowerCase()).join('-');
    const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const lower = t.toLowerCase();
    return Array.from(new Set([lower, snake, kebab, camel, pascal]));
}
/**
 * Fast lexical scan for symbol definitions (class/function/type/def) or filename matches.
 * Additionally performs fuzzy symbol-name matches so minor typos still resolve.
 */
async function lexicalCodeSearchVariants(variants, workspaceRoot, extensions = ['.ts', '.js', '.tsx', '.jsx', '.py']) {
    const matches = [];
    // Determine workspace base dir
    let baseDir = workspaceRoot;
    try {
        if (!baseDir && vscode?.workspace?.workspaceFolders?.length) {
            baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }
    catch {
        // fallback
    }
    if (!baseDir)
        baseDir = process.cwd();
    async function searchDir(dir) {
        let entries;
        try {
            entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // skip common heavy dirs
                if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name))
                    continue;
                await searchDir(entryPath);
            }
            else {
                const ext = path.extname(entry.name).toLowerCase();
                if (!extensions.includes(ext))
                    continue;
                let text;
                try {
                    text = await fs_1.promises.readFile(entryPath, 'utf8');
                }
                catch {
                    continue;
                }
                const lines = text.split('\n');
                const filenameNoExt = entry.name.replace(/\.[^.]+$/, '').toLowerCase();
                // Filename match (exact/contains/fuzzy)
                for (const v of variants) {
                    if (filenameNoExt === v.toLowerCase() || filenameNoExt.includes(v.toLowerCase()) || fuzzyEquals(filenameNoExt, v)) {
                        matches.push({
                            filename: entry.name,
                            filepath: entryPath,
                            content: lines.slice(0, Math.min(200, lines.length)).join('\n'),
                            language: ext === '.py' ? 'python' : (ext === '.js' ? 'javascript' : 'typescript'),
                            lineNumber: 1,
                            relevance: 0.8,
                            symbolSignature: '',
                            docComment: '',
                            diagnostic: 'Filename contains/fuzzy-match variant',
                            symbolName: v
                        });
                        break;
                    }
                }
                // Search for top-level symbol definitions, allowing fuzzy matching of names
                fileLoop: for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // quick extract candidate name tokens from line (words with identifier chars)
                    const tokenMatches = (line.match(/[A-Za-z_]\w*/g) || []);
                    for (const v of variants) {
                        // symbol regexes to detect definitions (exact), we still allow fuzzy test if exact fails
                        const symbolRegexes = [
                            new RegExp(`(^|\\s)(export\\s+)?(class|interface|type)\\s+${v}\\b`, 'i'),
                            new RegExp(`(^|\\s)(export\\s+)?(function)\\s+${v}\\b`, 'i'),
                            new RegExp(`(^|\\s)(const|let|var)\\s+${v}\\s*=`, 'i'),
                            new RegExp(`(^|\\s)(def)\\s+${v}\\b`, 'i'),
                            new RegExp(`\\b${v}\\.prototype\\.`)
                        ];
                        let matched = symbolRegexes.some(rx => rx.test(line));
                        // If not exact matched, try fuzzy against tokenMatches
                        if (!matched && tokenMatches.length > 0) {
                            for (const tok of tokenMatches) {
                                if (fuzzyEquals(tok, v)) {
                                    matched = true;
                                    break;
                                }
                            }
                        }
                        if (matched) {
                            const start = Math.max(0, i - 3);
                            const preview = lines.slice(start, Math.min(lines.length, i + 20)).join('\n');
                            matches.push({
                                filename: entry.name,
                                filepath: entryPath,
                                content: preview,
                                language: ext === '.py' ? 'python' : (ext === '.js' ? 'javascript' : 'typescript'),
                                lineNumber: i + 1,
                                relevance: 0.99,
                                symbolSignature: line.trim(),
                                docComment: '',
                                diagnostic: `Lexical definition match (exact or fuzzy for ${v})`,
                                symbolName: v
                            });
                            break fileLoop;
                        }
                    }
                }
            }
        }
    }
    await searchDir(baseDir);
    return matches;
}
/**
 * runRetrievalPipeline: improved lexical fallback using identifier variants, fuzzy matching,
 * and AI-based synthesis/extraction of the requested function/class implementation.
 *
 * Key behavior:
 * - Detect likely symbol token even from a misspelled query.
 * - Generate identifier variants and fuzzy-match across file names and symbol signatures.
 * - If lexical or semantic context exists, call AI (callAI) to extract/synthesize the implementation.
 * - Prepend AI-extracted snippet to results with very high relevance.
 */
async function runRetrievalPipeline(query, maxResults = 5, minSimilarity = 0.15) {
    try {
        console.log(`Running semantic search for: "${query}" (min similarity: ${minSimilarity})`);
        const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(query);
        console.log('Query analysis:', queryAnalysis);
        // 1) Get semantic candidates
        const retrieved = await (0, retrieve_1.retrieveCandidates)(query, maxResults * 8);
        let ranked = (0, rank_1.rankCandidates)(retrieved, query);
        // 2) If query intent indicates a symbol lookup (function/class), try lexical+fuzzy+AI extraction
        if (queryAnalysis.mainIntent === 'class' || queryAnalysis.mainIntent === 'function' || queryAnalysis.isFunctionSearch) {
            // Clean tokens and pick a candidate token from the query (robust to typos)
            const tokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search|dunction/i.test(t)); // note 'dunction' tolerated by filter
            let candidateRaw = '';
            if (tokens.length > 0) {
                // prefer CamelCase-ish or last token heuristics
                candidateRaw = tokens.reverse().find(tok => /[A-Za-z_]\w*/.test(tok)) || tokens[tokens.length - 1];
                // if token is likely misspelled and too short, examine capitalized words in original query
                if (!candidateRaw || candidateRaw.length <= 2) {
                    const camel = query.match(/\b[A-Z][A-Za-z0-9_]+\b/);
                    if (camel)
                        candidateRaw = camel[0];
                }
            }
            candidateRaw = (candidateRaw || '').trim();
            if (candidateRaw) {
                // generate variants and run lexical fuzzy search
                const variants = generateIdentifierVariants(candidateRaw);
                console.log(`Candidate token: '${candidateRaw}', variants:`, variants);
                const lexicalResults = await lexicalCodeSearchVariants(variants);
                // Merge lexical results (prioritized) and semantic ones
                const byPath = new Map();
                for (const r of lexicalResults) {
                    const existing = byPath.get(r.filepath);
                    if (!existing || (r.relevance || 0) > (existing.relevance || 0))
                        byPath.set(r.filepath, r);
                }
                for (const s of ranked) {
                    if (!byPath.has(s.filepath))
                        byPath.set(s.filepath, s);
                    else {
                        const existing = byPath.get(s.filepath);
                        if (s.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(s.symbolSignature)) {
                            s.diagnostic = (s.diagnostic || '') + '; semantic also contains symbol';
                            byPath.set(s.filepath, s);
                        }
                    }
                }
                ranked = Array.from(byPath.values()).sort((a, b) => {
                    const ra = a.relevance || 0;
                    const rb = b.relevance || 0;
                    if (ra !== rb)
                        return rb - ra;
                    const aHasSig = !!(a.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(a.symbolSignature));
                    const bHasSig = !!(b.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(b.symbolSignature));
                    if (aHasSig && !bHasSig)
                        return -1;
                    if (!aHasSig && bHasSig)
                        return 1;
                    return 0;
                });
                // Build AI context: prefer best lexical result, else top semantic snippets
                const bestLexical = lexicalResults && lexicalResults.length > 0 ? (lexicalResults.find(r => r.relevance && r.relevance >= 0.98) || lexicalResults[0]) : undefined;
                const aiContextBase = bestLexical ? [bestLexical, ...ranked.slice(0, 6)] : ranked.slice(0, 8);
                // Always attempt AI extraction/synthesis for function/class requests (helps with typos)
                try {
                    const ctxSnippets = aiContextBase.map(s => {
                        const preview = s.content || '';
                        return `File: ${s.filepath}\nLine: ${s.lineNumber}\n---\n${preview.substring(0, 1200)}\n`;
                    }).join("\n\n---\n\n");
                    const prompt = `You are an expert assistant with access to the project's code snippets. The user requested: "${query}".\n` +
                        `Find and return the full implementation for the function or class named "${candidateRaw}".\n` +
                        `Use the following code snippets (which are excerpts from the repository) as context:\n\n${ctxSnippets}\n\n` +
                        `If you find an exact definition in the snippets, return ONLY the code block for the implementation (use a language fence like \`\`\`typescript ... \`\`\`).\n` +
                        `If the implementation is fragmented, merge into a single coherent implementation and return that code block. Also include a one-line comment with original file path(s). If not found, provide a best-effort implementation based on the context. Return only the code block.`;
                    const aiResp = await callLocalAI(prompt, 45000);
                    const fenceMatch = aiResp.match(/```(?:[a-zA-Z0-9+-]*)\n([\s\S]*?)```/);
                    if (fenceMatch) {
                        const code = fenceMatch[1].trim();
                        const synthesizedSnippet = {
                            filename: `${candidateRaw}.generated`,
                            filepath: bestLexical?.filepath || (ranked[0]?.filepath || 'AI_synthesis'),
                            content: code,
                            language: bestLexical?.language || (ranked[0]?.language || 'typescript'),
                            lineNumber: 1,
                            embedding: undefined,
                            relevance: 0.995,
                            symbolSignature: code.split('\n')[0] || '',
                            docComment: '',
                            diagnostic: 'AI-extracted or synthesized implementation',
                            symbolName: candidateRaw
                        };
                        // Prepend synthesized snippet (highest priority)
                        ranked = [synthesizedSnippet, ...ranked];
                    }
                    else {
                        const fallback = aiResp.trim();
                        if (fallback.length > 0) {
                            const synthesizedSnippet = {
                                filename: `${candidateRaw}.generated`,
                                filepath: bestLexical?.filepath || (ranked[0]?.filepath || 'AI_synthesis'),
                                content: fallback.substring(0, 4000),
                                language: bestLexical?.language || (ranked[0]?.language || 'typescript'),
                                lineNumber: 1,
                                embedding: undefined,
                                relevance: 0.95,
                                symbolSignature: fallback.split('\n')[0] || '',
                                docComment: '',
                                diagnostic: 'AI-extracted (no fence) implementation',
                                symbolName: candidateRaw
                            };
                            ranked = [synthesizedSnippet, ...ranked];
                        }
                    }
                }
                catch (aiErr) {
                    console.warn('AI extraction/synthesis failed:', aiErr);
                }
            }
        }
        // Final filtering by dynamic threshold
        const bestScore = ranked[0]?.relevance || 0;
        const dynamicThreshold = Math.max(minSimilarity, bestScore * 0.3);
        const filteredResults = ranked.filter(snippet => (snippet.relevance || 0) >= dynamicThreshold).slice(0, maxResults);
        console.log(`Final results count: ${filteredResults.length} (best: ${bestScore})`);
        return filteredResults;
    }
    catch (error) {
        console.error('Retrieval pipeline error:', error);
        return [];
    }
}
/**
 * Initialize the embedding system
 */
async function initializeEmbeddings() {
    console.log('Initializing code embeddings...');
    await (0, retrieve_1.generateEmbeddingsForProject)();
    console.log('Embeddings system ready');
}
//# sourceMappingURL=pipeline.js.map