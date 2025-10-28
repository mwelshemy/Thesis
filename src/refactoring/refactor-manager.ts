import * as vscode from 'vscode';
import * as path from 'path';

export interface StoredFileEntry {
  content: string;
  timestamp: number; // ms since epoch
}

export interface ModifiedFileView {
  path: string;
  name: string;
  content?: string;
  timestamp: number;
}

export class RefactorManager {
  private static instance: RefactorManager | undefined;
  private _modifiedFiles: Map<string, StoredFileEntry> = new Map();
  private _isInitialized = false;
  private readonly _onDidChangeFiles = new vscode.EventEmitter<void>();
  public readonly onDidChangeFiles = this._onDidChangeFiles.event;
  private readonly storageKey = 'vsCodeAI.modifiedFiles';

  private constructor(private readonly context: vscode.ExtensionContext) {
    console.log('RefactorManager: initializing and loading persisted state...');
    this.loadFromState();
    this._isInitialized = true;
  }

  public static getInstance(context: vscode.ExtensionContext): RefactorManager {
    if (!RefactorManager.instance) {
      RefactorManager.instance = new RefactorManager(context);
    }
    return RefactorManager.instance;
  }

  public isInitialized(): boolean {
    return this._isInitialized;
  }

  public static isInitialized(): boolean {
    return (
      !!RefactorManager.instance && RefactorManager.instance._isInitialized
    );
  }

  private persistState() {
    try {
      const arr: [string, StoredFileEntry][] = Array.from(
        this._modifiedFiles.entries()
      );
      void this.context.workspaceState.update(this.storageKey, arr);
    } catch (err) {
      console.error('RefactorManager: failed to persist state', err);
    }
  }

  private loadFromState() {
    try {
      const raw = this.context.workspaceState.get<[string, StoredFileEntry][]>(
        this.storageKey,
        []
      );
      if (raw && Array.isArray(raw)) {
        this._modifiedFiles = new Map(raw);
        console.log(
          `RefactorManager: loaded ${this._modifiedFiles.size} persisted modified files`
        );
      }
    } catch (err) {
      console.error('RefactorManager: failed to load persisted state', err);
      this._modifiedFiles = new Map();
    }
  }

  private emitChange() {
    try {
      this._onDidChangeFiles.fire();
      this.persistState();
    } catch (err) {
      console.error('RefactorManager: emitChange error', err);
    }
  }

  public async addRefactoredFile(
    filePath: string,
    newContent: string
  ): Promise<void> {
    const entry: StoredFileEntry = {
      content: newContent,
      timestamp: Date.now(),
    };
    this._modifiedFiles.set(filePath, entry);
    console.log(
      '[REFMAN] addRefactoredFile:',
      filePath,
      'len=',
      newContent?.length
    );
    this.emitChange();
  }

  public removeModifiedFile(filePath: string) {
    if (this._modifiedFiles.has(filePath)) {
      this._modifiedFiles.delete(filePath);
      console.log(
        `RefactorManager: removed modified file ${path.basename(filePath)}`
      );
      this.emitChange();
    }
  }

  public clearAllChanges(): void {
    if (this._modifiedFiles.size === 0) return;
    this._modifiedFiles.clear();
    console.log('RefactorManager: cleared all modified files');
    this.emitChange();
  }

  public getModifiedFiles(): ModifiedFileView[] {
    return Array.from(this._modifiedFiles.entries()).map(
      ([filePath, entry]) => ({
        path: filePath,
        name: path.basename(filePath),
        content: entry.content,
        timestamp: entry.timestamp,
      })
    );
  }

  public getFileContent(filePath: string): string | undefined {
    return this._modifiedFiles.get(filePath)?.content;
  }

  public getFileCount(): number {
    return this._modifiedFiles.size;
  }

  public async applyChanges(filePath: string): Promise<boolean> {
    try {
      const stored = this._modifiedFiles.get(filePath);
      if (!stored) {
        vscode.window.showWarningMessage(
          `No pending changes for ${path.basename(filePath)}`
        );
        return false;
      }

      // Open the original document
      const document = await vscode.workspace.openTextDocument(filePath);
      const edit = new vscode.WorkspaceEdit();

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );

      edit.replace(document.uri, fullRange, stored.content);
      const applied = await vscode.workspace.applyEdit(edit);

      if (!applied) {
        vscode.window.showErrorMessage(
          `Failed to apply changes to ${path.basename(filePath)}`
        );
        return false;
      }

      await document.save();

      // Remove from pending list
      this._modifiedFiles.delete(filePath);
      this.emitChange();

      vscode.window.showInformationMessage(
        `Applied changes to ${path.basename(filePath)}`
      );
      return true;
    } catch (err) {
      console.error('RefactorManager.applyChanges error', err);
      vscode.window.showErrorMessage(`Error applying changes: ${err}`);
      return false;
    }
  }

  public async discardChanges(filePath: string): Promise<void> {
    if (!this._modifiedFiles.has(filePath)) {
      vscode.window.showWarningMessage(
        `No pending changes for ${path.basename(filePath)}`
      );
      return;
    }
    this._modifiedFiles.delete(filePath);
    this.emitChange();
    vscode.window.showInformationMessage(
      `Discarded changes for ${path.basename(filePath)}`
    );
  }

  public async applyAllChanges(
    progressCallback?: (progress: {
      current: number;
      total: number;
      file: string;
    }) => void
  ): Promise<{ applied: number; failed: number }> {
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
      if (ok) applied++;
      else failed++;
    }

    return { applied, failed };
  }

  public dispose(): void {
    console.log('RefactorManager: disposing');
    this._modifiedFiles.clear();
    this._isInitialized = false;
    this._onDidChangeFiles.dispose();
  }

  // Debug helper
  public getDebugInfo(): any {
    return {
      isInitialized: this._isInitialized,
      modifiedFilesCount: this._modifiedFiles.size,
      modifiedFiles: Array.from(this._modifiedFiles.keys()),
    };
  }
}
