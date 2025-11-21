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

/** Utilities */
async function runWithProgress<T>(
  title: string,
  task: (p: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
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

function postToSidebar(title: string, content: string | object, action?: string) {
  if (sidebarProvider) {
    sidebarProvider.showAIAnalysis(title, content, action);
  }
}

/** Utility functions for file access */
async function getAllProjectFiles(): Promise<vscode.Uri[]> {
  try {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return [];
    }

    const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*');
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
    
    return files;
  } catch (err) {
    console.error('Error getting project files:', err);
    vscode.window.showErrorMessage('Error accessing project files.');
    return [];
  }
}

async function analyzeFileForBugs(filename: string, content: string, language: string): Promise<string | null> {
  try {
    const prompt = `Analyze this ${language} file for bugs and issues:

File: ${filename}
Content:
\`\`\`${language}
${content.substring(0, 2000)}
\`\`\`

Provide a concise bug report focusing on critical issues only. If no significant issues found, return "No critical issues found."`;

    const response = await callAI(prompt);
    
    if (response && !response.includes('No critical issues') && !response.includes('no significant issues')) {
      return `## ${filename}\n\n${response}`;
    }
    
    return null;
  } catch (err) {
    console.warn(`Failed to analyze ${filename} for bugs:`, err);
    return null;
  }
}

function getLanguageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    'js': 'JavaScript',
    'ts': 'TypeScript',
    'jsx': 'React JSX',
    'tsx': 'React TSX',
    'py': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'cs': 'C#',
    'php': 'PHP',
    'rb': 'Ruby',
    'go': 'Go',
    'rs': 'Rust',
    'html': 'HTML',
    'css': 'CSS',
    'json': 'JSON',
    'md': 'Markdown',
    'xml': 'XML',
    'yml': 'YAML',
    'yaml': 'YAML'
  };
  
  return map[ext] || ext;
}

/** Enhanced command handlers that work with entire codebase */
export async function handleAnalyzeEntireProjectCommand(): Promise<void> {
  try {
    await runWithProgress('Analyzing entire project...', async (progress) => {
      progress.report({ message: 'Scanning project files...' });
      
      // Get all files in workspace
      const files = await getAllProjectFiles();
      
      if (files.length === 0) {
        postToSidebar('Project Analysis', 'No files found in workspace.', 'analyzeProject');
        return;
      }

      progress.report({ message: `Found ${files.length} files, analyzing key files...` });
      
      // Read and concatenate file contents
      let combinedContent = '';
      let filesProcessed = 0;
      
      // Prioritize important files first
      const importantFiles = files.filter(file => {
        const name = file.fsPath.toLowerCase();
        return !name.includes('node_modules') && 
               !name.includes('dist') &&
               !name.includes('build') &&
               !name.includes('.git');
      }).sort((a, b) => {
        // Prioritize source files over config files
        const aIsConfig = a.fsPath.includes('config') || a.fsPath.includes('package.json');
        const bIsConfig = b.fsPath.includes('config') || b.fsPath.includes('package.json');
        return aIsConfig === bIsConfig ? 0 : aIsConfig ? 1 : -1;
      });

      for (const file of importantFiles.slice(0, 30)) { // Limit to avoid token limits
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const content = doc.getText();
          if (content.trim().length > 10) { // Only include non-empty files
            combinedContent += `\n\n// File: ${file.fsPath.split(/[\\/]/).pop()}\n// Path: ${file.fsPath}\n\`\`\`${doc.languageId}\n${content.substring(0, 500)}\n\`\`\``;
            filesProcessed++;
          }
        } catch (err) {
          console.warn(`Could not read file: ${file.fsPath}`, err);
        }
      }

      if (!combinedContent.trim()) {
        postToSidebar('Project Analysis', 'Could not read any files for analysis.', 'analyzeProject');
        return;
      }

      progress.report({ message: `Analyzed ${filesProcessed} files, generating report...` });

      const prompt = `Analyze this entire project structure and code:

${combinedContent.substring(0, 12000)}

Please provide a comprehensive analysis covering:
1. Overall project structure and architecture
2. Main technologies and frameworks used
3. Key modules and their responsibilities
4. Code quality assessment
5. Potential issues or improvements
6. Dependencies and relationships between files
7. Build configuration and setup

Project Analysis:`;
      
      const response = await callAI(prompt);
      const fullAnalysis = `## Complete Project Analysis\n\n**Files Scanned:** ${filesProcessed} of ${files.length} total files\n\n${response}`;
      postToSidebar('Complete Project Analysis', fullAnalysis, 'analyzeProject');
    });
  } catch (err: any) {
    postToSidebar('Project Analysis Error', 'Failed to analyze project: ' + String(err), 'analyzeProject');
    console.error(err);
  }
}

