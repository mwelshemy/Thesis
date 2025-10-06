import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('VS Code AI Extension is now active!');

  // Register Hello World command
  const disposable = vscode.commands.registerCommand(
    'vs-code-ai-extension.helloWorld',
    () => {
      const now = new Date().toLocaleString();
      vscode.window.showInformationMessage(
        `Hello World from VS Code AI Extension! Time: ${now}`
      );
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
