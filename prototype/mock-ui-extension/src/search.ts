// src/search.ts
// ✅ Complete stub file to satisfy integration references

export interface FileIndexEntry {
    fileName: string;
    content?: string;
    language?: string;
    lineCount?: number;
    lastModified?: Date;
}

export function searchIndex(query: string, maxResults: number = 10): FileIndexEntry[] {
    // Return some mock data
    return Array.from({ length: Math.min(maxResults, 3) }, (_, i) => ({
        fileName: `mock_file_${i + 1}.ts`,
        content: `function example${i + 1}() { return "ok"; }`,
        language: "typescript",
        lineCount: 10 + i * 5,
        lastModified: new Date(),
    }));
}

export function buildSearchIndex(): FileIndexEntry[] {
    return [
        {
            fileName: "mock_file.ts",
            content: "console.log('hello')",
            language: "typescript",
            lineCount: 12,
            lastModified: new Date(),
        },
    ];
}
