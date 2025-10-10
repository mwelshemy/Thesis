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

// ============================================================================
// COMMAND HANDLER FUNCTIONS (DECLARED BEFORE ACTIVATE)
// ============================================================================

/**
 * Handle Ask AI Command - Basic AI code explanation
 */
async function handleAskAICommand(): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showWarningMessage('No active text editor found.');
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
        title: '🤖 AI is analyzing your code...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const prompt = `Please explain this code:\n\n${selectedCode.substring(0, 2000)}`;

        let aiResponse: string;

        // Check if we have a real API token
        if (process.env.HUGGINGFACE_API_TOKEN && 
            !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')) {
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
        aiOutputChannel.appendLine('🤖 AI CODE EXPLANATION');
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.appendLine(aiResponse);
        aiOutputChannel.appendLine('='.repeat(50));
        aiOutputChannel.show();

        vscode.window.showInformationMessage('AI analysis completed!');
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`AI Analysis Error: ${error.message}`);
    console.error('Ask AI Error:', error);
  }
}

/**
 * Handle Search Project Command - Search across project files
 */
async function handleSearchProjectCommand(): Promise<void> {
  try {
    const searchQuery = await vscode.window.showInputBox({
      prompt: 'Enter search term to find in project files',
      placeHolder: 'e.g., function name, variable, comment',
    });

    if (searchQuery === undefined) {
      return; // User cancelled
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🔍 Searching for "${searchQuery || 'all files'}"...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const results = searchIndex(searchQuery || '', 20);

        progress.report({ increment: 100 });

        searchOutputChannel.clear();
        searchOutputChannel.appendLine(`🔍 SEARCH RESULTS: "${searchQuery || 'all files'}"`);
        searchOutputChannel.appendLine('='.repeat(50));

        if (results.length === 0) {
          searchOutputChannel.appendLine('No files found matching your search.');
          searchOutputChannel.appendLine('Try building the search index first or using different terms.');
        } else {
          searchOutputChannel.appendLine(`Found ${results.length} files:\n`);

          results.forEach((file, index) => {
            searchOutputChannel.appendLine(`${index + 1}. ${file.fileName}`);
            searchOutputChannel.appendLine(`   Path: ${file.filePath}`);
            searchOutputChannel.appendLine(`   Language: ${file.language}`);
            searchOutputChannel.appendLine(`   Lines: ${file.lineCount}`);
            
            // Show preview of content
            const preview = file.content.substring(0, 100).replace(/\n/g, ' ');
            searchOutputChannel.appendLine(`   Preview: ${preview}...`);
            searchOutputChannel.appendLine('');
          });
        }

        searchOutputChannel.appendLine('='.repeat(50));
        searchOutputChannel.show();

        vscode.window.showInformationMessage(
          `Search complete! Found ${results.length} files.`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Search Error: ${error.message}`);
    console.error('Search Project Error:', error);
  }
}

/**
 * Handle Build Search Index Command - Rebuild the file index
 */
async function handleBuildSearchIndexCommand(): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '📁 Building search index...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        // Simulate progress steps
        progress.report({ increment: 20, message: 'Finding files...' });
        await new Promise(resolve => setTimeout(resolve, 500));

        progress.report({ increment: 50, message: 'Reading file contents...' });
        const results = await buildSearchIndex();

        progress.report({ increment: 100, message: 'Index complete!' });

        vscode.window.showInformationMessage(
          `Search index built! ${results.length} files indexed.`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Index Build Error: ${error.message}`);
    console.error('Build Search Index Error:', error);
  }
}

/**
 * Handle Search Stats Command - Show indexing statistics
 */
async function handleSearchStatsCommand(): Promise<void> {
  try {
    const stats = getSearchStats();

    searchOutputChannel.clear();
    searchOutputChannel.appendLine('📊 SEARCH STATISTICS');
    searchOutputChannel.appendLine('='.repeat(50));
    searchOutputChannel.appendLine(`Files indexed: ${stats.fileCount}`);
    searchOutputChannel.appendLine(`Total lines: ${stats.totalLines}`);
    searchOutputChannel.appendLine(`Indexing status: ${stats.isIndexing ? 'In progress' : 'Complete'}`);
    searchOutputChannel.appendLine('='.repeat(50));
    searchOutputChannel.show();

    vscode.window.showInformationMessage(
      `Search stats: ${stats.fileCount} files, ${stats.totalLines} lines`
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Stats Error: ${error.message}`);
    console.error('Search Stats Error:', error);
  }
}

/**
 * Handle Summarize File Command - AI summary of current file
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
    const fileName = editor.document.fileName.split('/').pop() || 'current file';
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

        if (process.env.HUGGINGFACE_API_TOKEN && 
            !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')) {
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
        aiOutputChannel.appendLine(`📄 AI SUMMARY: ${fileName}`);
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
    vscode.window.showErrorMessage(`Summarize File Error: ${error.message}`);
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
    console.error('Smart Explain Error:', error);
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
    console.error('Deep Analysis Error:', error);
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
    console.error('Pattern Analysis Error:', error);
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
    console.error('Analyze Search Results Error:', error);
  }
}

// ============================================================================
// EXTENSION ACTIVATION
// ============================================================================

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