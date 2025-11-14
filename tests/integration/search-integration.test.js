/**
 * Search Integration Tests
 */

describe('Search Functionality', () => {
  let mockVSCode;
  let searchFunctions;

  beforeEach(() => {
    // Mock VS Code API
    mockVSCode = {
      window: {
        createOutputChannel: jest.fn(() => ({
          appendLine: jest.fn(),
          show: jest.fn(),
          clear: jest.fn(),
        })),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn((options, task) =>
          task({
            report: jest.fn(),
          })
        ),
      },
      workspace: {
        findFiles: jest.fn(() =>
          Promise.resolve([
            { fsPath: '/project/file1.ts' },
            { fsPath: '/project/file2.js' },
            { fsPath: '/project/utils.py' },
          ])
        ),
        openTextDocument: jest.fn((uri) =>
          Promise.resolve({
            getText: jest.fn(
              () => '// Mock file content\nfunction test() { return true; }'
            ),
            languageId: uri.fsPath.endsWith('.ts')
              ? 'typescript'
              : uri.fsPath.endsWith('.js')
                ? 'javascript'
                : 'python',
            lineCount: 10,
          })
        ),
        createFileSystemWatcher: jest.fn(() => ({
          onDidCreate: jest.fn(),
          onDidChange: jest.fn(),
          onDidDelete: jest.fn(),
          dispose: jest.fn(),
        })),
      },
      ProgressLocation: {
        Notification: 1,
      },
    };

    // Mock the search module
    jest.mock('../../src/search', () => {
      const mockSearchData = [
        {
          filePath: '/project/file1.ts',
          fileName: 'file1.ts',
          language: 'typescript',
          content: 'export function calculate() { return 42; }',
          lineCount: 5,
          lastModified: new Date(),
        },
        {
          filePath: '/project/file2.js',
          fileName: 'file2.js',
          language: 'javascript',
          content: 'function helper() { console.log("help"); }',
          lineCount: 3,
          lastModified: new Date(),
        },
      ];

      return {
        initializeSearch: jest.fn(() =>
          mockVSCode.window.createOutputChannel()
        ),
        buildSearchIndex: jest.fn(() => Promise.resolve(mockSearchData)),
        searchIndex: jest.fn((query, maxResults = 10) => {
          if (!query) return mockSearchData.slice(0, maxResults);
          return mockSearchData
            .filter(
              (file) =>
                file.fileName.includes(query) || file.content.includes(query)
            )
            .slice(0, maxResults);
        }),
        getSearchStats: jest.fn(() => ({
          fileCount: mockSearchData.length,
          totalLines: mockSearchData.reduce(
            (sum, file) => sum + file.lineCount,
            0
          ),
          isIndexing: false,
          totalIndexSize: '2 KB',
        })),
        clearSearchIndex: jest.fn(),
        searchByLanguage: jest.fn((language) =>
          mockSearchData.filter((file) => file.language === language)
        ),
        getFileByPath: jest.fn((path) =>
          mockSearchData.find((file) => file.filePath === path)
        ),
      };
    });

    searchFunctions = require('../../src/search');
  });

  test('should build search index with mock files', async () => {
    const results = await searchFunctions.buildSearchIndex();

    expect(results).toHaveLength(2);
    expect(results[0].fileName).toBe('file1.ts');
    expect(results[1].language).toBe('javascript');
  });

  test('should search index with query', () => {
    const results = searchFunctions.searchIndex('calculate', 5);

    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('file1.ts');
    expect(results[0].content).toContain('calculate');
  });

  test('should handle empty search query', () => {
    const results = searchFunctions.searchIndex('', 5);

    expect(results).toHaveLength(2); // Returns all files when no query
  });

  test('should get search statistics', () => {
    const stats = searchFunctions.getSearchStats();

    expect(stats.fileCount).toBe(2);
    expect(stats.totalLines).toBe(8);
    expect(stats.isIndexing).toBe(false);
  });

  test('should search by language', () => {
    const typescriptFiles = searchFunctions.searchByLanguage('typescript');

    expect(typescriptFiles).toHaveLength(1);
    expect(typescriptFiles[0].language).toBe('typescript');
  });

  test('should get file by path', () => {
    const file = searchFunctions.getFileByPath('/project/file2.js');

    expect(file).toBeDefined();
    expect(file.fileName).toBe('file2.js');
  });
});
