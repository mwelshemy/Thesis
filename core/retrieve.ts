import * as vscode from 'vscode';
import { generateEmbedding } from './embeddings';
import { calculateCosineSimilarity } from './similarity';

export interface CodeSnippet {
  filename: string;
  filepath: string;
  content: string;
  language: string;
  lineNumber: number;
  embedding?: number[];
  relevance?: number;
}

// In-memory vector store
let vectorStore: CodeSnippet[] = [];

/**
 * Generate embeddings for all project files and store in vector store
 */
export async function generateEmbeddingsForProject(): Promise<CodeSnippet[]> {
  try {
    if (!vscode.workspace.workspaceFolders) {
      console.warn('No workspace folder open.');
      return [];
    }

    const files = await vscode.workspace.findFiles(
      '**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs}',
      '**/node_modules/**'
    );

    vectorStore = [];
    let processed = 0;

    for (const file of files.slice(0, 200)) { // Limit for performance
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = document.getText();
        
        if (content.length < 10 || content.length > 10000) continue;

        // Split file into smaller chunks (function/class level)
        const chunks = splitCodeIntoChunks(content, document.languageId);
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await generateEmbedding(chunk.content);
          
          const snippet: CodeSnippet = {
            filename: `${file.fsPath.split('/').pop()}#${i + 1}`,
            filepath: file.fsPath,
            content: chunk.content,
            language: document.languageId,
            lineNumber: chunk.startLine,
            embedding: embedding
          };
          
          vectorStore.push(snippet);
        }
        
        processed++;
        if (processed % 10 === 0) {
          console.log(`Generated embeddings for ${processed} files...`);
        }
      } catch (error) {
        console.warn(`Failed to process ${file.fsPath}:`, error);
      }
    }

    console.log(`✅ Generated ${vectorStore.length} code snippet embeddings`);
    return vectorStore;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    return [];
  }
}

/**
 * Retrieve candidate code snippets based on query similarity
 */
export async function retrieveCandidates(query: string, maxResults: number = 10): Promise<CodeSnippet[]> {
  if (vectorStore.length === 0) {
    console.warn('Vector store is empty. Generating embeddings first...');
    await generateEmbeddingsForProject();
  }

  const queryEmbedding = await generateEmbedding(query);
  const scoredSnippets: CodeSnippet[] = [];

  // Calculate similarity for each snippet
  for (const snippet of vectorStore) {
    if (snippet.embedding) {
      const similarity = calculateCosineSimilarity(queryEmbedding, snippet.embedding);
      scoredSnippets.push({
        ...snippet,
        relevance: similarity
      });
    }
  }

  // Return top matches
  return scoredSnippets
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
    .slice(0, maxResults);
}

/**
 * Split code into logical chunks (functions, classes, etc.)
 */
function splitCodeIntoChunks(content: string, language: string): { content: string; startLine: number }[] {
  const chunks: { content: string; startLine: number }[] = [];
  const lines = content.split('\n');
  
  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Language-specific chunk detection
    if (isCodeBlockStart(trimmed, language) && !inBlock) {
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.join('\n'),
          startLine: chunkStartLine
        });
      }
      currentChunk = [line];
      chunkStartLine = i + 1;
      inBlock = true;
    } 
    else if (isCodeBlockEnd(trimmed, language) && inBlock) {
      currentChunk.push(line);
      chunks.push({
        content: currentChunk.join('\n'),
        startLine: chunkStartLine
      });
      currentChunk = [];
      inBlock = false;
    }
    else if (inBlock || currentChunk.length === 0) {
      currentChunk.push(line);
    }
    
    // Force chunk every 20 lines if no structure found
    if (currentChunk.length >= 20 && !inBlock) {
      chunks.push({
        content: currentChunk.join('\n'),
        startLine: chunkStartLine
      });
      currentChunk = [];
      chunkStartLine = i + 1;
    }
  }

  // Add remaining content
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join('\n'),
      startLine: chunkStartLine
    });
  }

  return chunks;
}

function isCodeBlockStart(line: string, language: string): boolean {
  const patterns: { [key: string]: RegExp } = {
    typescript: /^(export\s+)?(class|function|interface|type|const|let|var)\s+\w/,
    javascript: /^(export\s+)?(class|function|const|let|var)\s+\w/,
    python: /^(class|def)\s+\w/,
    java: /^(public|private|protected)?\s*(class|interface|void)\s+\w/,
  };
  return patterns[language]?.test(line) || false;
}

function isCodeBlockEnd(line: string, language: string): boolean {
  return line === '}' || line.startsWith('}') || 
         (language === 'python' && line.trim() === '') ||
         line.includes('});') || line.includes('};');
}