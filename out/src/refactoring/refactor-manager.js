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
exports.RefactorManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class RefactorManager {
    constructor(context) {
        this.context = context;
        this._modifiedFiles = new Map();
        this._isInitialized = false;
        this._onDidChangeFiles = new vscode.EventEmitter();
        this.onDidChangeFiles = this._onDidChangeFiles.event;
        this.storageKey = 'vsCodeAI.modifiedFiles';
        console.log('RefactorManager: initializing and loading persisted state...');
        this.loadFromState();
        this._isInitialized = true;
    }
    static getInstance(context) {
        if (!RefactorManager.instance) {
            RefactorManager.instance = new RefactorManager(context);
        }
        return RefactorManager.instance;
    }
    isInitialized() {
        return this._isInitialized;
    }
    static isInitialized() {
        return (!!RefactorManager.instance && RefactorManager.instance._isInitialized);
    }
    persistState() {
        try {
            const arr = Array.from(this._modifiedFiles.entries());
            void this.context.workspaceState.update(this.storageKey, arr);
        }
        catch (err) {
            console.error('RefactorManager: failed to persist state', err);
        }
    }
    loadFromState() {
        try {
            const raw = this.context.workspaceState.get(this.storageKey, []);
            if (raw && Array.isArray(raw)) {
                this._modifiedFiles = new Map(raw);
                console.log(`RefactorManager: loaded ${this._modifiedFiles.size} persisted modified files`);
            }
        }
        catch (err) {
            console.error('RefactorManager: failed to load persisted state', err);
            this._modifiedFiles = new Map();
        }
    }
    emitChange() {
        try {
            this._onDidChangeFiles.fire();
            this.persistState();
        }
        catch (err) {
            console.error('RefactorManager: emitChange error', err);
        }
    }
    async addRefactoredFile(filePath, newContent) {
        const entry = {
            content: newContent,
            timestamp: Date.now(),
        };
        this._modifiedFiles.set(filePath, entry);
        console.log('[REFMAN] addRefactoredFile:', filePath, 'len=', newContent?.length);
        this.emitChange();
    }
    removeModifiedFile(filePath) {
        if (this._modifiedFiles.has(filePath)) {
            this._modifiedFiles.delete(filePath);
            console.log(`RefactorManager: removed modified file ${path.basename(filePath)}`);
            this.emitChange();
        }
    }
    clearAllChanges() {
        if (this._modifiedFiles.size === 0)
            return;
        this._modifiedFiles.clear();
        console.log('RefactorManager: cleared all modified files');
        this.emitChange();
    }
    getModifiedFiles() {
        return Array.from(this._modifiedFiles.entries()).map(([filePath, entry]) => ({
            path: filePath,
            name: path.basename(filePath),
            content: entry.content,
            timestamp: entry.timestamp,
        }));
    }
    getFileContent(filePath) {
        return this._modifiedFiles.get(filePath)?.content;
    }
    getFileCount() {
        return this._modifiedFiles.size;
    }
    async applyChanges(filePath) {
        try {
            const stored = this._modifiedFiles.get(filePath);
            if (!stored) {
                vscode.window.showWarningMessage(`No pending changes for ${path.basename(filePath)}`);
                return false;
            }
            // Open the original document
            const document = await vscode.workspace.openTextDocument(filePath);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            edit.replace(document.uri, fullRange, stored.content);
            const applied = await vscode.workspace.applyEdit(edit);
            if (!applied) {
                vscode.window.showErrorMessage(`Failed to apply changes to ${path.basename(filePath)}`);
                return false;
            }
            await document.save();
            // Remove from pending list
            this._modifiedFiles.delete(filePath);
            this.emitChange();
            vscode.window.showInformationMessage(`Applied changes to ${path.basename(filePath)}`);
            return true;
        }
        catch (err) {
            console.error('RefactorManager.applyChanges error', err);
            vscode.window.showErrorMessage(`Error applying changes: ${err}`);
            return false;
        }
    }
    async discardChanges(filePath) {
        if (!this._modifiedFiles.has(filePath)) {
            vscode.window.showWarningMessage(`No pending changes for ${path.basename(filePath)}`);
            return;
        }
        this._modifiedFiles.delete(filePath);
        this.emitChange();
        vscode.window.showInformationMessage(`Discarded changes for ${path.basename(filePath)}`);
    }
    async applyAllChanges(progressCallback) {
        const files = this.getModifiedFiles();
        let applied = 0;
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            progressCallback?.({
                current: i + 1,
                total: files.length,
                file: file.name,
            });
            const ok = await this.applyChanges(file.path);
            if (ok)
                applied++;
            else
                failed++;
        }
        return { applied, failed };
    }
    dispose() {
        console.log('RefactorManager: disposing');
        this._modifiedFiles.clear();
        this._isInitialized = false;
        this._onDidChangeFiles.dispose();
    }
    // Debug helper
    getDebugInfo() {
        return {
            isInitialized: this._isInitialized,
            modifiedFilesCount: this._modifiedFiles.size,
            modifiedFiles: Array.from(this._modifiedFiles.keys()),
        };
    }
}
exports.RefactorManager = RefactorManager;
//# sourceMappingURL=refactor-manager.js.map