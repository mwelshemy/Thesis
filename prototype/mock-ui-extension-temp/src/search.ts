// src/search.ts
export interface FileIndexEntry {
  fileName: string;
  path: string;
  language: string;
  summary?: string;
}

/**
 * Example index of project files
 */
export const fileIndex: FileIndexEntry[] = [
  { fileName: "extension.ts", path: "src/extension.ts", language: "TypeScript" },
  { fileName: "callAI.ts", path: "src/ai/callAI.ts", language: "TypeScript" },
  { fileName: "index.html", path: "src/webview/index.html", language: "HTML" },
  { fileName: "style.css", path: "src/webview/style.css", language: "CSS" },
];

/**
 * Search project files by name
 */
export function searchByName(query: string): FileIndexEntry[] {
  const q = query.toLowerCase();
  return fileIndex.filter(file => file.fileName.toLowerCase().includes(q));
}

/**
 * Search project files by language type
 */
export function searchByLanguage(language: string): FileIndexEntry[] {
  return fileIndex.filter(file => file.language.toLowerCase() === language.toLowerCase());
}
