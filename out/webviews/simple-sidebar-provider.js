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
exports.SimpleSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class SimpleSidebarProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.items = [];
        console.log('SimpleSidebarProvider initialized');
        this.items.push(this.createWelcomeItem());
    }
    createWelcomeItem() {
        const item = new vscode.TreeItem('No modified files yet', vscode.TreeItemCollapsibleState.None);
        item.tooltip = 'Use "VS AI: Refactor Code" to see files here';
        item.iconPath = new vscode.ThemeIcon('lightbulb');
        item.contextValue = 'welcome';
        item.command = {
            command: 'vs-code-ai-extension.aiRefactor',
            title: 'Start Refactoring',
            arguments: [],
        };
        return item;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.items);
    }
    getItems() {
        return this.items;
    }
    addFile(filePath, _content) {
        console.log(`Adding file to sidebar: ${filePath}`);
        this.items = this.items.filter((item) => item.label !== 'No modified files yet');
        const fileItem = new vscode.TreeItem(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
        fileItem.tooltip = `Refactored: ${filePath}\nClick to open file`;
        fileItem.description = path.dirname(filePath);
        fileItem.iconPath = new vscode.ThemeIcon('file-code');
        fileItem.contextValue = 'modifiedFile';
        fileItem.command = {
            command: 'vs-code-ai-extension.openFile',
            title: 'Open File',
            arguments: [filePath],
        };
        this.items.push(fileItem);
        this.refresh();
    }
    clearFiles() {
        this.items = [this.createWelcomeItem()];
        this.refresh();
    }
}
exports.SimpleSidebarProvider = SimpleSidebarProvider;
//# sourceMappingURL=simple-sidebar-provider.js.map