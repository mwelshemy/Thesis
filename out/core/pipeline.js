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
exports.splitCodeIntoChunksWithContext = splitCodeIntoChunksWithContext;
exports.runRetrievalPipeline = runRetrievalPipeline;
exports.initializeEmbeddings = initializeEmbeddings;
const retrieve_1 = require("./retrieve");
const rank_1 = require("./rank");
const queryUnderstanding_1 = require("./queryUnderstanding");
const vscode = __importStar(require("vscode"));
const callAI_1 = require("../src/ai/callAI"); // robust wrapper
var retrieve_2 = require("./retrieve");
Object.defineProperty(exports, "generateEmbeddingsForProject", { enumerable: true, get: function () { return retrieve_2.generateEmbeddingsForProject; } });
function splitCodeIntoChunksWithContext(content, language) {
    const blocks = [];
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
            docCommentLines.push(trimmed.replace(/^\/\/\s*|^\/\*\s*|^\*\s*/, ''));
            continue;
        }
        const m = trimmed.match(symbolRegex);
        if (m) {
            if (currentBlock.length > 0)
                pushBlock();
            symbolSignature = trimmed;
            startLine = i + 1;
            currentBlock.push(line);
            docCommentLines = docCommentLines;
        }
        else {
            currentBlock.push(line);
        }
        if (currentBlock.length >= 40) {
            pushBlock();
            startLine = i + 2;
        }
    }
    pushBlock();
    return blocks;
}
/**
 * Merges semantic and lexical results for robust retrieval
 */
