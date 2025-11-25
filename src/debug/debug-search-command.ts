import * as vscode from 'vscode';
import * as search from '../search'; // adjust path if needed

function normalizeAndTokenizeLocal(query: string): string[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const cleaned = lower.replace(/[^\w\s-_]/g, ' ');
  const tokens = cleaned.split(/\s+/).map(t => t.trim()).filter(Boolean);
  const stopwords = new Set([
    'where','can','i','find','the','a','an','how','to','for','of','in','on','is','are','my','that','this','please','show'
  ]);
  return tokens.filter(t => !stopwords.has(t) && t.length > 0);
}

function generateIdentifierVariantsLocal(phrase: string): string[] {
  const parts = phrase.toLowerCase().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return [];
  const joined = parts.join('');
  const snake = parts.join('_');
  const kebab = parts.join('-');
  const camel = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  const variants = Array.from(new Set([phrase.toLowerCase(), ...parts, joined, snake, camel, pascal, kebab]));
  return variants;
}

export function registerDebugSearchCommand(context: vscode.ExtensionContext) {
  const cmd = 'vs-code-ai-extension.debugSearch';
  const disposable = vscode.commands.registerCommand(cmd, async () => {
    const out = vscode.window.createOutputChannel('VS Search Debug');
    out.show(true);

    out.appendLine('=== Debug Search Command ===');

    try {
      out.appendLine('Rebuilding index (this may take a moment)...');
      // If search.buildSearchIndex exists, call it to ensure the latest index
      if (typeof (search as any).buildSearchIndex === 'function') {
        await (search as any).buildSearchIndex();
        out.appendLine('Index rebuild complete.');
      } else {
        out.appendLine('Warning: buildSearchIndex() not available on search module.');
      }

      // show stats if available
      if (typeof (search as any).getSearchStats === 'function') {
        const stats = (search as any).getSearchStats();
        out.appendLine(`Index stats: files=${stats.fileCount} totalLines=${stats.totalLines} isIndexing=${stats.isIndexing} size=${stats.totalIndexSize}`);
      } else {
        out.appendLine('Warning: getSearchStats() not available on search module.');
      }

      // list top indexed files
      if (typeof (search as any).getFileByPath !== 'undefined') {
        out.appendLine('Listing first 10 index entries (fileName | filePath):');
        try {
          const indexEntries: any[] = (search as any).__getIndex ? (search as any).__getIndex() : null;
          // If __getIndex helper not present, try a search that returns recent files
          if (Array.isArray(indexEntries) && indexEntries.length) {
            indexEntries.slice(0, 10).forEach((f, i) => out.appendLine(`  ${i + 1}. ${f.fileName} | ${f.filePath}`));
          } else {
            // fallback: run empty query to get recent files
            const recents: any[] = (search as any).searchIndex ? (search as any).searchIndex('') : [];
            recents.slice(0, 10).forEach((f, i) => out.appendLine(`  ${i + 1}. ${f.fileName} | ${f.filePath}`));
          }
        } catch (e) {
          out.appendLine('  (could not enumerate index entries via helper) ' + String(e));
        }
      }

      // Ask the user for a query (pre-fill with your failing example)
      const userQuery = await vscode.window.showInputBox({
        prompt: 'Enter query to debug (example: where can I find the insertion sort)',
        value: 'where can I find the insertion sort'
      });

      if (!userQuery) {
        out.appendLine('No query provided, aborting.');
        return;
      }

      out.appendLine(`\n--- Debugging query: "${userQuery}" ---`);

      // Tokenize and show variants
      const tokens = normalizeAndTokenizeLocal(userQuery);
      out.appendLine(`Tokens: [${tokens.join(', ')}]`);

      const bigrams: string[] = [];
      for (let i = 0; i + 1 < tokens.length; i++) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
      out.appendLine(`Bigrams: [${bigrams.join(', ')}]`);

      const allPhrases = Array.from(new Set([userQuery.toLowerCase(), ...tokens, ...bigrams]));
      for (const p of allPhrases) {
        const variants = generateIdentifierVariantsLocal(p);
        out.appendLine(`Variants for "${p}": ${variants.join(', ')}`);
      }

      // Run search with the raw NL query
      if (typeof (search as any).searchIndex === 'function') {
        out.appendLine('\nRunning searchIndex(raw query) …');
        const rawResults: any[] = (search as any).searchIndex(userQuery, 20) || [];
        out.appendLine(`rawResults.length = ${rawResults.length}`);
        rawResults.forEach((r, i) => out.appendLine(`  ${i+1}. ${r.fileName} | ${r.filePath}`));
      } else {
        out.appendLine('searchIndex not available from search module.');
      }

      // Run token-by-token searches and variant searches
      for (const t of [...tokens, ...bigrams]) {
        out.appendLine(`\nRunning searchIndex("${t}") …`);
        try {
          const r: any[] = (search as any).searchIndex(t, 10) || [];
          out.appendLine(`  results: ${r.length}`);
          r.slice(0, 6).forEach((rr, i) => out.appendLine(`    ${i+1}. ${rr.fileName} | ${rr.filePath}`));
        } catch (e) {
          out.appendLine('  error running token search: ' + String(e));
        }
      }

      // Also try a joined-identifier variant (e.g., insertionSort)
      const joined = tokens.join('');
      if (joined) {
        out.appendLine(`\nRunning searchIndex(joined token "${joined}") …`);
        const jres: any[] = (search as any).searchIndex(joined, 20) || [];
        out.appendLine(`  joined results: ${jres.length}`);
        jres.slice(0, 6).forEach((rr, i) => out.appendLine(`    ${i+1}. ${rr.fileName} | ${rr.filePath}`));
      }

      out.appendLine('\n--- End of debug output ---');
    } catch (err) {
      out.appendLine('Debug run failed: ' + String(err));
      console.error('Debug search command error:', err);
    }
  });

  context.subscriptions.push(disposable);
}