// extension/src/extension.ts
import * as vscode from 'vscode';
import { AIWebViewPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Prototype Extension Activated 🧠');

  const disposable = vscode.commands.registerCommand('aiPrototype.openPanel', () => {
    AIWebViewPanel.createOrShow(context.extensionUri);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
