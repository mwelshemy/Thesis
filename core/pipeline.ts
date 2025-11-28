import { retrieveCandidates, generateEmbeddingsForProject, CodeSnippet } from "./retrieve";
import { rankCandidates } from "./rank";
import { analyzeQuery } from "./queryUnderstanding";
import * as vscode from 'vscode';
import { callAI } from '../src/ai/callAI'; // robust wrapper

export { CodeSnippet };
export { generateEmbeddingsForProject } from "./retrieve";

export function splitCodeIntoChunksWithContext(
  content: string,
  language: string
): Array<{ content: string; startLine: number; symbolSignature?: string; docComment?: string }> {
  const blocks: Array<{ content: string; startLine: number; symbolSignature?: string; docComment?: string }> = [];
  const lines = content.split('\n');
  let currentBlock: string[] = [];
  let startLine = 1;
  let symbolSignature = '';
  let docCommentLines: string[] = [];
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
      if (currentBlock.length > 0) pushBlock();
      symbolSignature = trimmed;
      startLine = i + 1;
      currentBlock.push(line);
      docCommentLines = docCommentLines;
    } else {
      currentBlock.push(line);
    }
    if (currentBlock.length >= 40) { pushBlock(); startLine = i + 2; }
  }
  pushBlock();
  return blocks;
}

/**
 * Merges semantic and lexical results for robust retrieval
 */
function extractLikelySymbolToken(query: string): string {
  const tokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search|dunction/i.test(t));
  let candidate = tokens.reverse().find(tok => /[A-Za-z_]\w*/.test(tok)) || tokens[tokens.length - 1];
  if (!candidate || candidate.length <= 2) {
    const camel = query.match(/\b[A-Z][A-Za-z0-9_]+\b/);
    if (camel) candidate = camel[0];
  }
  return (candidate || '').trim();
}

function generateIdentifierVariants(token: string): string[] {
  const t = token.replace(/[^A-Za-z0-9_]/g, '');
  if (!t) return [];
  const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
  const snake = parts.map(p => p.toLowerCase()).join('_');
  const kebab = parts.map(p => p.toLowerCase()).join('-');
  const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return Array.from(new Set([t.toLowerCase(), snake, kebab, camel, pascal]));
}

// Lexical fuzzy search (filename and symbol), robust to typos and variants
async function lexicalCodeSearchVariants(variants: string[], workspaceRoot?: string, extensions = ['.ts', '.js', '.tsx', '.jsx', '.py']): Promise<CodeSnippet[]> {
  const matches: CodeSnippet[] = [];
  let baseDir = workspaceRoot;
  try { if (!baseDir && vscode?.workspace?.workspaceFolders?.length) baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath; } catch { }
  if (!baseDir) baseDir = process.cwd();
  const fs = require('fs');
  const path = require('path');

  async function searchDir(dir: string) {
    let entries: any[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
        await searchDir(entryPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!extensions.includes(ext)) continue;
        let text: string; try { text = fs.readFileSync(entryPath, 'utf8'); } catch { continue; }
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
                if (tok.toLowerCase() === v.toLowerCase()) { matched = true; break; }
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
export async function runRetrievalPipeline(query: string, maxResults: number = 5, minSimilarity: number = 0.15): Promise<CodeSnippet[]> {
  try {
    const queryAnalysis = analyzeQuery(query);

    // 1. Semantic similarity candidates
    const retrieved = await retrieveCandidates(query, maxResults * 8);
    let ranked = rankCandidates(retrieved, query);

    // 2. Lexical & fuzzy fallback if intent is function/class
    if (queryAnalysis.isFunctionSearch || queryAnalysis.isClassSearch) {
      const candidateRaw = extractLikelySymbolToken(query);
      if (candidateRaw) {
        const variants = generateIdentifierVariants(candidateRaw);
        const lexicalResults = await lexicalCodeSearchVariants(variants);

        const byPath = new Map<string, CodeSnippet>();
        for (const r of lexicalResults) {
          const existing = byPath.get(r.filepath);
          if (!existing || (r.relevance ?? 0) > (existing.relevance ?? 0)) byPath.set(r.filepath, r);
        }
        for (const s of ranked) {
          if (!byPath.has(s.filepath)) byPath.set(s.filepath, s);
          else if (s.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(s.symbolSignature)) {
            s.diagnostic = (s.diagnostic || '') + '; semantic also contains symbol';
            byPath.set(s.filepath, s);
          }
        }
        ranked = Array.from(byPath.values()).sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));

        // AI synthesis of symbol implementation (function/class), using code snippets as context
        try {
          const ctxSnippets = ranked.slice(0, 8).map(s =>
            `File: ${s.filepath}\nLine: ${s.lineNumber}\n---\n${s.content.substring(0, 1200)}\n`
          ).join("\n\n---\n\n");
          const prompt = `You are an expert assistant with access to the project's code snippets. The user requested: "${query}".\nFind and return the full implementation for the function or class named "${candidateRaw}".\nUse project code snippets shown below as context.\n\n${ctxSnippets}\n\nIf you find an exact definition, return ONLY the code block for the implementation. If fragmented, merge and return a coherent code block. If not found, provide a best-effort implementation. Return only the code block.`;
          const aiResp = await callAI(prompt);
          const fenceMatch = aiResp.match(/```(?:[a-zA-Z0-9+-]*)\n([\s\S]*?)```/);
          if (fenceMatch) {
            const code = fenceMatch[1].trim();
            const synthesized: CodeSnippet = {
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
          } else if (aiResp.trim().length > 0) {
            const synthesized: CodeSnippet = {
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
        } catch { /* ignore AI extraction errors */ }
      }
    }

    // Final threshold and selection: always include top-N, never return empty unless store is empty
    const bestScore = ranked[0]?.relevance ?? 0;
    const threshold = Math.max(minSimilarity, bestScore * 0.3);
    const filteredResults = ranked.filter(s => (s.relevance ?? 0) >= threshold).slice(0, maxResults);
    if (filteredResults.length === 0 && ranked.length > 0) return ranked.slice(0, maxResults);
    return filteredResults;
  } catch (error) {
    return [];
  }
}

export async function initializeEmbeddings(): Promise<void> {
  await generateEmbeddingsForProject();
}
