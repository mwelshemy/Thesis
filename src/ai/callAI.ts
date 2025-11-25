/**
 * Calls the local Python AI server.
 * Updated to match deepseek_api.py endpoints & response shapes.
 *
 * Important: this implementation throws on network/response errors so callers
 * (e.g. resilientCallAI) can retry and apply backoff. Previously it resolved
 * error strings which prevented retry logic from working.
 */
export async function callAI(prompt: string): Promise<string> {
  const http = await import('http');

  return new Promise((resolve, reject) => {
    try {
      console.log('Sending request to AI server...');
      console.log('Prompt preview:', (prompt || '').substring(0, 200).replace(/\n/g, ' '));

      const requestData = JSON.stringify({ prompt });

      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
        },
        timeout: 30000,
      };

      const req = http.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return reject(new Error(`AI server HTTP ${res.statusCode}: ${res.statusMessage || ''} - ${data}`));
            }

            const parsedData = JSON.parse(data || '{}');
            console.log('AI server response received');

            // Prefer generated_text, fallback to legacy generated_code
            const generated = parsedData.generated_text ?? parsedData.generated_code ?? null;

            if (typeof generated === 'string') {
              let generatedCode = generated;
              // Remove the original prompt prefix if the server echoed it back
              if (generatedCode.startsWith(prompt)) {
                generatedCode = generatedCode.substring(prompt.length).trim();
              }
              return resolve(generatedCode);
            }

            // If server returned an explicit error field -> reject
            if (parsedData.error) {
              return reject(new Error(`AI Server Error: ${parsedData.error}`));
            }

            // Unexpected format — reject so callers can retry or fall back
            return reject(new Error(`Unexpected response format from AI server: ${JSON.stringify(parsedData)}`));
          } catch (parseError) {
            return reject(new Error(`Error parsing AI response: ${String(parseError)}\nRaw response: ${data}`));
          }
        });
      });

      req.on('error', (error: any) => {
        console.error('Request error:', error);
        return reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        return reject(new Error('Request timeout after 30 seconds. The AI server might be busy loading the model.'));
      });

      req.write(requestData);
      req.end();
    } catch (err) {
      return reject(err);
    }
  });
}

/**
 * Generate embeddings using the local Python AI server
 * For semantic search functionality
 *
 * This function throws on network/response errors to make retry logic reliable.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const http = await import('http');

  return new Promise((resolve, reject) => {
    try {
      console.log('Generating embedding for text preview:', (text || '').substring(0, 120).replace(/\n/g, ' '));

      const requestData = JSON.stringify({ text });

      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/embed',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
        },
        timeout: 30000,
      };

      const req = http.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return reject(new Error(`Embedding server HTTP ${res.statusCode}: ${res.statusMessage || ''} - ${data}`));
            }

            const parsedData = JSON.parse(data || '{}');
            console.log('Embedding response received');

            if (parsedData.embedding && Array.isArray(parsedData.embedding)) {
              return resolve(parsedData.embedding);
            }

            if (parsedData.error) {
              return reject(new Error(`Embedding Error: ${parsedData.error}`));
            }

            return reject(new Error(`Unexpected embedding response format: ${JSON.stringify(parsedData)}`));
          } catch (parseError) {
            return reject(new Error(`Error parsing embedding response: ${String(parseError)}\nRaw response: ${data}`));
          }
        });
      });

      req.on('error', (error: any) => {
        console.error('Embedding request error:', error);
        return reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        return reject(new Error('Embedding request timeout after 30 seconds.'));
      });

      req.write(requestData);
      req.end();
    } catch (err) {
      return reject(err);
    }
  });
}

/**
 * Health check for the AI server
 * Returns true only if server indicates models are ready (model_loaded === true) or healthy.
 * This function resolves false for network issues instead of throwing, since callers may want to
 * treat health check as non-fatal.
 */
export async function checkAIHealth(): Promise<boolean> {
  try {
    const http = await import('http');

    return new Promise((resolve) => {
      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/health',
        method: 'GET',
        timeout: 5000,
      };

      const req = http.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return resolve(false);
            }
            const parsedData = JSON.parse(data || '{}');
            // Accept multiple possible health shapes for compatibility
            const status = parsedData.status ?? '';
            const modelLoaded = parsedData.model_loaded ?? parsedData.modelLoaded ?? false;
            // consider healthy only if model_loaded true or explicit healthy/status
            const healthy =
              modelLoaded === true ||
              status === 'healthy' ||
              status === 'ok';
            return resolve(Boolean(healthy));
          } catch {
            return resolve(false);
          }
        });
      });

      req.on('error', () => {
        return resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        return resolve(false);
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