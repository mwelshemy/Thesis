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
exports.fastFindBugsInProject = fastFindBugsInProject;
const vscode = __importStar(require("vscode"));
const callAI_1 = require("./ai/callAI"); // adjust path if needed
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
class Semaphore {
    constructor(max) {
        this.max = max;
        this.tasks = [];
        this.count = max;
    }
    async acquire() {
        if (this.count > 0) {
            this.count--;
            let released = false;
            return () => {
                if (!released) {
                    released = true;
                    this.count++;
                    const t = this.tasks.shift();
                    if (t)
                        t();
                }
            };
        }
        return await new Promise((resolve) => {
            this.tasks.push(() => {
                this.count--;
                let released = false;
                resolve(() => {
                    if (!released) {
                        released = true;
                        this.count++;
                        const t = this.tasks.shift();
                        if (t)
                            t();
                    }
                });
            });
        });
    }
}
/**
 * Very small helper: run eslint or pyflakes quickly (best-effort) to detect obvious issues.
 * Returns a map filePath -> array of issue messages (strings).
 */
async function runStaticAnalyzers(filePaths) {
    const results = {};
    try {
        // Try eslint (via npx if available) for JS/TS files
        const jsFiles = filePaths.filter(p => p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.jsx') || p.endsWith('.tsx'));
        if (jsFiles.length > 0) {
            try {
                // run eslint in JSON format
                const args = ['eslint', '--format', 'json', '--no-color', ...jsFiles];
                const r = (0, child_process_1.spawnSync)('npx', args, { encoding: 'utf8', shell: false, timeout: 30000 });
                if (r.status === 0 || r.stdout) {
                    const parsed = JSON.parse(r.stdout || '[]');
                    for (const item of parsed) {
                        const file = item.filePath;
                        const msgs = (item.messages || []).map((m) => `${m.ruleId || m.severity || 'issue'}: ${m.message} (line ${m.line || '?'})`);
                        results[file] = (results[file] || []).concat(msgs);
                    }
                }
            }
            catch {
                // ignore, fallback
            }
        }
        // Try pyflakes for python
        const pyFiles = filePaths.filter(p => p.endsWith('.py'));
        if (pyFiles.length > 0) {
            try {
                // pyflakes outputs on stderr per-file
                const args = ['pyflakes', ...pyFiles];
                const r2 = (0, child_process_1.spawnSync)('pyflakes', pyFiles, { encoding: 'utf8', shell: false, timeout: 20000 });
                const out = (r2.stdout || '') + (r2.stderr || '');
                // parse simple "path:line: message" lines
                for (const line of out.split(/\r?\n/)) {
                    if (!line.trim())
                        continue;
                    const m = line.split(':');
                    const file = m[0];
                    const msg = m.slice(1).join(':').trim();
                    results[file] = (results[file] || []).concat([msg]);
                }
            }
            catch {
                // ignore
            }
        }
    }
    catch (err) {
        // ignore static analyzer errors
    }
    return results;
}
/**
 * Build a concise prompt for a batch of files.
 * We include filename, language, and truncated content (only the most relevant parts).
 * We ask the model to return JSON in a specific shape.
 */
function buildBatchPrompt(files, instructions) {
    const header = `You are an expert code reviewer. For each file provided, produce a JSON array of objects with:
{
  "filePath": "<path>",
  "issues": [
    { "type":"bug|vulnerability|performance|style", "severity":"low|medium|high", "location":"line or function", "message":"description", "suggestion":"fix suggestion (short)" }
  ]
}
Return ONLY valid JSON (an array). If no issues for a file, return an empty issues array for that file.
`;
    const fileBlocks = files.map(f => {
        // try to include smaller focused snippets: top-of-file imports + first 2000 chars + last 500 chars
        const head = f.content.substring(0, 2000);
        const tail = f.content.length > 2500 ? `\n\n// --- tail ---\n${f.content.slice(-500)}` : '';
        return `// File: ${f.filePath}\n// Language: ${f.language}\n\`\`\`${f.language}\n${head}${tail}\n\`\`\``;
    }).join('\n\n---\n\n');
    const extra = instructions ? `\n\nAdditional instructions: ${instructions}` : '';
    // Keep the prompt compact: ask for short bullet issues only
    const ask = `
${header}
Analyze the following files for critical bugs, security vulnerabilities, logic errors, performance problems, and high-risk edge cases. For each issue include a one-line suggestion. Keep each issue concise.

FILES:
${fileBlocks}

${extra}
`;
    return ask;
}
/**
 * Parse model JSON response safely (best-effort).
 * Some models may include stray text before/after JSON; we try to extract the first JSON array/object.
 */
function extractJsonFromResponse(text) {
    if (!text)
        return null;
    const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch)
        return null;
    try {
        return JSON.parse(jsonMatch[0]);
    }
    catch {
        // try to clean common trailing commas
        const cleaned = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
        try {
            return JSON.parse(cleaned);
        }
        catch {
            return null;
        }
    }
}
/**
 * Main public helper: fastFindBugsInProject
 * - Scans workspace files (up to a limit)
 * - Runs static analyzers (best-effort)
 * - Sends batches to callAI in parallel with bounded concurrency
 * - Returns aggregated reports per-file
 */
