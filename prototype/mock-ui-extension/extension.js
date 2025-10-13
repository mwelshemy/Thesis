const vscode = require("vscode");

function activate(context) {
  // Register the command to show mock UI
  let disposable = vscode.commands.registerCommand("mockui.showPanel", function () {
    vscode.window.showInformationMessage("Mock UI Panel Loaded");
  });
  context.subscriptions.push(disposable);

  // Tree data provider for sidebar (like Copilot menu)
  const treeDataProvider = new MockUITreeDataProvider();
  vscode.window.registerTreeDataProvider("mockuiView", treeDataProvider);
}

class MockUITreeDataProvider {
  getTreeItem(element) {
    return element;
  }

  getChildren() {
    return [
      new vscode.TreeItem("💬 Chat with AI", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("🔧 Generate Code", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("🐞 Fix Errors", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("🧪 Write Unit Tests", vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem("📚 Explain Code", vscode.TreeItemCollapsibleState.None),
    ];
  }
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};
