import * as vscode from 'vscode';
import { callAI, callAIMock } from './ai/callAI';
import {
  buildSearchIndex,
  searchIndex,
  getSearchStats,
  clearSearchIndex,
  initializeSearch,
  searchByLanguage,
  getFileByPath,
} from './search';
import {
  smartCodeAnalysis,
  deepCodeAnalysis,
  patternAnalysis,
  analyzeSearchResults,
} from './integration/workflow-orchestrator';

// Global output channel for AI responses
let aiOutputChannel: vscode.OutputChannel;

// Search functionality
let searchOutputChannel: vscode.OutputChannel;

// ============================================================================
// COMMAND HANDLER FUNCTIONS
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
        if (
          process.env.HUGGINGFACE_API_TOKEN &&
          !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')
        ) {
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
        searchOutputChannel.appendLine(
          `🔍 SEARCH RESULTS: "${searchQuery || 'all files'}"`
        );
        searchOutputChannel.appendLine('='.repeat(50));

        if (results.length === 0) {
          searchOutputChannel.appendLine(
            'No files found matching your search.'
          );
          searchOutputChannel.appendLine(
            'Try building the search index first or using different terms.'
          );
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
        await new Promise((resolve) => setTimeout(resolve, 500));

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
    searchOutputChannel.appendLine(
      `Indexing status: ${stats.isIndexing ? 'In progress' : 'Complete'}`
    );
    searchOutputChannel.appendLine(`Index size: ${stats.totalIndexSize}`);
    if (stats.lastIndexBuild) {
      searchOutputChannel.appendLine(
        `Last build: ${stats.lastIndexBuild.toLocaleString()}`
      );
    }
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

        if (
          process.env.HUGGINGFACE_API_TOKEN &&
          !process.env.HUGGINGFACE_API_TOKEN.includes('your_token_here')
        ) {
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

/**
 * Handle Search by Language Command - Filter files by programming language
 */
async function handleSearchByLanguageCommand(): Promise<void> {
  try {
    const languages = [
      'typescript',
      'javascript',
      'python',
      'java',
      'css',
      'html',
      'markdown',
    ];
    const selectedLanguage = await vscode.window.showQuickPick(languages, {
      placeHolder: 'Select programming language to search',
    });

    if (!selectedLanguage) {
      return; // User cancelled
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `🔍 Searching ${selectedLanguage} files...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const results = searchByLanguage(selectedLanguage);

        progress.report({ increment: 100 });

        searchOutputChannel.clear();
        searchOutputChannel.appendLine(
          `🔍 ${selectedLanguage.toUpperCase()} FILES`
        );
        searchOutputChannel.appendLine('='.repeat(50));

        if (results.length === 0) {
          searchOutputChannel.appendLine(`No ${selectedLanguage} files found.`);
          searchOutputChannel.appendLine(
            'Try building the search index first.'
          );
        } else {
          searchOutputChannel.appendLine(
            `Found ${results.length} ${selectedLanguage} files:\n`
          );

          results.forEach((file, index) => {
            searchOutputChannel.appendLine(`${index + 1}. ${file.fileName}`);
            searchOutputChannel.appendLine(`   Path: ${file.filePath}`);
            searchOutputChannel.appendLine(`   Lines: ${file.lineCount}`);
            searchOutputChannel.appendLine(
              `   Modified: ${file.lastModified.toLocaleString()}`
            );
            searchOutputChannel.appendLine('');
          });
        }

        searchOutputChannel.appendLine('='.repeat(50));
        searchOutputChannel.show();

        vscode.window.showInformationMessage(
          `Found ${results.length} ${selectedLanguage} files`
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Language search error: ${error.message}`);
    console.error('Search by Language Error:', error);
  }
}

/**
 * Handle Clear Search Index Command - Clear the in-memory search index
 */
async function handleClearSearchIndexCommand(): Promise<void> {
  try {
    const choice = await vscode.window.showWarningMessage(
      'Are you sure you want to clear the search index? This will remove all indexed files.',
      { modal: true },
      'Yes, Clear Index'
    );

    if (choice === 'Yes, Clear Index') {
      clearSearchIndex();
      searchOutputChannel.appendLine('🗑️ Search index cleared by user');
      vscode.window.showInformationMessage('Search index cleared successfully');
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Clear index error: ${error.message}`);
    console.error('Clear Search Index Error:', error);
  }
}

/**
 * Handle Quick File Search Command - Fast search with quick pick
 */
async function handleQuickFileSearchCommand(): Promise<void> {
  try {
    // Get recent files from index
    const recentFiles = searchIndex('', 15);

    if (recentFiles.length === 0) {
      vscode.window.showWarningMessage(
        'No files indexed. Build search index first.'
      );
      return;
    }

    const quickPickItems = recentFiles.map((file) => ({
      label: file.fileName,
      description: file.filePath,
      detail: `${file.language} • ${file.lineCount} lines`,
      file: file,
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: 'Search for a file...',
    });

    if (selected) {
      // Open the selected file
      const document = await vscode.workspace.openTextDocument(
        selected.file.filePath
      );
      await vscode.window.showTextDocument(document);

      vscode.window.showInformationMessage(`Opened: ${selected.file.fileName}`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Quick file search error: ${error.message}`);
    console.error('Quick File Search Error:', error);
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

  // Register all commands
  const commands = [
    // Hello World command
    vscode.commands.registerCommand('vs-code-ai-extension.helloWorld', () => {
      const now = new Date().toLocaleString();
      vscode.window.showInformationMessage(
        `Hello World from VS Code AI Extension! Time: ${now}`
      );
    }),

    // AI Commands
    vscode.commands.registerCommand('vs-code-ai-extension.askAI', handleAskAICommand),
    vscode.commands.registerCommand('vs-code-ai-extension.summarizeFile', handleSummarizeFileCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.smartExplain', handleSmartExplainCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.deepAnalysis', handleDeepAnalysisCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.patternAnalysis', handlePatternAnalysisCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.analyzeSearchResults', handleAnalyzeSearchResultsCommand),

    // Search Commands
    vscode.commands.registerCommand('vs-code-ai-extension.searchProject', handleSearchProjectCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.buildSearchIndex', handleBuildSearchIndexCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.searchStats', handleSearchStatsCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.searchByLanguage', handleSearchByLanguageCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.clearSearchIndex', handleClearSearchIndexCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.quickFileSearch', handleQuickFileSearchCommand),
  ];

  // Add all commands to subscriptions
  commands.forEach(command => context.subscriptions.push(command));

  console.log(`✅ Registered ${commands.length} commands successfully`);

  // Auto-build index on activation (with delay to let VS Code initialize)
  setTimeout(() => {
    vscode.window.showInformationMessage('VS AI: Building search index...');
    buildSearchIndex().then((results) => {
      if (results.length > 0) {
        vscode.window.showInformationMessage(
          `VS AI: Search index ready! ${results.length} files indexed.`
        );
      }
    });
  }, 3000);

  // Register for workspace changes to auto-update index
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.fileName.includes('node_modules')) {
      return; // Skip node_modules
    }
    // Debounced index update
    setTimeout(() => {
      buildSearchIndex();
    }, 1000);
  });

  console.log('✅ All VS AI commands registered successfully');
}

export function deactivate() {
  // Clean up if needed
  console.log('VS Code AI Extension deactivated');
}