export async function handleFindBugsInProjectCommand(): Promise<void> {
  try {
    await runWithProgress('Scanning project for bugs...', async (progress) => {
      progress.report({ message: 'Collecting project files...' });
      
      const files = await getAllProjectFiles();
      const bugReports: string[] = [];
      
      if (files.length === 0) {
        postToSidebar('Project Bug Scan', 'No files found to analyze.', 'findBugsInProject');
        return;
      }

      // Focus on source code files
      const sourceFiles = files.filter(file => {
        const ext = file.fsPath.split('.').pop() || '';
        const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
        return sourceExtensions.includes(ext);
      });

      // Analyze files in batches
      for (let i = 0; i < Math.min(sourceFiles.length, 25); i++) {
        const file = sourceFiles[i];
        progress.report({ 
          message: `Analyzing ${file.fsPath.split(/[\\/]/).pop()} (${i+1}/${Math.min(sourceFiles.length, 25)})...`,
          increment: (100 / Math.min(sourceFiles.length, 25))
        });
        
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const content = doc.getText();
          const language = doc.languageId || getLanguageFromExtension(file.fsPath.split('.').pop() || '');
          
          if (content.length > 50) { // Only analyze non-trivial files
            const bugReport = await analyzeFileForBugs(file.fsPath.split(/[\\/]/).pop() || 'unknown', content, language);
            if (bugReport) {
              bugReports.push(bugReport);
            }
          }
        } catch (err) {
          console.warn(`Could not analyze file: ${file.fsPath}`, err);
        }
      }

      if (bugReports.length === 0) {
        postToSidebar('Project Bug Scan', 'No significant issues found in scanned files.', 'findBugsInProject');
        return;
      }

      const combinedReport = `## Project Bug Scan Report\n\n**Files Analyzed:** ${Math.min(sourceFiles.length, 25)} source files\n\n${bugReports.join('\n\n---\n\n')}`;
      postToSidebar('Project Bug Report', combinedReport, 'findBugsInProject');
    });
  } catch (err: any) {
    postToSidebar('Bug Scan Error', 'Failed to scan project for bugs: ' + String(err), 'findBugsInProject');
    console.error(err);
  }
}

export async function handleGenerateProjectSummaryCommand(): Promise<void> {
  try {
    await runWithProgress('Generating project summary...', async (progress) => {
      progress.report({ message: 'Analyzing project structure...' });
      
      const files = await getAllProjectFiles();
      
      if (files.length === 0) {
        postToSidebar('Project Summary', 'No files found in workspace.', 'generateProjectSummary');
        return;
      }

      const fileStats = {
        total: files.length,
        byLanguage: {} as Record<string, number>,
        byExtension: {} as Record<string, number>
      };

      // Collect file statistics
      files.forEach(file => {
        const ext = file.fsPath.split('.').pop() || 'none';
        const lang = getLanguageFromExtension(ext);
        
        fileStats.byExtension[ext] = (fileStats.byExtension[ext] || 0) + 1;
        fileStats.byLanguage[lang] = (fileStats.byLanguage[lang] || 0) + 1;
      });

      // Sample key files for analysis
      const keyFiles = files.filter(file => {
        const name = file.fsPath.toLowerCase();
        return name.includes('package.json') || 
               name.includes('readme') ||
               name.includes('index.') ||
               name.includes('app.') ||
               name.includes('main.') ||
               name.includes('server.') ||
               name.includes('client.') ||
               name.includes('manifest.json') ||
               name.includes('dockerfile') ||
               name.includes('.config.') ||
               !name.includes('test');
      }).slice(0, 15);

      let sampleContent = '';
      let filesRead = 0;
      
      for (const file of keyFiles) {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const content = doc.getText();
          if (content.trim().length > 10) {
            sampleContent += `\n\n// File: ${file.fsPath.split(/[\\/]/).pop()}\n\`\`\`${doc.languageId}\n${content.substring(0, 800)}\n\`\`\``;
            filesRead++;
          }
        } catch (err) {
          // Skip files that can't be read
        }
      }

      progress.report({ message: 'Generating comprehensive summary...' });

      const prompt = `Based on this project structure and sample files, provide a comprehensive summary:

File Statistics:
- Total files: ${fileStats.total}
- By language: ${JSON.stringify(fileStats.byLanguage)}
- By extension: ${JSON.stringify(fileStats.byExtension)}

Sample Files Content:
${sampleContent.substring(0, 10000)}

Please provide:
1. Project type and main technology stack
2. Overall architecture and structure
3. Key components and their purposes
4. Development patterns and conventions used
5. Estimated complexity and scale
6. Recommendations for organization or improvements
7. Dependencies and build process insights

Project Summary:`;
      
      const response = await callAI(prompt);
      const fullReport = `## Project Overview\n\n**File Statistics:**\n- Total Files: ${fileStats.total}\n- Languages: ${JSON.stringify(fileStats.byLanguage)}\n- Extensions: ${JSON.stringify(fileStats.byExtension)}\n- Key Files Analyzed: ${filesRead}\n\n${response}`;
      
      postToSidebar('Project Summary', fullReport, 'generateProjectSummary');
    });
  } catch (err: any) {
    postToSidebar('Summary Error', 'Failed to generate project summary: ' + String(err), 'generateProjectSummary');
    console.error(err);
  }
}

/** New Command Handlers for Revamped UI */
export async function handleChatCommand(payload?: { message?: string }): Promise<void> {
  try {
    const userMessage = payload?.message;
    if (!userMessage?.trim()) {
      postToSidebar('Chat', 'Please enter a message.', 'chat');
      return;
    }

    await runWithProgress('AI is thinking...', async (progress) => {
      progress.report({ message: 'Processing your question...' });

      const prompt = `You are a helpful AI coding assistant. The user is asking: "${userMessage}"

Please provide a helpful, concise response focused on coding assistance. If they're asking about code, provide practical examples and explanations.

Response:`;
      
      const response = await callAI(prompt);
      postToSidebar('Chat Response', response, 'chat');
    });
  } catch (err: any) {
    postToSidebar('Chat Error', 'Failed to process your message: ' + String(err), 'chat');
    console.error(err);
  }
}

