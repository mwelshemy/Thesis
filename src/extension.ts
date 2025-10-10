import * as vscode from 'vscode';
import { callAI, callAIMock } from './ai/callAI';
import {
  buildSearchIndex,
  searchIndex,
  getSearchStats,
  clearSearchIndex,
  initializeSearch,
  FileIndexEntry,
} from './search';
// Keep all other imports the same, but update the workflow orchestrator import
import {
  smartCodeAnalysis,
  quickCodeAnalysis,
  deepCodeAnalysis,
  patternAnalysis,
  analyzeSearchResults,
} from './integration/workflow-orchestrator';

// Global output channel for AI responses
let aiOutputChannel: vscode.OutputChannel;

// Search functionality
let searchOutputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  console.log('VS Code AI Extension is now active!');

  // Create output channel for AI responses
  aiOutputChannel = vscode.window.createOutputChannel('VS AI');
  context.subscriptions.push(aiOutputChannel);

  // Initialize search functionality
  searchOutputChannel = initializeSearch(context);

  // Register Hello World command (updated)
  const helloWorldDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.helloWorld',
    () => {
      const now = new Date().toLocaleString();
      vscode.window.showInformationMessage(
        `Hello World from VS Code AI Extension! Time: ${now}`
      );
    }
  );

  // Register Ask AI command
  const askAIDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.askAI',
    async () => {
      await handleAskAICommand();
    }
  );

  // Register Search Project command (now implemented!)
  const searchProjectDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.searchProject',
    async () => {
      await handleSearchProjectCommand();
    }
  );

  // Register Summarize File command
  const summarizeFileDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.summarizeFile',
    async () => {
      await handleSummarizeFileCommand();
    }
  );

  // Register Build Search Index command
  const buildIndexDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.buildSearchIndex',
    async () => {
      await handleBuildSearchIndexCommand();
    }
  );

  // Register Search Index Stats command
  const searchStatsDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.searchStats',
    async () => {
      await handleSearchStatsCommand();
    }
  );

  // Register Smart Explain command
  const smartExplainDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.smartExplain',
    async () => {
      await handleSmartExplainCommand();
    }
  );

  // Register Deep Analysis command
  const deepAnalysisDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.deepAnalysis',
    async () => {
      await handleDeepAnalysisCommand();
    }
  );

  // Register Pattern Analysis command
  const patternAnalysisDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.patternAnalysis',
    async () => {
      await handlePatternAnalysisCommand();
    }
  );

  // Register Analyze Search Results command
  const analyzeSearchDisposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.analyzeSearchResults',
    async () => {
      await handleAnalyzeSearchResultsCommand();
    }
  );

  // Add all commands to subscriptions
  context.subscriptions.push(
    helloWorldDisposable,
    askAIDisposable,
    searchProjectDisposable,
    summarizeFileDisposable,
    buildIndexDisposable,
    searchStatsDisposable,
    smartExplainDisposable,
    deepAnalysisDisposable,
    patternAnalysisDisposable,
    analyzeSearchDisposable
  );

  // Auto-build index on activation
  setTimeout(() => {
    buildSearchIndex();
  }, 2000);
}

export function deactivate() {
  // Clean up if needed
}

/**
 * Handle Ask AI command - explains selected code or current file
 */
