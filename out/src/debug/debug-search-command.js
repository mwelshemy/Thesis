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
exports.registerDebugSearchCommand = registerDebugSearchCommand;
const vscode = __importStar(require("vscode"));
const search = __importStar(require("../search"));
function normalizeAndTokenizeLocal(query) {
    if (!query)
        return [];
    const lower = query.toLowerCase();
    const cleaned = lower.replace(/[^\w\s-_]/g, ' ');
    const tokens = cleaned.split(/\s+/).map(t => t.trim()).filter(Boolean);
    const stopwords = new Set([
        'where', 'can', 'i', 'find', 'the', 'a', 'an', 'how', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'my', 'that', 'this', 'please', 'show'
    ]);
    return tokens.filter(t => !stopwords.has(t) && t.length > 0);
}
function generateIdentifierVariantsLocal(phrase) {
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
function registerDebugSearchCommand(context) {
    const cmd = 'vs-code-ai-extension.debugSearch';
    const disposable = vscode.commands.registerCommand(cmd, async () => {
        const out = vscode.window.createOutputChannel('VS Search Debug');
        out.show(true);
        out.appendLine('=== Debug Search Command ===');
        try {
            out.appendLine('Rebuilding index (this may take a moment)...');
            if (typeof search.buildSearchIndex === 'function') {
                await search.buildSearchIndex();
                out.appendLine('Index rebuild complete.');
            }
            else {
                out.appendLine('Warning: buildSearchIndex() not available on search module.');
            }
            if (typeof search.getSearchStats === 'function') {
                const stats = search.getSearchStats();
                out.appendLine(`Index stats: files=${stats.fileCount} totalLines=${stats.totalLines} isIndexing=${stats.isIndexing} size=${stats.totalIndexSize}`);
            }
            else {
                out.appendLine('Warning: getSearchStats() not available on search module.');
            }
            if (typeof search.getFileByPath !== 'undefined') {
                out.appendLine('Listing first 10 index entries (fileName | filePath):');
                try {
                    const indexEntries = search.__getIndex ? search.__getIndex() : null;
                    if (Array.isArray(indexEntries) && indexEntries.length) {
                        indexEntries.slice(0, 10).forEach((f, i) => out.appendLine(`  ${i + 1}. ${f.fileName} | ${f.filePath}`));
                    }
                    else {
                        const recents = search.searchIndex ? search.searchIndex('') : [];
                        recents.slice(0, 10).forEach((f, i) => out.appendLine(`  ${i + 1}. ${f.fileName} | ${f.filePath}`));
                    }
                }
                catch (e) {
                    out.appendLine('  (could not enumerate index entries via helper) ' + String(e));
                }
            }
            const userQuery = await vscode.window.showInputBox({
                prompt: 'Enter query to debug (example: where can I find the insertion sort)',
                value: 'where can I find the insertion sort'
            });
            if (!userQuery) {
                out.appendLine('No query provided, aborting.');
                return;
            }
            out.appendLine(`\n--- Debugging query: "${userQuery}" ---`);
            const tokens = normalizeAndTokenizeLocal(userQuery);
            out.appendLine(`Tokens: [${tokens.join(', ')}]`);
            const bigrams = [];
            for (let i = 0; i + 1 < tokens.length; i++)
                bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
            out.appendLine(`Bigrams: [${bigrams.join(', ')}]`);
            const allPhrases = Array.from(new Set([userQuery.toLowerCase(), ...tokens, ...bigrams]));
            for (const p of allPhrases) {
                const variants = generateIdentifierVariantsLocal(p);
                out.appendLine(`Variants for "${p}": ${variants.join(', ')}`);
            }
            if (typeof search.searchIndex === 'function') {
                out.appendLine('\nRunning searchIndex(raw query) …');
                const rawResults = search.searchIndex(userQuery, 20) || [];
                out.appendLine(`rawResults.length = ${rawResults.length}`);
                rawResults.forEach((r, i) => out.appendLine(`  ${i + 1}. ${r.fileName} | ${r.filePath}`));
            }
            else {
                out.appendLine('searchIndex not available from search module.');
            }
            for (const t of [...tokens, ...bigrams]) {
                out.appendLine(`\nRunning searchIndex("${t}") …`);
                try {
                    const r = search.searchIndex(t, 10) || [];
                    out.appendLine(`  results: ${r.length}`);
                    r.slice(0, 6).forEach((rr, i) => out.appendLine(`    ${i + 1}. ${rr.fileName} | ${rr.filePath}`));
                }
                catch (e) {
                    out.appendLine('  error running token search: ' + String(e));
                }
            }
            const joined = tokens.join('');
            if (joined) {
                out.appendLine(`\nRunning searchIndex(joined token "${joined}") …`);
                const jres = search.searchIndex(joined, 20) || [];
                out.appendLine(`  joined results: ${jres.length}`);
                jres.slice(0, 6).forEach((rr, i) => out.appendLine(`    ${i + 1}. ${rr.fileName} | ${rr.filePath}`));
            }
            out.appendLine('\n--- End of debug output ---');
        }
        catch (err) {
            out.appendLine('Debug run failed: ' + String(err));
            console.error('Debug search command error:', err);
        }
    });
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=debug-search-command.js.map