export async function handleExplainCodeCommand(payload?: { code?: string; path?: string }): Promise<void> {
  try {
    let code = payload?.code;
    const filePath = payload?.path;
    
    // Handle project-wide explanation
    if (filePath === 'project') {
      postToSidebar('Explain Project', 'Project-wide explanation is available through project analysis features.', 'explainCode');
      return;
    }
    
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        postToSidebar('Explain Code', 'Please open a file or select code to explain.', 'explainCode');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
    }

    if (!code?.trim()) {
      postToSidebar('Explain Code', 'No code provided to explain.', 'explainCode');
      return;
    }

    await runWithProgress('Analyzing code...', async (progress) => {
      progress.report({ message: 'Understanding the code structure...' });

      const prompt = `Please explain this code in detail:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Provide a clear explanation covering:
1. What this code does
2. Key functions/classes and their purposes
3. Data flow and important variables
4. Any notable patterns or architectures

Explanation:`;
      
      const response = await callAI(prompt);
      postToSidebar('Code Explanation', response, 'explainCode');
    });
  } catch (err: any) {
    postToSidebar('Explanation Error', 'Failed to explain code: ' + String(err), 'explainCode');
    console.error(err);
  }
}

export async function handleSummarizeFileCommand(payload?: { path?: string }): Promise<void> {
  try {
    let filePath = payload?.path;
    
    // Handle project-wide analysis
    if (filePath === 'project') {
      await handleGenerateProjectSummaryCommand();
      return;
    }
    
    if (!filePath) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        postToSidebar('Summarize File', 'Please open a file to summarize.', 'summarizeFile');
        return;
      }
      filePath = editor.document.uri.fsPath;
    }

    const safePath = filePath;
    const doc = await vscode.workspace.openTextDocument(safePath);
    const content = doc.getText();
    
    if (!content.trim()) {
      postToSidebar('Summarize File', 'File is empty.', 'summarizeFile');
      return;
    }

    await runWithProgress('Summarizing file...', async (progress) => {
      progress.report({ message: 'Reading and analyzing file contents...' });

      const prompt = `Please provide a comprehensive summary of this file:

File: ${safePath.split(/[\\/]/).pop()}
Language: ${doc.languageId}

Content:
\`\`\`${doc.languageId}
${content.substring(0, 4000)}
\`\`\`

Please provide:
1. Overall purpose and main functionality
2. Key components (functions, classes, modules)
3. Architecture and design patterns
4. Dependencies and imports
5. Any notable complexity or important details

Summary:`;
      
      const response = await callAI(prompt);
      postToSidebar(`File Summary - ${safePath.split(/[\\/]/).pop()}`, response, 'summarizeFile');
    });
  } catch (err: any) {
    postToSidebar('Summary Error', 'Failed to summarize file: ' + String(err), 'summarizeFile');
    console.error(err);
  }
}

export async function handleFindBugsCommand(payload?: { code?: string; path?: string }): Promise<void> {
  try {
    let code = payload?.code;
    const filePath = payload?.path;
    
    // Handle project-wide bug scan
    if (filePath === 'project') {
      await handleFindBugsInProjectCommand();
      return;
    }
    
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        postToSidebar('Find Bugs', 'Please open a file or select code to analyze.', 'findBugs');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
    }

    if (!code?.trim()) {
      postToSidebar('Find Bugs', 'No code provided to analyze.', 'findBugs');
      return;
    }

    await runWithProgress('Looking for issues...', async (progress) => {
      progress.report({ message: 'Scanning for potential bugs and issues...' });

      const prompt = `Analyze this code for potential issues, bugs, and problems:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Please identify:
1. Syntax errors or potential runtime errors
2. Logical errors or edge cases not handled
3. Security vulnerabilities
4. Performance issues
5. Code smells or anti-patterns
6. Potential improvements

For each issue found, provide:
- Issue type (bug, vulnerability, performance, etc.)
- Location or context
- Description of the problem
- Suggested fix

Analysis:`;
      
      const response = await callAI(prompt);
      postToSidebar('Code Issues Analysis', response, 'findBugs');
    });
  } catch (err: any) {
    postToSidebar('Bug Analysis Error', 'Failed to analyze code for issues: ' + String(err), 'findBugs');
    console.error(err);
  }
}

export async function handleSuggestImprovementsCommand(payload?: { code?: string; path?: string }): Promise<void> {
  try {
    let code = payload?.code;
    const filePath = payload?.path;
    
    // Handle project-wide improvements
    if (filePath === 'project') {
      postToSidebar('Project Improvements', 'Use project analysis features for project-wide improvement suggestions.', 'suggestImprovements');
      return;
    }
    
    if (!code) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        postToSidebar('Improve Code', 'Please open a file or select code to improve.', 'suggestImprovements');
        return;
      }
      const sel = editor.selection;
      code = sel.isEmpty ? editor.document.getText() : editor.document.getText(sel);
    }

    if (!code?.trim()) {
      postToSidebar('Improve Code', 'No code provided to improve.', 'suggestImprovements');
      return;
    }

    await runWithProgress('Analyzing for improvements...', async (progress) => {
      progress.report({ message: 'Finding optimization opportunities...' });

      const prompt = `Suggest improvements for this code:

\`\`\`
${code.substring(0, 3000)}
\`\`\`

Please provide specific, actionable suggestions for:
1. Code readability and maintainability
2. Performance optimizations
3. Best practices implementation
4. Architecture and design improvements
5. Error handling and robustness
6. Testing and documentation

For each suggestion, include:
- What to change
- Why it's an improvement
- Example of the improved code (if applicable)

Improvement Suggestions:`;
      
      const response = await callAI(prompt);
      postToSidebar('Code Improvement Suggestions', response, 'suggestImprovements');
    });
  } catch (err: any) {
    postToSidebar('Improvement Error', 'Failed to suggest improvements: ' + String(err), 'suggestImprovements');
    console.error(err);
  }
}

