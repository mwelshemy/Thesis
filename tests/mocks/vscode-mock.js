/**
 * Comprehensive VS Code Mock for Real Integration Testing
 */

const vscode = {
  // Window API
  window: {
    createOutputChannel: jest.fn((name) => ({
      name: name,
      appendLine: jest.fn(),
      append: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      clear: jest.fn(),
      dispose: jest.fn(),
    })),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInputBox: jest.fn(() => Promise.resolve('test input')),
    showQuickPick: jest.fn(),
    withProgress: jest.fn((options, task) => {
      return task({
        report: jest.fn(),
      });
    }),
    activeTextEditor: {
      document: {
        getText: jest.fn(
          () =>
            '// Active editor content\nfunction activeFunction() { return true; }'
        ),
        languageId: 'typescript',
        fileName: '/active/file.ts',
        lineCount: 10,
        uri: {
          fsPath: '/active/file.ts',
        },
      },
      selection: {
        isEmpty: false,
        start: { line: 0, character: 0 },
        end: { line: 1, character: 10 },
      },
    },
  },

  // Workspace API
  workspace: {
    findFiles: jest.fn((include, exclude, maxResults) => {
      console.log(
        `📁 findFiles called: include=${include}, exclude=${exclude}, maxResults=${maxResults}`
      );
      const mockFiles = [
        { fsPath: '/workspace/file1.ts' },
        { fsPath: '/workspace/file2.js' },
        { fsPath: '/workspace/utils.ts' },
        { fsPath: '/workspace/test.py' },
      ];
      return Promise.resolve(mockFiles.slice(0, maxResults));
    }),

    openTextDocument: jest.fn((uri) => {
      console.log(`📄 openTextDocument called: ${uri.fsPath}`);
      return Promise.resolve({
        getText: jest.fn(
          () =>
            `// Content of ${uri.fsPath}\nfunction example() { return "example"; }`
        ),
        languageId: uri.fsPath.endsWith('.ts')
          ? 'typescript'
          : uri.fsPath.endsWith('.js')
            ? 'javascript'
            : 'python',
        lineCount: 5,
        fileName: uri.fsPath,
        uri: uri,
      });
    }),

    fs: {
      stat: jest.fn((uri) => {
        return Promise.resolve({
          mtime: Date.now(),
          ctime: Date.now() - 86400000,
          size: 1024,
        });
      }),
    },

    createFileSystemWatcher: jest.fn(() => ({
      onDidCreate: jest.fn(),
      onDidChange: jest.fn(),
      onDidDelete: jest.fn(),
      dispose: jest.fn(),
    })),

    onDidSaveTextDocument: jest.fn(),
    onDidOpenTextDocument: jest.fn(),
    onDidCloseTextDocument: jest.fn(),
  },

  // Commands API
  commands: {
    registerCommand: jest.fn((command, callback) => ({
      command: command,
      callback: callback,
      dispose: jest.fn(),
    })),
    executeCommand: jest.fn(),
  },

  // Enums and Constants
  ProgressLocation: {
    Notification: 15,
    SourceControl: 1,
    Window: 10,
  },

  // Extension Context
  ExtensionContext: jest.fn(),

  // Disposable
  Disposable: jest.fn(),

  // URI
  Uri: {
    file: jest.fn((path) => ({ fsPath: path, scheme: 'file' })),
    parse: jest.fn(),
  },
};

module.exports = vscode;
