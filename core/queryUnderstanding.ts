export interface QueryAnalysis {
  mainIntent: string;
  codeConcepts: string[];
  fileTypes: string[];
  isFunctionSearch: boolean;
  isClassSearch: boolean;
  isAlgorithmSearch: boolean;
}

export function analyzeQuery(query: string): QueryAnalysis {
  const lowerQuery = query.toLowerCase();
  return {
    mainIntent: extractMainIntent(lowerQuery),
    codeConcepts: extractCodeConcepts(lowerQuery),
    fileTypes: extractFileTypes(lowerQuery),
    isFunctionSearch: isFunctionSearch(lowerQuery),
    isClassSearch: isClassSearch(lowerQuery),
    isAlgorithmSearch: isAlgorithmSearch(lowerQuery)
  };
}

function extractMainIntent(query: string): string {
  if (query.includes('function') || query.match(/where.*function/) || query.match(/find.*function/) || query.includes('func ') || query.match(/\w+\s+function/)) {
    return 'function';
  }
  if (query.includes('class') || query.match(/where.*class/) || query.match(/find.*class/) || query.includes('interface') || query.includes('struct')) {
    return 'class';
  }
  if (query.includes('sort') || query.includes('algorithm') || query.includes('search') || query.includes('binary') ||
    query.includes('bubble') || query.includes('quick') || query.includes('merge')) {
    return 'algorithm';
  }
  if (query.includes('where is') || query.includes('find') || query.includes('locate')) {
    return 'location';
  }
  return 'general';
}
function isClassSearch(query: string): boolean {
  return query.includes('class') || query.match(/where.*class/) !== null || query.match(/find.*class/) !== null || query.includes('interface') || query.includes('struct');
}
function isAlgorithmSearch(query: string): boolean {
  return query.includes('algorithm') || query.includes('sort') || query.includes('search') || query.includes('binary') || query.includes('bubble') || query.includes('quick') || query.includes('merge') || query.includes('filter');
}
function extractCodeConcepts(query: string): string[] {
  const concepts: string[] = [];
  const codeKeywords = [
    'bubble sort', 'quick sort', 'merge sort', 'heap sort', 'insertion sort', 'selection sort',
    'sorting algorithm', 'sort function', 'sort method',
    'binary search', 'linear search', 'search algorithm',
    'algorithm', 'data structure', 'function', 'class', 'method'
  ];
  codeKeywords.forEach(keyword => { if (query.includes(keyword)) concepts.push(keyword); });
  return concepts;
}
function extractFileTypes(query: string): string[] {
  const fileTypes: string[] = [];
  const extensions = ['.ts','.js','.tsx','.jsx','.py','.java','.cpp','.c','.cs'];
  extensions.forEach(ext => { if (query.includes(ext)) fileTypes.push(ext); });
  return fileTypes;
}
function isFunctionSearch(query: string): boolean {
  return query.includes('function') || query.match(/where.*function/) !== null || query.match(/find.*function/) !== null;
}