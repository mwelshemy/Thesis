/**
 * Robust DeepSeek API client with proper error handling
 */

// Type definitions for DeepSeek API responses
import { calculateCosineSimilarity } from '../core/similarity';
interface DeepSeekEmbeddingResponse {
  embedding?: number[];
  error?: string;
  note?: string;
}

interface DeepSeekGenerationResponse {
  generated_text?: string;
  generated_code?: string;
  error?: string;
}

interface DeepSeekHealthResponse {
  status: string;
  model_loaded: boolean;
  import_error?: string;
}

/**
 * Generate embeddings using DeepSeek API
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  console.log('🚀 Calling DeepSeek for embeddings...');
  
  try {
    const response = await fetchWithTimeout('http://localhost:8000/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.substring(0, 4000) // Reasonable length
      })
    }, 15000); // 15 second timeout

    if (!response.ok) {
      throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
    }

    const data: DeepSeekEmbeddingResponse = await response.json();
    
    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error}`);
    }

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from DeepSeek');
    }

    console.log(`✅ DeepSeek embedding: ${data.embedding.length} dimensions`);
    return data.embedding;
    
  } catch (error) {
    console.error('❌ DeepSeek embedding failed:', error);
    throw new Error(`DeepSeek embedding unavailable: ${error}`);
  }
}

/**
 * Call DeepSeek for text generation
 */
export async function callAI(prompt: string): Promise<string> {
  console.log('🤖 Calling DeepSeek for generation...');
  
  try {
    const response = await fetchWithTimeout('http://localhost:8000/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt })
    }, 30000); // 30 second timeout

    if (!response.ok) {
      throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
    }

    const data: DeepSeekGenerationResponse = await response.json();
    
    if (data.error) {
      throw new Error(`DeepSeek generation error: ${data.error}`);
    }

    const generated = data.generated_text || data.generated_code;
    if (!generated) {
      throw new Error('No generated content from DeepSeek');
    }

    console.log('✅ DeepSeek generation successful');
    return generated;
    
  } catch (error) {
    console.error('❌ DeepSeek generation failed:', error);
    throw new Error(`DeepSeek generation unavailable: ${error}`);
  }
}

/**
 * Check DeepSeek server health
 */
export async function checkAIHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('http://localhost:8000/health', {
      method: 'GET'
    }, 5000); // 5 second timeout

    if (!response.ok) {
      return false;
    }

    const data: DeepSeekHealthResponse = await response.json();
    return data.model_loaded === true || data.status === 'healthy';
    
  } catch (error) {
    console.log('🔴 DeepSeek server not reachable');
    return false;
  }
}

/**
 * Utility function for fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * DeepSeek diagnostics
 */
export async function debugDeepSeek(): Promise<any> {
  console.log('🔧 DEEPSEEK DIAGNOSTICS');
  
  try {
    // Test health endpoint
    const health = await checkAIHealth();
    console.log('🏥 DeepSeek Health:', health ? '✅ Healthy' : '❌ Unhealthy');
    
    if (health) {
      // Test embedding
      console.log('🧪 Testing embedding...');
      const embedding = await generateEmbedding('test configuration');
      console.log(`📐 Embedding dimensions: ${embedding.length}`);
      console.log(`📊 Embedding sample: [${embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...]`);
      
      // Test semantic relationships
      console.log('\n🔗 Testing semantic understanding...');
      const emb1 = await generateEmbedding('config');
      const emb2 = await generateEmbedding('configuration');
      const emb3 = await generateEmbedding('sort algorithm');
      
      const similarity = await calculateCosineSimilarity(emb1, emb2);
      console.log(`   "config" vs "configuration": ${similarity.toFixed(3)} (should be high)`);
      
      return {
        health: true,
        embeddingDimensions: embedding.length,
        semanticSimilarity: similarity,
        deepSeekWorking: true
      };
    } else {
      return {
        health: false,
        deepSeekWorking: false,
        error: 'DeepSeek server not healthy'
      };
    }
  } catch (error) {
    console.error('❌ DeepSeek diagnostics failed:', error);
    return {
      health: false,
      deepSeekWorking: false,
      error: String(error)
    };
  }
}

// Mock functions for compatibility (won't be used if DeepSeek works)
export async function callAIMock(prompt: string): Promise<string> {
  return `MOCK: ${prompt.substring(0, 100)}...`;
}

export async function generateEmbeddingMock(): Promise<number[]> {
  return Array(2048).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);
}