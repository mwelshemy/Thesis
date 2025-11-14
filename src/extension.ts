import * as vscode from 'vscode';
import { callAI, callAIMock } from './ai/callAI';
import {
  buildSearchIndex,
  searchIndex,
  getSearchStats,
  clearSearchIndex,
  initializeSearch,
  searchByLanguage,
} from './search';
import {
  smartCodeAnalysis,
  deepCodeAnalysis,
  patternAnalysis,
  analyzeSearchResults,
} from './integration/workflow-orchestrator';
import { SidebarViewProvider } from './webviews/sidebar-view-provider';
import { RefactorManager } from './refactoring/refactor-manager';

let sidebarProvider: SidebarViewProvider | undefined;
let searchOutputChannel: vscode.OutputChannel | undefined;
let aiFallbackChannel: vscode.OutputChannel | undefined;

/** Utilities */
async function runWithProgress<T>(
  title: string,
  task: (
    p: vscode.Progress<{ message?: string; increment?: number }>
  ) => Promise<T>
) {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task
  );
}

function postToSidebar(title: string, content: string | object) {
  const payload =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  if (sidebarProvider) {
    sidebarProvider.showAIAnalysis(title, payload);
  } else {
    if (!aiFallbackChannel)
      aiFallbackChannel = vscode.window.createOutputChannel('VS AI (fallback)');
    aiFallbackChannel.clear();
    aiFallbackChannel.appendLine(`🤖 ${title}`);
    aiFallbackChannel.appendLine('='.repeat(60));
    aiFallbackChannel.appendLine(payload);
    aiFallbackChannel.appendLine('='.repeat(60));
    aiFallbackChannel.show(true);
  }
}

/** Command handlers (each accepts optional payload from webview) */

export async function handleAskAICommand(payload?: {
  code?: string;
}): Promise<void> {
  try {
    let code = payload?.code;
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.window.showWarningMessage('No active editor.');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty
        ? editor.document.getText()
        : editor.document.getText(sel);
    }

    if (!code || !code.trim()) {
      await vscode.window.showWarningMessage('No code provided.');
      return;
    }

    // Lock into a local const so TypeScript knows it's defined inside the closure below
    const safeCode = code;

    await runWithProgress('Ask AI: explaining code...', async (progress) => {
      progress.report({ message: 'Calling AI...' });

      const prompt = `TASK: Explain the following code.
Code:
${safeCode.substring(0, 2000)}

Detailed explanation of the code above:
"""
`;
      
      let response: string = await callAI(prompt);

      postToSidebar('Ask AI — Explanation', response);
      await vscode.window.showInformationMessage(
        'Ask AI: result posted to sidebar.'
      );
    });
  } catch (err: any) {
    await vscode.window.showErrorMessage('Ask AI failed: ' + String(err));
    console.error(err);
  }
}

export async function handleSummarizeFileCommand(payload?: {
  path?: string;
}): Promise<void> {
  try {
    let filePath = payload?.path;
    if (!filePath) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.window.showWarningMessage('Open a file first.');
        return;
      }
      filePath = editor.document.uri.fsPath;
    }

    if (!filePath) {
      await vscode.window.showWarningMessage('No file path available.');
      return;
    }

    const safePath = filePath;
    const doc = await vscode.workspace.openTextDocument(safePath);
    const content = doc.getText();
    if (!content.trim()) {
      await vscode.window.showWarningMessage('File empty.');
      return;
    }

    await runWithProgress(`Summarizing ${safePath}...`, async (progress) => {
      progress.report({ message: 'Calling AI...' });

const prompt = `TASK: Summarize the following file's contents, listing main functions, classes, and its purpose.
CODE:
${content.substring(0, 4000)}

SUMMARY:
`;

      const response = await callAI(prompt);

      postToSidebar(
        `Summarize File — ${safePath.split(/[\\/]/).pop()}`,
        response
      );
      await vscode.window.showInformationMessage(
        'File summary posted to sidebar.'
      );
    });
  } catch (err: any) {
    await vscode.window.showErrorMessage('Summarize failed: ' + String(err));
    console.error(err);
  }
}

