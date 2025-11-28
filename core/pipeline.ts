import { retrieveCandidates, generateEmbeddingsForProject, CodeSnippet } from "./retrieve";
import { rankCandidates } from "./rank";
import { analyzeQuery } from "./queryUnderstanding";
import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export { CodeSnippet };
export { generateEmbeddingsForProject } from "./retrieve";

/**
 * Typed AI response wrapper
 */
interface AIGenerationResponse {
  generated_text?: string;
  generated_code?: string;
  error?: string;
}

/**
 * Utility: call the local DeepSeek AI server (/generate).
 * Returns the generated_text (string) or throws on error.
 */
async function callLocalAI(prompt: string, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('http://localhost:8000/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal as any
    });

    clearTimeout(id);

    if (!res.ok) {
      throw new Error(`AI server responded ${res.status}`);
    }

    const data = (await res.json()) as AIGenerationResponse;
    const generated = data.generated_text ?? data.generated_code ?? '';
    return String(generated);
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Generate identifier variants for a candidate token.
 * E.g., "searchutils" -> ["searchutils","search_utils","search-utils","searchUtils","SearchUtils"]
 */
function generateIdentifierVariants(token: string): string[] {
  const t = token.replace(/[^A-Za-z0-9_]/g, '');
  if (!t) return [];
  const lower = t.toLowerCase();
  const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
  const snake = parts.map(p => p.toLowerCase()).join('_');
  const kebab = parts.map(p => p.toLowerCase()).join('-');
  const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return Array.from(new Set([lower, snake, kebab, camel, pascal]));
}

/**
 * Fast lexical scan for symbol definitions (class/function/type/def) or filename matches.
 */