export async function handleCodeUnderstandingSearchCommand(payload?: { query?: string }): Promise<void> {
  try {
    const query = payload?.query;
    if (!query?.trim()) {
      postToSidebar('Code Understanding Search', 'Please describe what code you\'re looking for.', 'codeUnderstandingSearch');
      return;
    }

    await runWithProgress('Understanding your code request...', async (progress) => {
      progress.report({ message: 'Scanning project for matching code...' });

      // Get all project files
      const files = await getAllProjectFiles();
      
      if (files.length === 0) {
        postToSidebar('Code Understanding Search', 'No files found in project.', 'codeUnderstandingSearch');
        return;
      }

      // Filter to source code files
      const sourceFiles = files.filter(file => {
        const ext = file.fsPath.split('.').pop() || '';
        const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs'];
        return sourceExtensions.includes(ext);
      });

      progress.report({ message: `Analyzing ${sourceFiles.length} source files...` });

      // Read and analyze files for code that matches the description
      const matchingCodeSnippets: Array<{
        filePath: string;
        fileName: string;
        language: string;
        codeSnippet: string;
        functionName?: string;
        lineNumber: number;
        relevanceScore: number;
        explanation: string;
      }> = [];

      // Analyze files in batches to avoid overwhelming the AI
      const batchSize = 8;
      for (let i = 0; i < Math.min(sourceFiles.length, 30); i += batchSize) {
        const batch = sourceFiles.slice(i, i + batchSize);
        
        for (const file of batch) {
          try {
            const doc = await vscode.workspace.openTextDocument(file);
            const content = doc.getText();
            
            if (content.trim().length < 10) continue;

            // Extract meaningful code segments (functions, classes, etc.)
            const codeSegments = extractCodeSegments(content, doc.languageId, file.fsPath);
            
            if (codeSegments.length === 0) continue;

            // Analyze each significant code segment with AI
            for (const segment of codeSegments.slice(0, 5)) { // Limit segments per file
              const isRelevant = await analyzeCodeRelevance(query, segment.code, doc.languageId, segment.type);
              
              if (isRelevant.relevant) {
                matchingCodeSnippets.push({
                  filePath: file.fsPath,
                  fileName: file.fsPath.split(/[\\/]/).pop() || file.fsPath,
                  language: doc.languageId,
                  codeSnippet: segment.code,
                  functionName: segment.name,
                  lineNumber: segment.lineNumber,
                  relevanceScore: isRelevant.confidence,
                  explanation: isRelevant.explanation
                });
              }
            }
          } catch (err) {
            console.warn(`Could not analyze file: ${file.fsPath}`, err);
          }
        }
        
        progress.report({ 
          message: `Analyzed ${Math.min(i + batchSize, sourceFiles.length)}/${sourceFiles.length} files...`,
          increment: (batchSize / sourceFiles.length) * 100
        });
      }

      // Sort by relevance score
      matchingCodeSnippets.sort((a, b) => b.relevanceScore - a.relevanceScore);

      if (matchingCodeSnippets.length === 0) {
        postToSidebar('Code Understanding Search', `No code found that matches: "${query}"\n\nTry describing what the code does in different words.`, 'codeUnderstandingSearch');
        return;
      }

      // Format results for the UI
      const formattedResults = {
        type: 'codeUnderstandingResults',
        title: 'Code Understanding Search',
        summary: `Found ${matchingCodeSnippets.length} code segments matching your description: "${query}"`,
        query: query,
        results: matchingCodeSnippets.slice(0, 10) // Top 10 results
      };
      
      postToSidebar('Code Understanding Results', formattedResults, 'codeUnderstandingSearch');
    });
  } catch (err: any) {
    postToSidebar('Code Understanding Error', 'Failed to search for matching code: ' + String(err), 'codeUnderstandingSearch');
    console.error(err);
  }
}