async function handleAskAICommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showWarningMessage(
        'No active text editor found. Please open a file first.'
      );
      return;
    }

    // Get selected text or entire file content
    const selection = editor.selection;
    let textToExplain: string;

    if (!selection.isEmpty) {
      // Use selected text
      textToExplain = editor.document.getText(selection);
    } else {
      // Use entire file content
      textToExplain = editor.document.getText();
    }

    if (!textToExplain.trim()) {
      vscode.window.showWarningMessage('No code selected or file is empty.');
      return;
    }

    // Show progress notification
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI is analyzing your code...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        // Build AI prompt
        const language = editor.document.languageId;
        const prompt = `Explain this ${language} code:\n\n${textToExplain}\n\nPlease provide a clear explanation:`;

        // Limit prompt length to avoid token limits
        const limitedPrompt = prompt.substring(0, 4000);

        // Call AI
        let aiResponse: string;

        if (process.env.HUGGINGFACE_API_TOKEN) {
          aiResponse = await callAI(limitedPrompt);
        } else {
          aiResponse = await callAIMock(limitedPrompt);
          vscode.window.showWarningMessage(
            'Using mock AI response. Set HUGGINGFACE_API_TOKEN for real AI.'
          );
        }

        progress.report({ increment: 100 });

        // Handle AI response
        if (aiResponse.startsWith('ERROR:')) {
          vscode.window.showErrorMessage(`AI Error: ${aiResponse}`);
          return;
        }

        // Display results in output channel
        aiOutputChannel.clear();
        aiOutputChannel.appendLine('🤖 AI Code Explanation:');
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.appendLine(aiResponse);
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        // Also show a quick info message
        vscode.window.showInformationMessage(
          'AI explanation ready! Check the "VS AI" output channel.'
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in Ask AI: ${error.message}`);
    console.error('Ask AI Error:', error);
  }
}

/**
 * Handle Search Project command (now implemented!)
 */
async function handleSearchProjectCommand(): Promise<void> {
  try {
    // Get search query from user
    const query = await vscode.window.showInputBox({
      prompt: 'Enter search term (filename, content, or language)',
      placeHolder: 'e.g., function, TODO, .ts, Component',
    });

    if (!query) {
      return; // User cancelled
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Searching for "${query}"...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        // Perform search
        const results = searchIndex(query, 20);

        progress.report({ increment: 100 });

        // Display results
        displaySearchResults(results, query);
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Search error: ${error.message}`);
  }
}

/**
 * Display search results in output channel
 */
function displaySearchResults(results: FileIndexEntry[], query: string): void {
  searchOutputChannel.clear();
  searchOutputChannel.show();

  searchOutputChannel.appendLine(`🔍 Search Results for: "${query}"`);
  searchOutputChannel.appendLine('='.repeat(60));

  if (results.length === 0) {
    searchOutputChannel.appendLine('No results found.');
    vscode.window.showInformationMessage(`No results found for "${query}"`);
    return;
  }

  searchOutputChannel.appendLine(`Found ${results.length} results:\n`);

  results.forEach((result, index) => {
    searchOutputChannel.appendLine(`${index + 1}. 📄 ${result.fileName}`);
    searchOutputChannel.appendLine(`   📁 ${result.filePath}`);
    searchOutputChannel.appendLine(`   🔤 Language: ${result.language}`);
    searchOutputChannel.appendLine(`   📏 Lines: ${result.lineCount}`);
    searchOutputChannel.appendLine(
      `   ⏰ Modified: ${result.lastModified.toLocaleDateString()}`
    );

    // Show content preview with highlighted matches
    const contentPreview = getContentPreview(result.content, query);
    if (contentPreview) {
      searchOutputChannel.appendLine(`   📝 Preview: ${contentPreview}`);
    }

    searchOutputChannel.appendLine(''); // Empty line between results
  });

  vscode.window.showInformationMessage(
    `Found ${results.length} results for "${query}"`
  );
}

/**
 * Get content preview with highlighted search term
 */
function getContentPreview(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) {
    return ''; // No match in content
  }

  // Get context around the match
  const start = Math.max(0, index - 30);
  const end = Math.min(content.length, index + query.length + 50);

  let preview = content.substring(start, end);

  // Replace newlines with spaces for cleaner display
  preview = preview.replace(/\r?\n/g, ' ');

  // Add ellipsis if we truncated
  if (start > 0) preview = '...' + preview;
  if (end < content.length) preview = preview + '...';

  return preview;
}

/**
 * Handle Build Search Index command
 */
async function handleBuildSearchIndexCommand(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Building search index...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      await buildSearchIndex();
      progress.report({ increment: 100 });
    }
  );
}

/**
 * Handle Search Stats command
 */
