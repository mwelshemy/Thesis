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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIManager = void 0;
const vscode = __importStar(require("vscode"));
class UIManager {
    constructor() {
        this._aiOutputChannel =
            vscode.window.createOutputChannel('VS AI - Analysis');
        this._searchOutputChannel =
            vscode.window.createOutputChannel('VS AI - Search');
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._statusBarItem.text = '$(sparkle) VS AI';
        this._statusBarItem.tooltip = 'VS Code AI Extension';
        this._statusBarItem.show();
    }
    static getInstance() {
        if (!UIManager.instance) {
            UIManager.instance = new UIManager();
        }
        return UIManager.instance;
    }
    showAIAnalysis(title, content, metadata) {
        this._aiOutputChannel.clear();
        this._aiOutputChannel.appendLine(`🤖 ${title.toUpperCase()}`);
        this._aiOutputChannel.appendLine('='.repeat(60));
        if (metadata) {
            if (metadata.workflowTime) {
                this._aiOutputChannel.appendLine(`⏱️  Analysis completed in ${metadata.workflowTime}ms`);
            }
            if (metadata.contextUsed && metadata.contextUsed.length > 0) {
                this._aiOutputChannel.appendLine(`📁 Used context from ${metadata.contextUsed.length} files`);
            }
            if (metadata.searchResultsCount) {
                this._aiOutputChannel.appendLine(`📊 Analyzed ${metadata.searchResultsCount} related files`);
            }
            this._aiOutputChannel.appendLine('');
        }
        this._aiOutputChannel.appendLine(content);
        this._aiOutputChannel.appendLine('='.repeat(60));
        this._aiOutputChannel.show();
    }
    showSearchResults(query, results, stats) {
        this._searchOutputChannel.clear();
        this._searchOutputChannel.appendLine(`🔍 SEARCH RESULTS: "${query}"`);
        this._searchOutputChannel.appendLine('='.repeat(60));
        if (stats) {
            this._searchOutputChannel.appendLine(`📊 ${stats.fileCount} files indexed • ${stats.totalLines} total lines`);
            if (stats.lastIndexBuild) {
                this._searchOutputChannel.appendLine(`🕒 Last index build: ${stats.lastIndexBuild.toLocaleString()}`);
            }
            this._searchOutputChannel.appendLine('');
        }
        if (results.length === 0) {
            this._searchOutputChannel.appendLine('No files found matching your search.');
            this._searchOutputChannel.appendLine('Try building the search index first or using different terms.');
        }
        else {
            this._searchOutputChannel.appendLine(`Found ${results.length} files:\n`);
            results.forEach((file, index) => {
                this._searchOutputChannel.appendLine(`${index + 1}. ${file.fileName}`);
                this._searchOutputChannel.appendLine(`   📍 Path: ${file.filePath}`);
                this._searchOutputChannel.appendLine(`   🔤 Language: ${file.language}`);
                this._searchOutputChannel.appendLine(`   📏 Lines: ${file.lineCount}`);
                const preview = file.content
                    .substring(0, 150)
                    .replace(/\n/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (preview.length > 0) {
                    this._searchOutputChannel.appendLine(`   👁️  Preview: ${preview}${file.content.length > 150 ? '...' : ''}`);
                }
                this._searchOutputChannel.appendLine('');
            });
        }
        this._searchOutputChannel.appendLine('='.repeat(60));
        this._searchOutputChannel.show();
    }
    showLanguageFiles(language, results) {
        this._searchOutputChannel.clear();
        this._searchOutputChannel.appendLine(`🔍 ${language.toUpperCase()} FILES`);
        this._searchOutputChannel.appendLine('='.repeat(60));
        if (results.length === 0) {
            this._searchOutputChannel.appendLine(`No ${language} files found.`);
            this._searchOutputChannel.appendLine('Try building the search index first.');
        }
        else {
            this._searchOutputChannel.appendLine(`Found ${results.length} ${language} files:\n`);
            results.forEach((file, index) => {
                this._searchOutputChannel.appendLine(`${index + 1}. ${file.fileName}`);
                this._searchOutputChannel.appendLine(`   📍 Path: ${file.filePath}`);
                this._searchOutputChannel.appendLine(`   📏 Lines: ${file.lineCount}`);
                this._searchOutputChannel.appendLine(`   🕒 Modified: ${file.lastModified.toLocaleString()}`);
                this._searchOutputChannel.appendLine('');
            });
        }
        this._searchOutputChannel.appendLine('='.repeat(60));
        this._searchOutputChannel.show();
    }
    showSearchStats(stats) {
        this._searchOutputChannel.clear();
        this._searchOutputChannel.appendLine('📊 SEARCH STATISTICS');
        this._searchOutputChannel.appendLine('='.repeat(60));
        this._searchOutputChannel.appendLine(`📁 Files indexed: ${stats.fileCount}`);
        this._searchOutputChannel.appendLine(`📏 Total lines: ${stats.totalLines}`);
        this._searchOutputChannel.appendLine(`🔄 Indexing status: ${stats.isIndexing ? '🟡 In progress' : '🟢 Complete'}`);
        this._searchOutputChannel.appendLine(`💾 Index size: ${stats.totalIndexSize}`);
        if (stats.lastIndexBuild) {
            this._searchOutputChannel.appendLine(`🕒 Last build: ${stats.lastIndexBuild.toLocaleString()}`);
        }
        this._searchOutputChannel.appendLine('='.repeat(60));
        this._searchOutputChannel.show();
    }
    async showProgress(title, task) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false,
        }, async (progress) => {
            const result = await task((message) => {
                progress.report({ message });
            });
            return result;
        });
    }
    async showFileQuickPick(files, placeholder = 'Select a file...') {
        const items = files.map((file) => ({
            label: file.fileName,
            description: file.filePath,
            detail: `${file.language} • ${file.lineCount} lines`,
            file: file,
        }));
        return await vscode.window.showQuickPick(items, {
            placeHolder: placeholder,
        });
    }
    showInfoMessage(message, ...items) {
        return vscode.window.showInformationMessage(`$(sparkle) ${message}`, ...items);
    }
    showWarningMessage(message, ...items) {
        return vscode.window.showWarningMessage(`$(warning) ${message}`, ...items);
    }
    showErrorMessage(message, ...items) {
        return vscode.window.showErrorMessage(`$(error) ${message}`, ...items);
    }
    clearAll() {
        this._aiOutputChannel.clear();
        this._searchOutputChannel.clear();
    }
    dispose() {
        this._aiOutputChannel.dispose();
        this._searchOutputChannel.dispose();
        this._statusBarItem.dispose();
    }
}
exports.UIManager = UIManager;
//# sourceMappingURL=ui-manager.js.map