async function fastFindBugsInProject(options) {
    const maxFiles = options?.maxFiles ?? 50;
    const batchSize = options?.batchSize ?? 6;
    const concurrency = options?.concurrency ?? 2;
    const includeStaticChecks = options?.includeStaticChecks ?? true;
    const aiInstructions = options?.aiInstructions ?? '';
    const warnings = [];
    const files = [];
    // 1) collect files
    try {
        const folder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0])?.uri;
        if (!folder) {
            throw new Error('No workspace open');
        }
        const workspaceRoot = options?.workspaceRoot || folder.fsPath;
        const patterns = '**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs}';
        const uris = await vscode.workspace.findFiles(patterns, '**/node_modules/**', maxFiles);
        for (const uri of uris) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const content = doc.getText();
                if (!content || content.trim().length < 6)
                    continue;
                files.push({
                    uri,
                    language: doc.languageId || path.extname(uri.fsPath).replace('.', ''),
                    content,
                    fileName: path.basename(uri.fsPath),
                    filePath: uri.fsPath
                });
            }
            catch (err) {
                // skip unreadable files
            }
        }
    }
    catch (err) {
        return { reports: [], warnings: [`Failed to enumerate project files: ${String(err)}`] };
    }
    if (files.length === 0) {
        return { reports: [], warnings: ['No source files found to analyze.'] };
    }
    // 2) Optional static analyzers
    const staticResults = {};
    if (includeStaticChecks) {
        try {
            const filePaths = files.map(f => f.filePath);
            const sr = await runStaticAnalyzers(filePaths);
            Object.assign(staticResults, sr);
        }
        catch (err) {
            warnings.push('Static analyzers failed or not available; proceeding without them.');
        }
    }
    // 3) Prepare batches
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize)
        batches.push(files.slice(i, i + batchSize));
    // 4) Run AI on batches with bounded concurrency
    const sem = new Semaphore(concurrency);
    const batchPromises = batches.map(async (batch) => {
        const release = await sem.acquire();
        try {
            // Build prompt
            const prompt = buildBatchPrompt(batch, aiInstructions);
            // Ask for JSON array
            const aiResponse = await (0, callAI_1.callAI)(prompt);
            const parsed = extractJsonFromResponse(aiResponse);
            if (Array.isArray(parsed)) {
                // Ensure mapping by filePath
                return parsed.map((entry) => {
                    // normalize
                    const filePath = entry.filePath || entry.path || (batch[0] && batch[0].filePath) || '';
                    return {
                        filePath,
                        issues: Array.isArray(entry.issues) ? entry.issues : [],
                        raw: undefined
                    };
                });
            }
            else {
                // fallback: attach whole response under a "raw" field for each file
                return batch.map(f => ({ filePath: f.filePath, issues: [], raw: aiResponse }));
            }
        }
        catch (err) {
            // On error, return per-file textual fallback
            const msg = `AI batch failure: ${String(err)}`;
            return batch.map(f => ({ filePath: f.filePath, issues: [], raw: msg }));
        }
        finally {
            release();
        }
    });
    const batchResults = await Promise.all(batchPromises);
    // 5) Aggregate per-file
    const reportMap = new Map();
    // seed with static results
    for (const f of files) {
        const sr = staticResults[f.filePath] || [];
        reportMap.set(f.filePath, {
            filePath: f.filePath,
            fileName: f.fileName,
            issues: sr.map(s => ({ message: s })),
        });
    }
    // merge AI results
    for (const br of batchResults) {
        for (const entry of br) {
            const existing = reportMap.get(entry.filePath) || { filePath: entry.filePath, fileName: path.basename(entry.filePath), issues: [] };
            if (entry.issues && Array.isArray(entry.issues) && entry.issues.length > 0) {
                for (const it of entry.issues) {
                    // adapt varied shapes from model into BugIssue
                    const issue = {
                        type: it.type || it.category || undefined,
                        severity: it.severity || it.level || undefined,
                        location: it.location || it.line || undefined,
                        message: (it.message || it.msg || (typeof it === 'string' ? it : '')).toString(),
                        suggestion: it.suggestion || it.fix || undefined
                    };
                    existing.issues.push(issue);
                }
            }
            if (entry.raw)
                existing.raw = existing.raw ? existing.raw + '\n' + entry.raw : entry.raw;
            reportMap.set(entry.filePath, existing);
        }
    }
    const reports = Array.from(reportMap.values());
    return { reports, warnings };
}
//# sourceMappingURL=fastBugScan.js.map