async function handleSearchStatsCommand(): Promise<void> {
  const stats = getSearchStats();

  searchOutputChannel.clear();
  searchOutputChannel.show();

  searchOutputChannel.appendLine('📊 Search Index Statistics');
  searchOutputChannel.appendLine('='.repeat(40));
  searchOutputChannel.appendLine(`📁 Files indexed: ${stats.fileCount}`);
  searchOutputChannel.appendLine(`📏 Total lines: ${stats.totalLines}`);
  searchOutputChannel.appendLine(
    `🔄 Indexing: ${stats.isIndexing ? 'In progress...' : 'Complete'}`
  );

  vscode.window.showInformationMessage(
    `Search index: ${stats.fileCount} files, ${stats.totalLines} lines`
  );
}

/**
 * Handle Summarize File command
 */
async function handleSummarizeFileCommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showWarningMessage(
        'No active text editor found. Please open a file first.'
      );
      return;
    }

    const fileContent = editor.document.getText();
    const fileName =
      editor.document.fileName.split('/').pop() || 'current file';
    const language = editor.document.languageId;

    if (!fileContent.trim()) {
      vscode.window.showWarningMessage('File is empty. Nothing to summarize.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `AI is summarizing ${fileName}...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const prompt = `Please provide a concise summary of this ${language} file. Focus on:
1. Main purpose or functionality
2. Key functions/classes
3. Important patterns or architecture
4. Any notable dependencies or imports

File content:\n\n${fileContent.substring(0, 3000)}`;

        let aiResponse: string;

        if (process.env.HUGGINGFACE_API_TOKEN) {
          aiResponse = await callAI(prompt);
        } else {
          aiResponse = await callAIMock(prompt);
          vscode.window.showWarningMessage(
            'Using mock AI response. Set HUGGINGFACE_API_TOKEN for real AI.'
          );
        }

        progress.report({ increment: 100 });

        if (aiResponse.startsWith('ERROR:')) {
          vscode.window.showErrorMessage(`AI Error: ${aiResponse}`);
          return;
        }

        aiOutputChannel.clear();
        aiOutputChannel.appendLine(`📄 AI Summary for: ${fileName}`);
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.appendLine(aiResponse);
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage(
          `AI summary for ${fileName} ready!`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error in Summarize File: ${error.message}`);
    console.error('Summarize File Error:', error);
  }
}

/**
 * Handle Smart Explain Command - Enhanced AI with project context
 */
async function handleSmartExplainCommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found.');
      return;
    }

    const selection = editor.selection;
    const selectedCode = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    if (!selectedCode.trim()) {
      vscode.window.showWarningMessage('No code selected or file is empty.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '🤖 Smart Analysis: Searching project context...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const result = await smartCodeAnalysis({
          selectedCode,
          userQuery: 'Explain this code considering the project context:',
          useEnhancedContext: true,
          maxSearchResults: 6,
        });

        progress.report({ increment: 100 });

        // Display results
        aiOutputChannel.clear();
        aiOutputChannel.appendLine('🧠 SMART CODE EXPLANATION');
        aiOutputChannel.appendLine('='.repeat(50));

        if (result.success) {
          aiOutputChannel.appendLine(
            `✅ Analysis completed in ${result.workflowTime}ms`
          );
          aiOutputChannel.appendLine(
            `📁 Used context from ${result.contextUsed.length} files`
          );
          aiOutputChannel.appendLine('');
          aiOutputChannel.appendLine(result.response);

          // Show context info
          if (result.contextUsed.length > 0) {
            aiOutputChannel.appendLine('');
            aiOutputChannel.appendLine('📚 Context Used:');
            result.contextUsed.forEach((file: string) => {
              aiOutputChannel.appendLine(`  - ${file}`);
            });
          }
        } else {
          aiOutputChannel.appendLine('❌ Analysis failed');
          aiOutputChannel.appendLine(result.response);
        }

        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage(
          `Smart analysis complete! Used ${result.contextUsed.length} context files.`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Smart explain error: ${error.message}`);
  }
}

/**
 * Handle Deep Analysis Command - Comprehensive analysis with full context
 */
async function handleDeepAnalysisCommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found.');
      return;
    }

    const selectedCode = editor.document.getText(
      editor.selection.isEmpty ? undefined : editor.selection
    );
    if (!selectedCode.trim()) {
      vscode.window.showWarningMessage('No code selected.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '🔍 Deep Analysis: Comprehensive code review...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const result = await deepCodeAnalysis(selectedCode);

        progress.report({ increment: 100 });

        aiOutputChannel.clear();
        aiOutputChannel.appendLine('🔍 DEEP CODE ANALYSIS');
        aiOutputChannel.appendLine('='.repeat(50));

        if (result.success) {
          aiOutputChannel.appendLine(
            `✅ Deep analysis completed in ${result.workflowTime}ms`
          );
          aiOutputChannel.appendLine(
            `📁 Analyzed ${result.searchResultsCount} related files`
          );
          aiOutputChannel.appendLine('');
          aiOutputChannel.appendLine(result.response);
        } else {
          aiOutputChannel.appendLine('❌ Deep analysis failed');
          aiOutputChannel.appendLine(result.response);
        }

        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage('Deep analysis completed!');
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Deep analysis error: ${error.message}`);
  }
}