// Helper function to extract meaningful code segments from files
function extractCodeSegments(content: string, language: string, filePath: string): Array<{
  name: string;
  code: string;
  type: string;
  lineNumber: number;
}> {
  const segments: Array<{ name: string; code: string; type: string; lineNumber: number }> = [];
  const lines = content.split('\n');

  try {
    if (['javascript', 'typescript'].includes(language)) {
      // Extract functions, classes, and significant blocks
      const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)|class\s+(\w+))/g;
      let match;
      
      while ((match = functionRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3];
        const startLine = content.substring(0, match.index).split('\n').length;
        
        // Extract the function/class body
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) {
          segments.push({
            name: name,
            code: codeBlock,
            type: match[3] ? 'class' : 'function',
            lineNumber: startLine
          });
        }
      }
    }
    
    if (language === 'python') {
      // Python functions and classes
      const functionRegex = /def\s+(\w+)\s*\(/g;
      const classRegex = /class\s+(\w+)\s*\(?/g;
      let match;
      
      while ((match = functionRegex.exec(content)) !== null) {
        const startLine = content.substring(0, match.index).split('\n').length;
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) {
          segments.push({
            name: match[1],
            code: codeBlock,
            type: 'function',
            lineNumber: startLine
          });
        }
      }
      
      while ((match = classRegex.exec(content)) !== null) {
        const startLine = content.substring(0, match.index).split('\n').length;
        const codeBlock = extractCodeBlock(content, match.index, language);
        if (codeBlock) {
          segments.push({
            name: match[1],
            code: codeBlock,
            type: 'class',
            lineNumber: startLine
          });
        }
      }
    }

    // If no functions/classes found, extract significant code blocks
    if (segments.length === 0) {
      // Extract the first substantial code block (non-import/comment)
      const substantialStart = lines.findIndex(line => 
        line.trim().length > 0 && 
        !line.trim().startsWith('//') && 
        !line.trim().startsWith('#') && 
        !line.trim().startsWith('import') && 
        !line.trim().startsWith('from ') &&
        !line.trim().startsWith('package ') &&
        !line.trim().startsWith('using ')
      );
      
      if (substantialStart !== -1) {
        const codeBlock = lines.slice(substantialStart, Math.min(substantialStart + 20, lines.length)).join('\n');
        segments.push({
          name: 'main',
          code: codeBlock,
          type: 'code block',
          lineNumber: substantialStart + 1
        });
      }
    }
  } catch (err) {
    console.warn('Error extracting code segments:', err);
  }

  return segments;
}

// Helper function to extract a code block (function, class, etc.)
function extractCodeBlock(content: string, startIndex: number, language: string): string {
  try {
    const bracketLanguages = ['javascript', 'typescript', 'java', 'cpp', 'c', 'cs', 'php', 'go', 'rust'];
    const indentLanguages = ['python', 'ruby'];
    
    if (bracketLanguages.includes(language)) {
      // Extract code within curly braces
      let braceCount = 0;
      let inBlock = false;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
          braceCount++;
          inBlock = true;
        } else if (content[i] === '}') {
          braceCount--;
        }
        
        if (inBlock && braceCount === 0 && content[i] === '}') {
          endIndex = i + 1;
          break;
        }
      }
      
      return content.substring(startIndex, endIndex).trim();
    } else if (indentLanguages.includes(language)) {
      // Extract indented block for Python
      const lines = content.substring(startIndex).split('\n');
      if (lines.length === 0) return '';
      
      const firstLine = lines[0];
      const baseIndent = firstLine.match(/^\s*/)?.[0].length || 0;
      const codeLines = [firstLine];
      
      for (let i = 1; i < lines.length; i++) {
        const currentIndent = lines[i].match(/^\s*/)?.[0].length || 0;
        if (currentIndent > baseIndent || lines[i].trim() === '') {
          codeLines.push(lines[i]);
        } else {
          break;
        }
      }
      
      return codeLines.join('\n').trim();
    }
  } catch (err) {
    console.warn('Error extracting code block:', err);
  }
  
  // Fallback: return a reasonable snippet
  return content.substring(startIndex, Math.min(startIndex + 500, content.length)).trim();
}

// Helper function to analyze if code is relevant to the query using AI
async function analyzeCodeRelevance(
  query: string, 
  code: string, 
  language: string, 
  codeType: string
): Promise<{ relevant: boolean; confidence: number; explanation: string }> {
  try {
    const prompt = `I'm looking for code that: "${query}"
    
Here is a ${codeType} (${language}) from my project:
\`\`\`${language}
${code.substring(0, 1500)}
\`\`\`

Please analyze if this code matches what I'm looking for. Consider:
- What the code actually does
- Its purpose and functionality
- Key operations it performs
- Patterns or architectures it uses

Respond with a JSON object:
{
  "relevant": true/false,
  "confidence": 0.0 to 1.0,
  "explanation": "Brief explanation of why it matches or doesn't match"
}

IMPORTANT: Return ONLY valid JSON, no other text.`;

    const response = await callAI(prompt);
    
    console.log('AI Response for code relevance:', response);
    
    // Parse JSON response
    try {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          relevant: result.relevant === true,
          confidence: Math.min(1.0, Math.max(0.0, result.confidence || 0.5)),
          explanation: result.explanation || 'No explanation provided'
        };
      }
    } catch (parseErr) {
      console.warn('Failed to parse AI response as JSON:', parseErr);
      console.warn('Raw response was:', response);
    }
    
    // Fallback: analyze the text response for relevance indicators
    return analyzeTextResponseForRelevance(response, query, code);
    
  } catch (err) {
    console.warn('Error analyzing code relevance:', err);
    return {
      relevant: false,
      confidence: 0.0,
      explanation: 'Error analyzing code relevance'
    };
  }
}