function extractLikelySymbolToken(query) {
    const tokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search|dunction/i.test(t));
    let candidate = tokens.reverse().find(tok => /[A-Za-z_]\w*/.test(tok)) || tokens[tokens.length - 1];
    if (!candidate || candidate.length <= 2) {
        const camel = query.match(/\b[A-Z][A-Za-z0-9_]+\b/);
        if (camel)
            candidate = camel[0];
    }
    return (candidate || '').trim();
}
function generateIdentifierVariants(token) {
    const t = token.replace(/[^A-Za-z0-9_]/g, '');
    if (!t)
        return [];
    const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
    const snake = parts.map(p => p.toLowerCase()).join('_');
    const kebab = parts.map(p => p.toLowerCase()).join('-');
    const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return Array.from(new Set([t.toLowerCase(), snake, kebab, camel, pascal]));
}
// Lexical fuzzy search (filename and symbol), robust to typos and variants
async function lexicalCodeSearchVariants(variants, workspaceRoot, extensions = ['.ts', '.js', '.tsx', '.jsx', '.py']) {
    const matches = [];
    let baseDir = workspaceRoot;
    try {
        if (!baseDir && vscode?.workspace?.workspaceFolders?.length)
            baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    catch { }
    if (!baseDir)
        baseDir = process.cwd();
    const fs = require('fs');
    const path = require('path');
    async function searchDir(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
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
                    text = fs.readFileSync(entryPath, 'utf8');
                }
                catch {
                    continue;
                }
                const lines = text.split('\n');
                const filenameNoExt = entry.name.replace(/\.[^.]+$/, '').toLowerCase();
                for (const v of variants) {
                    if (filenameNoExt === v.toLowerCase() || filenameNoExt.includes(v.toLowerCase())) {
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
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const tokenMatches = (line.match(/[A-Za-z_]\w*/g) || []);
                    for (const v of variants) {
                        const symbolRegexes = [
                            new RegExp(`(^|\\s)(export\\s+)?(class|interface|type)\\s+${v}\\b`, 'i'),
                            new RegExp(`(^|\\s)(export\\s+)?(function)\\s+${v}\\b`, 'i'),
                            new RegExp(`(^|\\s)(const|let|var)\\s+${v}\\s*=`, 'i'),
                            new RegExp(`(^|\\s)(def)\\s+${v}\\b`, 'i'),
                            new RegExp(`\\b${v}\\.prototype\\.`)
                        ];
                        let matched = symbolRegexes.some(rx => rx.test(line));
                        if (!matched && tokenMatches.length > 0) {
                            for (const tok of tokenMatches) {
                                if (tok.toLowerCase() === v.toLowerCase()) {
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
                                diagnostic: `Lexical definition match`,
                                symbolName: v
                            });
                            break;
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
 * Retrieval pipeline - semantic + lexical fallback + AI synthesis
 */
async function runRetrievalPipeline(query, maxResults = 5, minSimilarity = 0.15) {
    try {
        const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(query);
        // 1. Semantic similarity candidates
        const retrieved = await (0, retrieve_1.retrieveCandidates)(query, maxResults * 8);
        let ranked = (0, rank_1.rankCandidates)(retrieved, query);
        // 2. Lexical & fuzzy fallback if intent is function/class
        if (queryAnalysis.isFunctionSearch || queryAnalysis.isClassSearch) {
            const candidateRaw = extractLikelySymbolToken(query);
            if (candidateRaw) {
                const variants = generateIdentifierVariants(candidateRaw);
                const lexicalResults = await lexicalCodeSearchVariants(variants);
                const byPath = new Map();
                for (const r of lexicalResults) {
                    const existing = byPath.get(r.filepath);
                    if (!existing || (r.relevance ?? 0) > (existing.relevance ?? 0))
                        byPath.set(r.filepath, r);
                }
                for (const s of ranked) {
                    if (!byPath.has(s.filepath))
                        byPath.set(s.filepath, s);
                    else if (s.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(s.symbolSignature)) {
                        s.diagnostic = (s.diagnostic || '') + '; semantic also contains symbol';
                        byPath.set(s.filepath, s);
                    }
                }
                ranked = Array.from(byPath.values()).sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
                // AI synthesis of symbol implementation (function/class), using code snippets as context
                try {
                    const ctxSnippets = ranked.slice(0, 8).map(s => `File: ${s.filepath}\nLine: ${s.lineNumber}\n---\n${s.content.substring(0, 1200)}\n`).join("\n\n---\n\n");
                    const prompt = `You are an expert assistant with access to the project's code snippets. The user requested: "${query}".\nFind and return the full implementation for the function or class named "${candidateRaw}".\nUse project code snippets shown below as context.\n\n${ctxSnippets}\n\nIf you find an exact definition, return ONLY the code block for the implementation. If fragmented, merge and return a coherent code block. If not found, provide a best-effort implementation. Return only the code block.`;
                    const aiResp = await (0, callAI_1.callAI)(prompt);
                    const fenceMatch = aiResp.match(/```(?:[a-zA-Z0-9+-]*)\n([\s\S]*?)```/);
                    if (fenceMatch) {
                        const code = fenceMatch[1].trim();
                        const synthesized = {
                            filename: `${candidateRaw}.generated`,
                            filepath: ranked[0]?.filepath || 'AI_synthesis',
                            content: code,
                            language: ranked[0]?.language || 'typescript',
                            lineNumber: 1,
                            embedding: undefined,
                            relevance: 0.995,
                            symbolSignature: code.split('\n')[0] || '',
                            docComment: '',
                            diagnostic: 'AI-extracted or synthesized implementation',
                            symbolName: candidateRaw
                        };
                        ranked = [synthesized, ...ranked];
                    }
                    else if (aiResp.trim().length > 0) {
                        const synthesized = {
                            filename: `${candidateRaw}.generated`,
                            filepath: ranked[0]?.filepath || 'AI_synthesis',
                            content: aiResp.trim().substring(0, 4000),
                            language: ranked[0]?.language || 'typescript',
                            lineNumber: 1,
                            embedding: undefined,
                            relevance: 0.95,
                            symbolSignature: aiResp.split('\n')[0] || '',
                            docComment: '',
                            diagnostic: 'AI synthesized (no fence) implementation',
                            symbolName: candidateRaw
                        };
                        ranked = [synthesized, ...ranked];
                    }
                }
                catch { /* ignore AI extraction errors */ }
            }
        }
        // Final threshold and selection: always include top-N, never return empty unless store is empty
        const bestScore = ranked[0]?.relevance ?? 0;
        const threshold = Math.max(minSimilarity, bestScore * 0.3);
        const filteredResults = ranked.filter(s => (s.relevance ?? 0) >= threshold).slice(0, maxResults);
        if (filteredResults.length === 0 && ranked.length > 0)
            return ranked.slice(0, maxResults);
        return filteredResults;
    }
    catch (error) {
        return [];
    }
}
async function initializeEmbeddings() {
    await (0, retrieve_1.generateEmbeddingsForProject)();
}
//# sourceMappingURL=pipeline.js.map