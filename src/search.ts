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

// In-memory search index - renamed to avoid conflict
let fileIndex: FileIndexEntry[] = [];
let isIndexing = false;

// Output channel for search logs
let searchOutputChannel: vscode.OutputChannel;

/**
 * Initialize search functionality
 */
export function initializeSearch(context: vscode.ExtensionContext): vscode.OutputChannel {
    searchOutputChannel = vscode.window.createOutputChannel('VS Search');
    context.subscriptions.push(searchOutputChannel);
    
    // Auto-reindex on file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,py,java,cs,cpp,md,json,html,css}');
    
    watcher.onDidCreate(() => {
        logSearch('File created, reindexing...');
        buildSearchIndex();
    });
    
    watcher.onDidChange(() => {
        logSearch('File changed, reindexing...');
        buildSearchIndex();
    });
    
    watcher.onDidDelete(() => {
        logSearch('File deleted, reindexing...');
        buildSearchIndex();
    });
    
    context.subscriptions.push(watcher);
    
    return searchOutputChannel;
}

/**
 * Build search index from workspace files
 */
export async function buildSearchIndex(): Promise<FileIndexEntry[]> {
    if (isIndexing) {
        logSearch('Indexing already in progress...');
        return fileIndex;
    }

    isIndexing = true;
    
    try {
        logSearch('Building search index...');
        
        // Get all relevant files from workspace
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,js,py,java,cs,cpp,md,json,html,css}',
            '**/node_modules/**'
        );

        logSearch(`Found ${files.length} files to index`);

        const newIndex: FileIndexEntry[] = [];
        let processedFiles = 0;

        // Process files in batches to avoid overwhelming the system
        for (const fileUri of files) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const fileStats = await vscode.workspace.fs.stat(fileUri);
                
                const entry: FileIndexEntry = {
                    filePath: fileUri.fsPath,
                    fileName: path.basename(fileUri.fsPath),
                    language: document.languageId,
                    content: document.getText(),
                    lineCount: document.lineCount,
                    lastModified: new Date(fileStats.mtime)
                };

                newIndex.push(entry);
                processedFiles++;

                // Log progress every 10 files
                if (processedFiles % 10 === 0) {
                    logSearch(`Indexed ${processedFiles}/${files.length} files...`);
                }

            } catch (error) {
                logSearch(`Error indexing file ${fileUri.fsPath}: ${error}`);
            }
        }

        fileIndex = newIndex;
        logSearch(`Search index built successfully! ${fileIndex.length} files indexed.`);
        
        // Show completion message
        vscode.window.showInformationMessage(`Search index updated: ${fileIndex.length} files indexed`);

    } catch (error) {
        logSearch(`Error building search index: ${error}`);
        vscode.window.showErrorMessage('Error building search index');
    } finally {
        isIndexing = false;
    }

    return fileIndex;
}

/**
 * Search through the indexed files
 */
export function searchIndex(query: string, maxResults: number = 10): FileIndexEntry[] {
    if (!query.trim()) {
        return [];
    }

    if (fileIndex.length === 0) {
        logSearch('Search index is empty. Please build index first.');
        return [];
    }

    logSearch(`Searching for: "${query}"`);
    
    const lowerQuery = query.toLowerCase();
    const results: { entry: FileIndexEntry, score: number }[] = [];

    for (const entry of fileIndex) {
        let score = 0;

        // File name matches (higher weight)
        if (entry.fileName.toLowerCase().includes(lowerQuery)) {
            score += 3;
        }

        // File path matches
        if (entry.filePath.toLowerCase().includes(lowerQuery)) {
            score += 2;
        }

        // Content matches (lower weight)
        if (entry.content.toLowerCase().includes(lowerQuery)) {
            score += 1;
            
            // Bonus for multiple matches in content
            const matches = (entry.content.toLowerCase().match(new RegExp(lowerQuery, 'g')) || []).length;
            score += Math.min(matches * 0.1, 1); // Cap bonus at 1
        }

        // Language matches
        if (entry.language.toLowerCase().includes(lowerQuery)) {
            score += 1;
        }

        if (score > 0) {
            results.push({ entry, score });
        }
    }

    // Sort by score (descending) and take top results
    results.sort((a, b) => b.score - a.score);
    
    const finalResults = results.slice(0, maxResults).map(result => result.entry);
    
    logSearch(`Found ${finalResults.length} results for "${query}"`);
    
    return finalResults;
}

/**
 * Get search index statistics
 */
export function getSearchStats(): { fileCount: number, totalLines: number, isIndexing: boolean } {
    const totalLines = fileIndex.reduce((sum: number, entry: FileIndexEntry) => sum + entry.lineCount, 0);
    
    return {
        fileCount: fileIndex.length,
        totalLines,
        isIndexing
    };
}

/**
 * Clear the search index
 */
export function clearSearchIndex(): void {
    fileIndex = [];
    logSearch('Search index cleared');
}

/**
 * Log search-related messages
 */
function logSearch(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    if (searchOutputChannel) {
        searchOutputChannel.appendLine(`[${timestamp}] ${message}`);
    }
    console.log(`[Search] ${message}`);
}