/**
 * Handle Pattern Analysis Command - Find and analyze similar patterns
 */
async function handlePatternAnalysisCommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found.');
      return;
    }

    const selectedCode = editor.document.getText(
      editor.selection.isEmpty ? undefined : editor.selection
    );
    if (!selectedCode.trim()) {
      vscode.window.showWarningMessage('No code selected.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '🎯 Pattern Analysis: Finding similar code patterns...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const result = await patternAnalysis(selectedCode);

        progress.report({ increment: 100 });

        aiOutputChannel.clear();
        aiOutputChannel.appendLine('🎯 PATTERN ANALYSIS');
        aiOutputChannel.appendLine('='.repeat(50));

        if (result.success) {
          aiOutputChannel.appendLine(
            `✅ Pattern analysis completed in ${result.workflowTime}ms`
          );
          aiOutputChannel.appendLine(
            `📊 Found patterns across ${result.searchResultsCount} files`
          );
          aiOutputChannel.appendLine('');
          aiOutputChannel.appendLine(result.response);
        } else {
          aiOutputChannel.appendLine('❌ Pattern analysis failed');
          aiOutputChannel.appendLine(result.response);
        }

        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage('Pattern analysis completed!');
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Pattern analysis error: ${error.message}`);
  }
}

/**
 * Handle Analyze Search Results Command - AI analysis of search results
 */
async function handleAnalyzeSearchResultsCommand(): Promise<void> {
  try {
    // Get search query from user
    const searchQuery = await vscode.window.showInputBox({
      prompt: 'Enter search term to analyze with AI',
      placeHolder: 'e.g., authentication, API calls, error handling',
    });

    if (!searchQuery) {
      return; // User cancelled
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🤔 AI Analysis: Analyzing search results for "${searchQuery}"...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const result = await analyzeSearchResults(searchQuery, 8);

        progress.report({ increment: 100 });

        aiOutputChannel.clear();
        aiOutputChannel.appendLine(`🤔 AI ANALYSIS OF: "${searchQuery}"`);
        aiOutputChannel.appendLine('='.repeat(50));

        if (result.success) {
          aiOutputChannel.appendLine(
            `✅ Analysis completed in ${result.workflowTime}ms`
          );
          aiOutputChannel.appendLine(
            `📁 Analyzed ${result.searchResultsCount} search results`
          );
          aiOutputChannel.appendLine('');
          aiOutputChannel.appendLine(result.response);

          // Show which files were analyzed
          if (result.contextUsed.length > 0) {
            aiOutputChannel.appendLine('');
            aiOutputChannel.appendLine('📚 Files Analyzed:');
            result.contextUsed.forEach((file: string) => {
              aiOutputChannel.appendLine(`  - ${file}`);
            });
          }
        } else {
          aiOutputChannel.appendLine('❌ Analysis failed');
          aiOutputChannel.appendLine(result.response);
        }

        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage(
          `AI analysis of "${searchQuery}" completed! Analyzed ${result.searchResultsCount} files.`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Search analysis error: ${error.message}`);
  }
}
