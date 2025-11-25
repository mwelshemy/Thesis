import * as vscode from 'vscode';

let debugChannel: vscode.OutputChannel | undefined;
let searchChannel: vscode.OutputChannel | undefined;

export function getDebugChannel(): vscode.OutputChannel {
    if (!debugChannel) {
        debugChannel = vscode.window.createOutputChannel('Code Understanding Debug');
    }
    return debugChannel;
}

export function getSearchChannel(): vscode.OutputChannel {
    if (!searchChannel) {
        searchChannel = vscode.window.createOutputChannel('VS Search');
    }
    return searchChannel;
}

export function logDebug(msg: string) {
    getDebugChannel().appendLine(msg);
}

export function logInfo(msg: string) {
    getSearchChannel().appendLine(msg);
}

export function logWarn(msg: string) {
    getSearchChannel().appendLine(`⚠️ ${msg}`);
}

export function logErr(msg: string) {
    getSearchChannel().appendLine(`❌ ${msg}`);
}