import * as vscode from 'vscode';
import * as path from 'path';

export interface FileIndexEntry {
  filePath: string;
  fileName: string;
  language: string;
  content: string;
  lineCount: number;
  lastModified: Date;
}

// In-memory search index
let searchIndexData: FileIndexEntry[] = [];
let isIndexing = false;
let searchOutputChannel: vscode.OutputChannel;

/**
 * Initialize search functionality with output channel and file watchers
 */
export function initializeSearch(
  context: vscode.ExtensionContext
): vscode.OutputChannel {
  console.log('🔍 Initializing search functionality...');

  searchOutputChannel = vscode.window.createOutputChannel('VS Search');
  context.subscriptions.push(searchOutputChannel);

  // Auto-index on workspace changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{ts,js,py,java,cs,cpp,md,json,html,css}'
  );

  watcher.onDidCreate((uri) => {
    searchOutputChannel.appendLine(`📁 File created: ${uri.fsPath}`);
    buildSearchIndex(); // Rebuild index on file creation
  });

  watcher.onDidChange((uri) => {
    searchOutputChannel.appendLine(`📁 File changed: ${uri.fsPath}`);
    buildSearchIndex(); // Rebuild index on file changes
  });

  watcher.onDidDelete((uri) => {
    searchOutputChannel.appendLine(`📁 File deleted: ${uri.fsPath}`);
    buildSearchIndex(); // Rebuild index on file deletion
  });

  context.subscriptions.push(watcher);

  searchOutputChannel.appendLine('✅ Search functionality initialized');
  return searchOutputChannel;
}

/**
 * Build search index by scanning workspace files
 */
export async function buildSearchIndex(): Promise<FileIndexEntry[]> {
  if (isIndexing) {
    searchOutputChannel.appendLine('⚠️ Indexing already in progress...');
    return searchIndexData;
  }

  isIndexing = true;
  const startTime = Date.now();

  try {
    searchOutputChannel.appendLine('📁 Building search index...');
    searchOutputChannel.appendLine('⏱️ Scanning workspace for files...');

    // Find all supported files in workspace
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,js,py,java,cs,cpp,md,json,html,css}',
      '**/node_modules/**' // Exclude node_modules
    );

    searchOutputChannel.appendLine(`📊 Found ${files.length} files to index`);

    searchIndexData = [];
    let processedFiles = 0;
    let skippedFiles = 0;

    // Process files in batches for better performance
    for (const file of files.slice(0, 1000)) {
      // Limit for performance
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = document.getText();

        // Skip very large files to prevent memory issues
        if (content.length > 100000) {
          skippedFiles++;
          continue;
        }

        const entry: FileIndexEntry = {
          filePath: file.fsPath,
          fileName: path.basename(file.fsPath),
          language: document.languageId,
          content: content.substring(0, 5000), // Limit content size for performance
          lineCount: document.lineCount,
          lastModified: new Date(),
        };

        searchIndexData.push(entry);
        processedFiles++;

        // Log progress every 50 files
        if (processedFiles % 50 === 0) {
          searchOutputChannel.appendLine(
            `📁 Processed ${processedFiles} files...`
          );
        }
      } catch (error) {
        // Skip files that can't be read (binary files, etc.)
        skippedFiles++;
        continue;
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    searchOutputChannel.appendLine(`✅ Search index built in ${duration}ms`);
    searchOutputChannel.appendLine(
      `📊 Statistics: ${processedFiles} files indexed, ${skippedFiles} files skipped`
    );
    searchOutputChannel.appendLine(
      `💾 Total index size: ${calculateIndexSize(searchIndexData)}`
    );

    isIndexing = false;
    return searchIndexData;
  } catch (error: any) {
    searchOutputChannel.appendLine(`❌ Error building index: ${error.message}`);
    isIndexing = false;
    return searchIndexData;
  }
}

/**
 * Search the index for files matching the query
 */
export function searchIndex(
  query: string,
  maxResults: number = 10
): FileIndexEntry[] {
  if (!query.trim()) {
    // Return some recent files if no query (for browsing)
    return searchIndexData
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .slice(0, maxResults);
  }

  const startTime = Date.now();

  // Score files based on relevance
  const scoredResults = searchIndexData
    .map((file) => {
      let score = 0;
      const queryLower = query.toLowerCase();
      const fileNameLower = file.fileName.toLowerCase();
      const contentLower = file.content.toLowerCase();
      const filePathLower = file.filePath.toLowerCase();

      // Score based on different criteria
      if (fileNameLower.includes(queryLower)) score += 3; // File name match (highest priority)
      if (filePathLower.includes(queryLower)) score += 2; // Path match
      if (contentLower.includes(queryLower)) score += 1; // Content match

      // Exact matches get bonus points
      if (fileNameLower === queryLower) score += 2;
      if (file.fileName === query) score += 3;

      return { file, score };
    })
    .filter((item) => item.score > 0) // Only include files with matches
    .sort((a, b) => b.score - a.score) // Sort by relevance
    .map((item) => item.file)
    .slice(0, maxResults);

  const endTime = Date.now();
  const duration = endTime - startTime;

  searchOutputChannel.appendLine(
    `🔍 Search for "${query}": ${scoredResults.length} results in ${duration}ms`
  );

  return scoredResults;
}

/**
 * Get search statistics
 */
export function getSearchStats() {
  return {
    fileCount: searchIndexData.length,
    totalLines: searchIndexData.reduce((sum, file) => sum + file.lineCount, 0),
    isIndexing: isIndexing,
    totalIndexSize: calculateIndexSize(searchIndexData),
    lastIndexBuild: searchIndexData.length > 0 ? new Date() : null,
  };
}

/**
 * Clear the search index
 */
export function clearSearchIndex(): void {
  searchIndexData = [];
  searchOutputChannel.appendLine('🗑️ Search index cleared');
}

/**
 * Calculate approximate index size in KB
 */
function calculateIndexSize(index: FileIndexEntry[]): string {
  const totalBytes = index.reduce(
    (sum, file) =>
      sum + file.content.length + file.filePath.length + file.fileName.length,
    0
  );
  return `${Math.round(totalBytes / 1024)} KB`;
}

/**
 * Get file by path from index
 */
export function getFileByPath(filePath: string): FileIndexEntry | undefined {
  return searchIndexData.find((file) => file.filePath === filePath);
}

/**
 * Search by file type/language
 */
export function searchByLanguage(language: string): FileIndexEntry[] {
  return searchIndexData.filter((file) => file.language === language);
}