async function lexicalCodeSearchVariants(variants: string[], workspaceRoot?: string, extensions = ['.ts', '.js', '.tsx', '.jsx', '.py']): Promise<CodeSnippet[]> {
  const matches: CodeSnippet[] = [];

  // Determine workspace base dir
  let baseDir = workspaceRoot;
  try {
    if (!baseDir && vscode?.workspace?.workspaceFolders?.length) {
      baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
  } catch {
    // fallback
  }
  if (!baseDir) baseDir = process.cwd();

  async function searchDir(dir: string) {
    let entries: any[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
        await searchDir(entryPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!extensions.includes(ext)) continue;
        let text: string;
        try {
          text = await fs.readFile(entryPath, 'utf8');
        } catch {
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
              relevance: 0.85,
              symbolSignature: '',
              docComment: '',
              diagnostic: 'Filename contains variant',
              symbolName: v
            });
            break;
          }
        }

        fileLoop:
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const v of variants) {
            const symbolRegexes = [
              new RegExp(`(^|\\s)(export\\s+)?(class|interface|type)\\s+${v}\\b`, 'i'),
              new RegExp(`(^|\\s)(export\\s+)?(function)\\s+${v}\\b`, 'i'),
              new RegExp(`(^|\\s)(const|let|var)\\s+${v}\\s*=`, 'i'),
              new RegExp(`(^|\\s)(def)\\s+${v}\\b`, 'i'),
              new RegExp(`\\b${v}\\.prototype\\.`)
            ];
            if (symbolRegexes.some(rx => rx.test(line))) {
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
                diagnostic: `Lexical definition match (${v})`,
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
 * runRetrievalPipeline: improved lexical fallback using identifier variants, stronger dedup/ordering,
 * and AI-based synthesis/extraction of the requested function/class implementation.
 *
 * Key change: even if lexicalResult is empty, when the query looks like a function/class lookup
 * we call the AI with the top semantic snippets as context to attempt extraction/synthesis.
 */
export async function runRetrievalPipeline(query: string, maxResults: number = 5, minSimilarity: number = 0.15): Promise<CodeSnippet[]> {
  try {
    console.log(`Running semantic search for: "${query}" (min similarity: ${minSimilarity})`);
    const queryAnalysis = analyzeQuery(query);
    console.log('Query analysis:', queryAnalysis);

    // Semantic candidates
    const retrieved = await retrieveCandidates(query, maxResults * 8);
    let ranked = rankCandidates(retrieved, query);

    // If intent is function/class, try lexical + AI extraction/synthesis
    if ((queryAnalysis.mainIntent === 'class' || queryAnalysis.mainIntent === 'function' || queryAnalysis.isFunctionSearch)) {
      // build candidate token (remove stop words)
      const tokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search/i.test(t));
      let candidateRaw = '';
      if (tokens.length > 0) {
        candidateRaw = tokens.reverse().find(tok => /[A-Za-z_]\w*/.test(tok)) || tokens[tokens.length - 1];
        if (!candidateRaw || candidateRaw.length <= 2) {
          const camel = query.match(/\b[A-Z][A-Za-z0-9_]+\b/);
          if (camel) candidateRaw = camel[0];
        }
      }
      candidateRaw = (candidateRaw || '').trim();
      if (candidateRaw) {
        const variants = generateIdentifierVariants(candidateRaw);
        console.log(`Lexical fallback: variants for '${candidateRaw}':`, variants);

        // run lexical search
        const lexicalResults = await lexicalCodeSearchVariants(variants);
        // If lexicalResults found, merge them; otherwise we will still attempt AI extraction from semantic context
        const byPath = new Map<string, CodeSnippet>();
        if (lexicalResults && lexicalResults.length > 0) {
          for (const r of lexicalResults) {
            const existing = byPath.get(r.filepath);
            if (!existing || (r.relevance || 0) > (existing.relevance || 0)) byPath.set(r.filepath, r);
          }
        }

        // Add semantic ranked candidates (only if file not already present)
        for (const s of ranked) {
          if (!byPath.has(s.filepath)) byPath.set(s.filepath, s);
          else {
            const existing = byPath.get(s.filepath)!;
            if (s.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(s.symbolSignature)) {
              s.diagnostic = (s.diagnostic || '') + '; semantic also contains symbol';
              byPath.set(s.filepath, s);
            }
          }
        }

        // Rebuild ranked array with lexical-derived entries prioritized
        ranked = Array.from(byPath.values()).sort((a, b) => {
          const ra = a.relevance || 0;
          const rb = b.relevance || 0;
          if (ra !== rb) return rb - ra;
          const aHasSig = !!(a.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(a.symbolSignature));
          const bHasSig = !!(b.symbolSignature && new RegExp(`\\b${candidateRaw}\\b`, 'i').test(b.symbolSignature));
          if (aHasSig && !bHasSig) return -1;
          if (!aHasSig && bHasSig) return 1;
          return 0;
        });

        // Use best lexical if present, else top semantic candidates for AI context
        const bestLexical = lexicalResults && lexicalResults.length > 0 ? (lexicalResults.find(r => r.relevance && r.relevance >= 0.98) || lexicalResults[0]) : undefined;
        const aiContextBase = bestLexical ? [bestLexical, ...ranked.slice(0, 6)] : ranked.slice(0, 8);

        // Always call AI extraction/synthesis when user requests a function/class
        try {
          const ctxSnippets = aiContextBase.map(s => {
            const preview = s.content || '';
            return `File: ${s.filepath}\nLine: ${s.lineNumber}\n---\n${preview.substring(0, 1200)}\n`;
          }).join("\n\n---\n\n");

          const prompt = `You are an expert assistant with access to the project's code snippets. User requested: "${query}".\n` +
            `Find and return the full implementation for the function or class named "${candidateRaw}".\n` +
            `Use the following code snippets (which are excerpts from the repository) as context:\n\n${ctxSnippets}\n\n` +
            `If you find an exact definition in the snippets, return ONLY the code block for the implementation (include language fence, e.g. \`\`\`typescript ... \`\`\`).\n` +
            `If the implementation is spread across snippets, merge them into a single coherent implementation and return that code block. Also include a one-line comment with the original file path(s) where it was found.\n` +
            `If not found, provide a best-effort implementation for "${candidateRaw}" based on context and typical project conventions. Return only the code block (no additional explanation).`;

          const aiResp = await callLocalAI(prompt, 45000);
          const fenceMatch = aiResp.match(/```(?:[a-zA-Z0-9+-]*)\n([\s\S]*?)```/);
          if (fenceMatch) {
            const code = fenceMatch[1].trim();
            const synthesizedSnippet: CodeSnippet = {
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
            ranked = [synthesizedSnippet, ...ranked];
          } else {
            const fallback = aiResp.trim();
            if (fallback.length > 0) {
              const synthesizedSnippet: CodeSnippet = {
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
        } catch (aiErr) {
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
  } catch (error) {
    console.error('Retrieval pipeline error:', error);
    return [];
  }
}

/**
 * Initialize the embedding system
 */
export async function initializeEmbeddings(): Promise<void> {
  console.log('Initializing code embeddings...');
  await generateEmbeddingsForProject();
  console.log('Embeddings system ready');
}