export async function handleSmartExplainCommand(payload?: {
  code?: string;
  useContext?: boolean;
}) {
  try {
    let code = payload?.code;
    const useContext = payload?.useContext ?? true;
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.window.showWarningMessage('Open a file first.');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty
        ? editor.document.getText()
        : editor.document.getText(sel);
    }

    if (!code || !code.trim()) {
      await vscode.window.showWarningMessage('No code provided.');
      return;
    }

    const safeCode = code;

    await runWithProgress(
      'Smart Explain: collecting context...',
      async (progress) => {
        progress.report({ message: 'Running smart analysis...' });
        // smartCodeAnalysis expects selectedCode: string
        const result = await smartCodeAnalysis({
          selectedCode: safeCode,
          userQuery: 'Explain this code with context',
          useEnhancedContext: useContext,
          maxSearchResults: 6,
        });
        const r: any = result as any;
        const payload = {
          summary: result.response,
          success: result.success,
          contextUsed: r.contextUsed ?? [],
          metrics: r.metrics ?? null,
        };
        postToSidebar('Smart Explain', payload);
        await vscode.window.showInformationMessage(
          'Smart Explain results posted to sidebar.'
        );
      }
    );
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Smart Explain failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleDeepAnalysisCommand(payload?: { code?: string }) {
  try {
    let code = payload?.code;
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.window.showWarningMessage('Open a file first.');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty
        ? editor.document.getText()
        : editor.document.getText(sel);
    }

    if (!code || !code.trim()) {
      await vscode.window.showWarningMessage('No code provided.');
      return;
    }

    const safeCode = code;

    await runWithProgress('Deep Analysis: running...', async (progress) => {
      progress.report({ message: 'Analyzing...' });
      const result = await deepCodeAnalysis(safeCode);
      const r: any = result as any;
      postToSidebar('Deep Analysis', {
        summary: result.response,
        issues: r.issues ?? [],
      });
      progress.report({ increment: 100 });
      await vscode.window.showInformationMessage(
        'Deep Analysis posted to sidebar.'
      );
    });
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Deep Analysis failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handlePatternAnalysisCommand(payload?: {
  pattern?: string;
}) {
  try {
    let pattern = payload?.pattern;
    if (!pattern) {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter code pattern to search for',
      });
      if (!input) return;
      pattern = input;
    }

    if (!pattern || !pattern.trim()) {
      await vscode.window.showWarningMessage('No pattern provided.');
      return;
    }

    const safePattern = pattern;

    await runWithProgress(
      'Pattern Analysis: searching...',
      async (progress) => {
        progress.report({ message: 'Finding patterns...' });
        const result = await patternAnalysis(safePattern);
        postToSidebar('Pattern Analysis', result.response);
        progress.report({ increment: 100 });
        await vscode.window.showInformationMessage(
          'Pattern Analysis posted to sidebar.'
        );
      }
    );
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Pattern Analysis failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleAnalyzeSearchResultsCommand(payload?: {
  query?: string;
}) {
  try {
    let q = payload?.query;
    if (!q) {
      q =
        (await vscode.window.showInputBox({
          prompt: 'Enter search term to analyze with AI',
        })) || undefined;
    }
    if (!q) return;

    const safeQ = q;

    await runWithProgress(
      `Analyzing search results for "${safeQ}"...`,
      async (progress) => {
        progress.report({ message: 'Gathering results...' });
        const result = await analyzeSearchResults(safeQ, 8);
        const r: any = result as any;
        postToSidebar(`Analyze Search Results: ${safeQ}`, {
          summary: result.response,
          files: r.contextUsed ?? [],
        });
        progress.report({ increment: 100 });
        await vscode.window.showInformationMessage(
          'Analyze Search Results posted to sidebar.'
        );
      }
    );
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Analyze Search Results failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleSearchProjectCommand(payload?: { query?: string }) {
  try {
    let q = payload?.query;
    if (!q) {
      q =
        (await vscode.window.showInputBox({
          prompt: 'Enter search term',
          placeHolder: 'function name, comment, etc.',
        })) || undefined;
    }
    if (q === undefined) return;

    const safeQ = q;

    await runWithProgress(`Searching project: ${safeQ}`, async (progress) => {
      progress.report({ message: 'Searching...' });
      const results = searchIndex(safeQ || '', 30);
      postToSidebar(`Search Project: ${safeQ}`, {
        summary: `Found ${results.length} files`,
        files: results.map((r) => ({
          fileName: r.fileName,
          filePath: r.filePath,
          lineCount: r.lineCount,
        })),
      });
      await vscode.window.showInformationMessage(
        `Search posted to sidebar (${results.length} files).`
      );
    });
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Search Project failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleBuildSearchIndexCommand() {
  try {
    await runWithProgress('Building search index...', async (progress) => {
      progress.report({ message: 'Indexing...' });
      const results = await buildSearchIndex();
      postToSidebar('Build Search Index', { indexed: results.length });
      await vscode.window.showInformationMessage(
        `Indexed ${results.length} files`
      );
    });
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Build Search Index failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleSearchStatsCommand() {
  try {
    const stats = getSearchStats();
    postToSidebar('Search Stats', stats);
    await vscode.window.showInformationMessage(
      'Search statistics posted to sidebar.'
    );
  } catch (err: any) {
    await vscode.window.showErrorMessage('Search Stats failed: ' + String(err));
    console.error(err);
  }
}

export async function handleSearchByLanguageCommand(payload?: {
  language?: string;
}) {
  try {
    let lang = payload?.language;
    if (!lang) {
      const languages = [
        'typescript',
        'javascript',
        'python',
        'java',
        'css',
        'html',
        'markdown',
      ];
      lang =
        (await vscode.window.showQuickPick(languages, {
          placeHolder: 'Select language',
        })) || undefined;
    }
    if (!lang) return;

    const safeLang = lang;

    const results = searchByLanguage(safeLang);
    postToSidebar(`Search by Language: ${safeLang}`, {
      files: results.map((r) => ({
        fileName: r.fileName,
        filePath: r.filePath,
        lineCount: r.lineCount,
      })),
    });
    await vscode.window.showInformationMessage(
      `Found ${results.length} ${safeLang} files`
    );
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Search by Language failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleClearSearchIndexCommand() {
  try {
    const choice = await vscode.window.showWarningMessage(
      'Clear search index? This will remove all indexed files.',
      { modal: true },
      'Yes, Clear Index'
    );
    if (choice === 'Yes, Clear Index') {
      clearSearchIndex();
      postToSidebar('Clear Search Index', { cleared: true });
      await vscode.window.showInformationMessage('Search index cleared.');
    }
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Clear Search Index failed: ' + String(err)
    );
    console.error(err);
  }
}

export async function handleQuickFileSearchCommand() {
  try {
    const recent = searchIndex('', 20);
    if (recent.length === 0) {
      await vscode.window.showWarningMessage(
        'No indexed files. Build index first.'
      );
      return;
    }
    const items = recent.map((f) => ({
      label: f.fileName,
      description: f.filePath,
      file: f,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Quick file search',
    });
    if (pick) {
      const doc = await vscode.workspace.openTextDocument(pick.file.filePath);
      await vscode.window.showTextDocument(doc);
      await vscode.window.showInformationMessage(`Opened ${pick.label}`);
    }
  } catch (err: any) {
    await vscode.window.showErrorMessage(
      'Quick File Search failed: ' + String(err)
    );
    console.error(err);
  }
}

// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  console.log('Activating VS Code AI Extension...');

  aiFallbackChannel = vscode.window.createOutputChannel('VS AI (fallback)');

  // initialize search (some implementations might return an OutputChannel)
  try {
    const maybe = initializeSearch(context);
    if (maybe && typeof (maybe as any).appendLine === 'function') {
      searchOutputChannel = maybe as vscode.OutputChannel;
    }
  } catch (e) {
    console.warn('initializeSearch error', e);
  }

  // register sidebar
  try {
    const refMgr = (() => {
      try {
        return RefactorManager.getInstance(context);
      } catch {
        return undefined;
      }
    })();
    const provider = new SidebarViewProvider(context.extensionUri, refMgr);
    sidebarProvider = provider;
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SidebarViewProvider.viewId,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );
  } catch (e) {
    console.warn('Sidebar registration failed', e);
  }

  // register commands (original 12 + showSidebar)
  const regs: vscode.Disposable[] = [
    vscode.commands.registerCommand('vs-code-ai-extension.helloWorld', () => {
      vscode.window.showInformationMessage(
        `Hello World from VS AI at ${new Date().toLocaleString()}`
      );
    }),

    vscode.commands.registerCommand(
      'vs-code-ai-extension.askAI',
      handleAskAICommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.summarizeFile',
      handleSummarizeFileCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.smartExplain',
      handleSmartExplainCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.deepAnalysis',
      handleDeepAnalysisCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.patternAnalysis',
      handlePatternAnalysisCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.analyzeSearchResults',
      handleAnalyzeSearchResultsCommand
    ),

    vscode.commands.registerCommand(
      'vs-code-ai-extension.searchProject',
      handleSearchProjectCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.buildSearchIndex',
      handleBuildSearchIndexCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.searchStats',
      handleSearchStatsCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.searchByLanguage',
      handleSearchByLanguageCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.clearSearchIndex',
      handleClearSearchIndexCommand
    ),
    vscode.commands.registerCommand(
      'vs-code-ai-extension.quickFileSearch',
      handleQuickFileSearchCommand
    ),

    vscode.commands.registerCommand(
      'vs-code-ai-extension.showSidebar',
      async () => {
        try {
          await vscode.commands.executeCommand(
            'workbench.action.moveSideBarRight'
          );
        } catch {}
        try {
          await vscode.commands.executeCommand(
            'workbench.view.extension.vsCodeAI'
          );
        } catch {}
        setTimeout(() => sidebarProvider?.refresh(), 400);
      }
    ),
  ];

  regs.forEach((r) => context.subscriptions.push(r));

  // build index shortly after activation (non-blocking)
  setTimeout(() => {
    buildSearchIndex()
      .then((res) => {
        if (res && res.length > 0)
          postToSidebar('Search Index', { filesIndexed: res.length });
      })
      .catch(() => {});
  }, 3000);

  // auto update index on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.includes('node_modules')) return;
      setTimeout(() => {
        buildSearchIndex().catch(() => {});
      }, 1000);
    })
  );

  // move sidebar to right for session
  try {
    vscode.commands.executeCommand('workbench.action.moveSideBarRight');
  } catch {}

  console.log('VS Code AI Extension activated.');
}

export function deactivate() {
  console.log('VS Code AI Extension deactivated.');
}
