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
exports.initializeSearch = initializeSearch;
exports.buildSearchIndex = buildSearchIndex;
exports.searchIndex = searchIndex;
exports.getSearchStats = getSearchStats;
exports.clearSearchIndex = clearSearchIndex;
exports.getFileByPath = getFileByPath;
exports.searchByLanguage = searchByLanguage;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
let searchIndexData = [];
let isIndexing = false;
let searchOutputChannel;
function initializeSearch(context) {
    console.log('🔍 Initializing search functionality...');
    searchOutputChannel = vscode.window.createOutputChannel('VS Search');
    context.subscriptions.push(searchOutputChannel);
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,py,java,cs,cpp,md,json,html,css}');
    watcher.onDidCreate((uri) => {
        searchOutputChannel.appendLine(`📁 File created: ${uri.fsPath}`);
        buildSearchIndex();
    });
    watcher.onDidChange((uri) => {
        searchOutputChannel.appendLine(`📁 File changed: ${uri.fsPath}`);
        buildSearchIndex();
    });
    watcher.onDidDelete((uri) => {
        searchOutputChannel.appendLine(`📁 File deleted: ${uri.fsPath}`);
        buildSearchIndex();
    });
    context.subscriptions.push(watcher);
    searchOutputChannel.appendLine('✅ Search functionality initialized');
    return searchOutputChannel;
}
async function buildSearchIndex() {
    if (isIndexing) {
        searchOutputChannel.appendLine('⚠️ Indexing already in progress...');
        return searchIndexData;
    }
    isIndexing = true;
    const startTime = Date.now();
    try {
        searchOutputChannel.appendLine('📁 Building search index...');
        searchOutputChannel.appendLine('⏱️ Scanning workspace for files...');
        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,cs,cpp,md,json,html,css}', '**/node_modules/**');
        searchOutputChannel.appendLine(`📊 Found ${files.length} files to index`);
        searchIndexData = [];
        let processedFiles = 0;
        let skippedFiles = 0;
        for (const file of files.slice(0, 1000)) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const content = document.getText();
                if (content.length > 100000) {
                    skippedFiles++;
                    continue;
                }
                const entry = {
                    filePath: file.fsPath,
                    fileName: path.basename(file.fsPath),
                    language: document.languageId,
                    content: content.substring(0, 5000),
                    lineCount: document.lineCount,
                    lastModified: new Date(),
                };
                searchIndexData.push(entry);
                processedFiles++;
                if (processedFiles % 50 === 0) {
                    searchOutputChannel.appendLine(`📁 Processed ${processedFiles} files...`);
                }
            }
            catch (error) {
                skippedFiles++;
                continue;
            }
        }
        const endTime = Date.now();
        const duration = endTime - startTime;
        searchOutputChannel.appendLine(`✅ Search index built in ${duration}ms`);
        searchOutputChannel.appendLine(`📊 Statistics: ${processedFiles} files indexed, ${skippedFiles} files skipped`);
        searchOutputChannel.appendLine(`💾 Total index size: ${calculateIndexSize(searchIndexData)}`);
        isIndexing = false;
        return searchIndexData;
    }
    catch (error) {
        searchOutputChannel.appendLine(`❌ Error building index: ${error.message}`);
        isIndexing = false;
        return searchIndexData;
    }
}
function searchIndex(query, maxResults = 10) {
    if (!query.trim()) {
        return searchIndexData
            .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
            .slice(0, maxResults);
    }
    const startTime = Date.now();
    const scoredResults = searchIndexData
        .map((file) => {
        let score = 0;
        const queryLower = query.toLowerCase();
        const fileNameLower = file.fileName.toLowerCase();
        const contentLower = file.content.toLowerCase();
        const filePathLower = file.filePath.toLowerCase();
        if (fileNameLower.includes(queryLower))
            score += 3;
        if (filePathLower.includes(queryLower))
            score += 2;
        if (contentLower.includes(queryLower))
            score += 1;
        if (fileNameLower === queryLower)
            score += 2;
        if (file.fileName === query)
            score += 3;
        return { file, score };
    })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.file)
        .slice(0, maxResults);
    const endTime = Date.now();
    const duration = endTime - startTime;
    searchOutputChannel.appendLine(`🔍 Search for "${query}": ${scoredResults.length} results in ${duration}ms`);
    return scoredResults;
}
function getSearchStats() {
    return {
        fileCount: searchIndexData.length,
        totalLines: searchIndexData.reduce((sum, file) => sum + file.lineCount, 0),
        isIndexing: isIndexing,
        totalIndexSize: calculateIndexSize(searchIndexData),
        lastIndexBuild: searchIndexData.length > 0 ? new Date() : null,
    };
}
function clearSearchIndex() {
    searchIndexData = [];
    searchOutputChannel.appendLine('🗑️ Search index cleared');
}
function calculateIndexSize(index) {
    const totalBytes = index.reduce((sum, file) => sum + file.content.length + file.filePath.length + file.fileName.length, 0);
    return `${Math.round(totalBytes / 1024)} KB`;
}
function getFileByPath(filePath) {
    return searchIndexData.find((file) => file.filePath === filePath);
}
function searchByLanguage(language) {
    return searchIndexData.filter((file) => file.language === language);
}
//# sourceMappingURL=search.js.map