// Fallback function to analyze text response when JSON parsing fails
function analyzeTextResponseForRelevance(
  response: string, 
  query: string, 
  code: string
): { relevant: boolean; confidence: number; explanation: string } {
  const responseLower = response.toLowerCase();
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
  const codeLower = code.toLowerCase();
  
  // Check for positive indicators in the response
  const positiveIndicators = [
    'relevant', 'matches', 'yes', 'true', 'correct', 'appropriate', 
    'fits', 'suitable', 'related', 'similar', 'does match', 'is relevant'
  ];
  
  const negativeIndicators = [
    'not relevant', 'no', 'false', 'does not match', 'unrelated',
    'different', 'irrelevant', 'not what', 'no match'
  ];
  
  let relevant = false;
  let confidence = 0.5;
  let explanation = 'AI response could not be parsed, using fallback analysis';
  
  // Check for explicit positive/negative indicators
  const hasPositive = positiveIndicators.some(indicator => responseLower.includes(indicator));
  const hasNegative = negativeIndicators.some(indicator => responseLower.includes(indicator));
  
  if (hasPositive && !hasNegative) {
    relevant = true;
    confidence = 0.7;
    explanation = 'AI indicated this code is relevant to your query';
  } else if (hasNegative && !hasPositive) {
    relevant = false;
    confidence = 0.3;
    explanation = 'AI indicated this code is not relevant to your query';
  } else {
    // Use keyword matching as fallback
    const matches = queryTerms.filter(term => codeLower.includes(term)).length;
    const keywordConfidence = matches / Math.max(1, queryTerms.length);
    
    relevant = keywordConfidence > 0.3;
    confidence = keywordConfidence;
    explanation = `Matched ${matches} of ${queryTerms.length} key terms from your query`;
  }
  
  return {
    relevant,
    confidence,
    explanation
  };
}

export async function handleSemanticSearchCommand(payload?: { query?: string }): Promise<void> {
  try {
    const query = payload?.query;
    if (!query?.trim()) {
      postToSidebar('Semantic Search', 'Please enter a search query.', 'semanticSearch');
      return;
    }

    await runWithProgress('Searching with AI...', async (progress) => {
      progress.report({ message: 'Analyzing your query...' });

      // Get search results first
      const searchResults = searchIndex(query, 20);
      
      if (searchResults.length === 0) {
        postToSidebar('Semantic Search', `No files found matching "${query}"`, 'semanticSearch');
        return;
      }

      // Extract actual code content from files
      const resultsWithContent = await Promise.all(
        searchResults.slice(0, 10).map(async (result: any) => {
          try {
            const doc = await vscode.workspace.openTextDocument(result.filePath);
            const content = doc.getText();
            
            // Extract function names and relevant code snippets
            const functionNames = extractFunctionNames(content, doc.languageId);
            const codeSnippet = extractRelevantCodeSnippet(content, query, doc.languageId);
            const lineNumber = findRelevantLineNumber(content, query);
            
            return {
              ...result,
              functionName: functionNames[0] || result.fileName.replace(/\.[^/.]+$/, ''),
              functionNames: functionNames,
              codeSnippet: codeSnippet || content.substring(0, 200) + '...',
              lineNumber: lineNumber,
              fullContent: content.substring(0, 1000) // For AI analysis
            };
          } catch (err) {
            console.warn(`Could not read file: ${result.filePath}`, err);
            return {
              ...result,
              functionName: result.fileName.replace(/\.[^/.]+$/, ''),
              functionNames: [],
              codeSnippet: '// Could not read file content',
              lineNumber: 1
            };
          }
        })
      );

      // Prepare content for AI analysis
      const filesForAnalysis = resultsWithContent.map((result, index) => 
        `File ${index + 1}: ${result.fileName}
Path: ${result.filePath}
Language: ${result.language}
Functions: ${result.functionNames.join(', ')}
Relevant Code:
\`\`\`${result.language}
${result.codeSnippet}
\`\`\``
      ).join('\n\n');

      // Use AI to analyze and rank the results semantically
      const prompt = `The user is searching for: "${query}"
      
Here are the file search results with code snippets. Please analyze which files are most relevant to the query and provide a semantic ranking:

${filesForAnalysis}

Please provide:
1. Which files are most relevant to the query and why (be specific about the code content)
2. Key functions, classes, or code sections that match the intent
3. Confidence scores for each file (0.1 to 1.0)
4. Any additional insights about how the code relates to the query

For each file, explain specifically what makes it relevant based on the actual code content.

Semantic Analysis:`;

      const aiResponse = await callAI(prompt);
      
      // Parse AI response to extract confidence scores
      const confidenceScores = parseConfidenceScores(aiResponse, resultsWithContent);
      
      // Format results for the UI
      const formattedResults = {
        type: 'semanticSearchResults',
        title: 'AI Semantic Search',
        summary: `AI analyzed ${resultsWithContent.length} files for: "${query}"`,
        results: resultsWithContent.map((result, index) => ({
          fileName: result.fileName,
          filePath: result.filePath,
          language: result.language,
          lineCount: result.lineCount || 0,
          confidence: confidenceScores[index] || (0.8 - (index * 0.05)), // Fallback scoring
          codeSnippet: result.codeSnippet,
          functionName: result.functionName,
          functionNames: result.functionNames,
          lineNumber: result.lineNumber
        })),
        analysis: aiResponse
      };
      
      postToSidebar('Semantic Search Results', formattedResults, 'semanticSearch');
    });
  } catch (err: any) {
    postToSidebar('Semantic Search Error', 'Failed to perform semantic search: ' + String(err), 'semanticSearch');
    console.error(err);
  }
}

