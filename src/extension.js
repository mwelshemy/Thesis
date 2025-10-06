"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = require("vscode");
function activate(context) {
    console.log('VS Code AI Extension is now active!');
    // Register Hello World command
    var disposable = vscode.commands.registerCommand('vs-code-ai-extension.helloWorld', function () {
        var now = new Date().toLocaleString();
        vscode.window.showInformationMessage("Hello World from VS Code AI Extension! Time: ".concat(now));
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
