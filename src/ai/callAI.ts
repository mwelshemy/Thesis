/**
 * Calls the local Python AI server.
 * Updated to match deepseek_api.py endpoints & response shapes.
 */
export async function callAI(prompt: string): Promise<string> {
  try {
    console.log('Sending request to AI server...');
    console.log('Prompt:', prompt.substring(0, 100) + '...');

    const http = await import('http');

    return new Promise((resolve) => {
      const requestData = JSON.stringify({ prompt });

      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/generate', // <- changed from /generate_code to /generate
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            console.log('AI server response received');

            // Support both possible keys for compatibility
            const generated =
              parsedData.generated_text ?? parsedData.generated_code ?? null;

            if (typeof generated === 'string') {
              let generatedCode = generated;
              // Remove the original prompt if it exists
              if (generatedCode.startsWith(prompt)) {
                generatedCode = generatedCode.substring(prompt.length).trim();
              }
              resolve(generatedCode);
            } else if (parsedData.error) {
              resolve(`AI Server Error: ${parsedData.error}`);
            } else {
              console.warn('Unexpected response format from AI server:', parsedData);
              resolve(JSON.stringify(parsedData, null, 2));
            }
          } catch (parseError) {
            resolve(`Error parsing AI response: ${parseError}\nRaw response: ${data}`);
          }
        });
      });

      req.on('error', (error: any) => {
        console.error('Request error:', error);
        if (error.code === 'ECONNREFUSED') {
          resolve(
            'ERROR: Connection refused. Is your Python AI server (deepseek_api.py) running on http://localhost:8000? Run e.g.:\n' +
              'python -m uvicorn deepseek_api:app --host 0.0.0.0 --port 8000 --reload'
          );
        } else {
          resolve(`ERROR: ${error.message || 'Unknown error occurred'}`);
        }
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve('ERROR: Request timeout after 30 seconds. The AI server might be busy loading the model.');
      });

      req.write(requestData);
      req.end();
    });
  } catch (error: any) {
    console.error('AI Call Error:', error);
    return `ERROR: ${error.message || 'Unknown error occurred'}`;
  }
}

/**
 * Generate embeddings using the local Python AI server
 * For semantic search functionality
 */
export async function generateEmbedding(text: string): Promise<number[] | string> {
  try {
    console.log('Generating embedding for text:', text.substring(0, 50) + '...');

    const http = await import('http');

    return new Promise((resolve) => {
      const requestData = JSON.stringify({ text });

      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/embed', // <- changed from /generate_embedding to /embed
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            console.log('Embedding response received');

            if (parsedData.embedding && Array.isArray(parsedData.embedding)) {
              resolve(parsedData.embedding);
            } else if (parsedData.error) {
              resolve(`Embedding Error: ${parsedData.error}`);
            } else {
              resolve(`Unexpected embedding response format: ${JSON.stringify(parsedData)}`);
            }
          } catch (parseError) {
            resolve(`Error parsing embedding response: ${parseError}`);
          }
        });
      });

      req.on('error', (error: any) => {
        console.error('Embedding request error:', error);
        if (error.code === 'ECONNREFUSED') {
          resolve('ERROR: Connection refused for embedding service.');
        } else {
          resolve(`ERROR: ${error.message || 'Unknown error occurred'}`);
        }
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve('ERROR: Embedding request timeout after 30 seconds.');
      });

      req.write(requestData);
      req.end();
    });
  } catch (error: any) {
    console.error('Embedding Call Error:', error);
    return `ERROR: ${error.message || 'Unknown error occurred'}`;
  }
}

/**
 * Health check for the AI server
 */
export async function checkAIHealth(): Promise<boolean> {
  try {
    const http = await import('http');

    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/health',
        method: 'GET',
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            // Accept multiple possible health shapes for compatibility
            const status = parsedData.status ?? '';
            const modelLoaded = parsedData.model_loaded ?? parsedData.modelLoaded ?? false;
            resolve(
              status === 'ok' ||
                status === 'healthy' ||
                status === 'mock_mode' ||
                modelLoaded === true
            );
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  } catch {
    return false;
  }
}

/**
 * Mock version for testing. This remains unchanged.
 */
export async function callAIMock(prompt: string): Promise<string> {
  return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(0, 100)}..."\n\nIn production, this would call the actual Hugging Face API.`;
}

/**
 * Mock embedding for testing
 */
export async function generateEmbeddingMock(): Promise<number[]> {
  // Return a simple mock embedding
  return Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);
}