// Helper function to extract function names from code
function extractFunctionNames(content: string, language: string): string[] {
  const functionNames: string[] = [];
  
  try {
    // JavaScript/TypeScript function patterns
    if (['javascript', 'typescript'].includes(language)) {
      const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)|class\s+(\w+))/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3];
        if (name && !functionNames.includes(name)) {
          functionNames.push(name);
        }
      }
    }
    
    // Python function patterns
    if (language === 'python') {
      const functionRegex = /def\s+(\w+)\s*\(/g;
      const classRegex = /class\s+(\w+)\s*\(?/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        if (match[1] && !functionNames.includes(match[1])) {
          functionNames.push(match[1]);
        }
      }
      while ((match = classRegex.exec(content)) !== null) {
        if (match[1] && !functionNames.includes(match[1])) {
          functionNames.push(match[1]);
        }
      }
    }
    
    // Java function patterns
    if (language === 'java') {
      const methodRegex = /(?:public|private|protected)\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*(?:\{|\w+)/g;
      const classRegex = /class\s+(\w+)/g;
      let match;
      while ((match = methodRegex.exec(content)) !== null) {
        if (match[1] && !functionNames.includes(match[1])) {
          functionNames.push(match[1]);
        }
      }
      while ((match = classRegex.exec(content)) !== null) {
        if (match[1] && !functionNames.includes(match[1])) {
          functionNames.push(match[1]);
        }
      }
    }
  } catch (err) {
    console.warn('Error extracting function names:', err);
  }
  
  return functionNames.slice(0, 5); // Limit to 5 function names
}

// Helper function to extract relevant code snippets based on query
function extractRelevantCodeSnippet(content: string, query: string, language: string): string {
  try {
    const lines = content.split('\n');
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    // Find lines that contain query terms
    const relevantLines: number[] = [];
    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
        relevantLines.push(index);
      }
    });
    
    if (relevantLines.length > 0) {
      // Get context around the first relevant line
      const firstLine = Math.max(0, relevantLines[0] - 3);
      const lastLine = Math.min(lines.length - 1, relevantLines[0] + 8);
      return lines.slice(firstLine, lastLine + 1).join('\n');
    }
    
    // Fallback: return beginning of file if no specific matches
    return lines.slice(0, 15).join('\n');
  } catch (err) {
    console.warn('Error extracting code snippet:', err);
    return content.substring(0, 200) + '...';
  }
}

// Helper function to find relevant line numbers
function findRelevantLineNumber(content: string, query: string): number {
  try {
    const lines = content.split('\n');
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      if (queryTerms.some(term => term.length > 3 && lowerLine.includes(term))) {
        return i + 1; // Convert to 1-based line numbers
      }
    }
    
    return 1; // Default to first line
  } catch (err) {
    return 1;
  }
}

// Helper function to parse confidence scores from AI response
function parseConfidenceScores(aiResponse: string, results: any[]): number[] {
  const scores: number[] = new Array(results.length).fill(0.7); // Default scores
  
  try {
    // Look for confidence patterns in AI response
    results.forEach((result, index) => {
      const fileName = result.fileName;
      const regex = new RegExp(`${fileName}.*?(\\d?\\.?\\d+)(?:/\\d+\\.\\d)?\\s*[Cc]onfidence`, 'i');
      const match = aiResponse.match(regex);
      
      if (match && match[1]) {
        scores[index] = Math.min(1.0, Math.max(0.1, parseFloat(match[1])));
      } else {
        // Simple relevance scoring based on position and content matches
        scores[index] = 0.8 - (index * 0.05);
      }
    });
  } catch (err) {
    console.warn('Error parsing confidence scores:', err);
  }
  
  return scores;
}

/** Legacy commands for compatibility */
export async function handleAskAICommand(payload?: { code?: string }): Promise<void> {
  await handleExplainCodeCommand(payload);
}

export async function handleSmartExplainCommand(payload?: { code?: string; useContext?: boolean }) {
  await handleExplainCodeCommand(payload);
}

export async function handleDeepAnalysisCommand(payload?: { code?: string }) {
  await handleFindBugsCommand(payload);
}

export async function handlePatternAnalysisCommand(payload?: { pattern?: string }) {
  // Implement pattern analysis or redirect to chat
  postToSidebar('Pattern Analysis', 'Pattern analysis is now integrated into the main chat. Try asking about specific patterns in your code.', 'patternAnalysis');
}

export async function handleAnalyzeSearchResultsCommand(payload?: { query?: string }) {
  postToSidebar('Search Analysis', 'Search analysis is now integrated into the main chat. Try asking questions about your codebase.', 'analyzeSearchResults');
}

export async function handleSearchProjectCommand(payload?: { query?: string }) {
  try {
    const q = payload?.query || '';
    const results = searchIndex(q, 20);
    
    if (results.length === 0) {
      postToSidebar('Search Results', `No files found matching "${q}"`, 'searchProject');
      return;
    }

    // Format results for interactive UI display
    const formattedResults = {
      type: 'fileList',
      title: 'Search Results',
      summary: `Found ${results.length} files matching "${q}"`,
      files: results.map((r: any) => ({
        fileName: r.fileName,
        filePath: r.filePath,
        language: r.language,
        lineCount: r.lineCount || 0
      }))
    };
    
    postToSidebar('Search Results', formattedResults, 'searchProject');
  } catch (err: any) {
    postToSidebar('Search Error', 'Search failed: ' + String(err), 'searchProject');
  }
}

export async function handleBuildSearchIndexCommand() {
  try {
    const results = await buildSearchIndex();
    postToSidebar('Index Built', `Successfully indexed ${results.length} files`, 'buildSearchIndex');
  } catch (err: any) {
    postToSidebar('Index Error', 'Failed to build index: ' + String(err), 'buildSearchIndex');
  }
}

export async function handleSearchStatsCommand() {
  try {
    const stats = getSearchStats();
    postToSidebar('Search Statistics', stats, 'searchStats');
  } catch (err: any) {
    postToSidebar('Stats Error', 'Failed to get statistics: ' + String(err), 'searchStats');
  }
}

export async function handleSearchByLanguageCommand(payload?: { language?: string }) {
  try {
    const lang = payload?.language;
    if (!lang) {
      postToSidebar('Language Search', 'Please specify a language to search for.', 'searchByLanguage');
      return;
    }
    const results = searchByLanguage(lang);
    
    if (results.length === 0) {
      postToSidebar(`Files in ${lang}`, `No ${lang} files found in the project.`, 'searchByLanguage');
      return;
    }

    // Format results for interactive UI display
    const formattedResults = {
      type: 'fileList',
      title: `Files in ${lang}`,
      summary: `Found ${results.length} files in ${lang}`,
      files: results.map((r: any) => ({
        fileName: r.fileName,
        filePath: r.filePath,
        language: r.language,
        lineCount: r.lineCount || 0
      }))
    };
    
    postToSidebar(`Files in ${lang}`, formattedResults, 'searchByLanguage');
  } catch (err: any) {
    postToSidebar('Language Search Error', 'Search failed: ' + String(err), 'searchByLanguage');
  }
}

export async function handleClearSearchIndexCommand() {
  try {
    clearSearchIndex();
    postToSidebar('Index Cleared', 'Search index has been cleared', 'clearSearchIndex');
  } catch (err: any) {
    postToSidebar('Clear Error', 'Failed to clear index: ' + String(err), 'clearSearchIndex');
  }
}

export async function handleQuickFileSearchCommand() {
  try {
    const recent = searchIndex('', 15);
    if (recent.length === 0) {
      postToSidebar('Quick Search', 'No files indexed. Build index first.', 'quickFileSearch');
      return;
    }
    const items = recent.map((f: any) => ({
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
    }
  } catch (err: any) {
    postToSidebar('Quick Search Error', 'Quick search failed: ' + String(err), 'quickFileSearch');
  }
}

// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  console.log('Activating VS Code AI Extension...');

  // Initialize search
  try {
    initializeSearch(context);
  } catch (e) {
    console.warn('initializeSearch error', e);
  }

  // Register sidebar
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

  // Register commands
  const regs: vscode.Disposable[] = [
    // New revamped commands
    vscode.commands.registerCommand('vs-code-ai-extension.chat', handleChatCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.explainCode', handleExplainCodeCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.findBugs', handleFindBugsCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.suggestImprovements', handleSuggestImprovementsCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.codeUnderstandingSearch', handleCodeUnderstandingSearchCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.semanticSearch', handleSemanticSearchCommand),
    
    // New project-wide commands
    vscode.commands.registerCommand('vs-code-ai-extension.analyzeProject', handleAnalyzeEntireProjectCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.findBugsInProject', handleFindBugsInProjectCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.generateProjectSummary', handleGenerateProjectSummaryCommand),

    // Legacy commands for compatibility
    vscode.commands.registerCommand('vs-code-ai-extension.askAI', handleAskAICommand),
    vscode.commands.registerCommand('vs-code-ai-extension.summarizeFile', handleSummarizeFileCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.smartExplain', handleSmartExplainCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.deepAnalysis', handleDeepAnalysisCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.patternAnalysis', handlePatternAnalysisCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.analyzeSearchResults', handleAnalyzeSearchResultsCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.searchProject', handleSearchProjectCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.buildSearchIndex', handleBuildSearchIndexCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.searchStats', handleSearchStatsCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.searchByLanguage', handleSearchByLanguageCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.clearSearchIndex', handleClearSearchIndexCommand),
    vscode.commands.registerCommand('vs-code-ai-extension.quickFileSearch', handleQuickFileSearchCommand),

    vscode.commands.registerCommand('vs-code-ai-extension.showSidebar', async () => {
      try {
        await vscode.commands.executeCommand('workbench.view.extension.vsCodeAI');
      } catch {
            // Ignore disposal errors
      }
      setTimeout(() => sidebarProvider?.refresh(), 400);
    }),
  ];

  regs.forEach((r) => context.subscriptions.push(r));

  // Build index shortly after activation
  setTimeout(() => {
    buildSearchIndex()
      .then((res) => {
        if (res && res.length > 0) {
          postToSidebar('Ready', `AI Assistant is ready! Indexed ${res.length} files. Ask me anything about your code!`, 'ready');
        }
      })
      .catch(() => {});
  }, 2000);

  // Auto update index on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.includes('node_modules')) return;
      setTimeout(() => {
        buildSearchIndex().catch(() => {});
      }, 1000);
    })
  );

  console.log('VS Code AI Extension activated.');
}

export function deactivate() {
  console.log('VS Code AI Extension deactivated.');
}