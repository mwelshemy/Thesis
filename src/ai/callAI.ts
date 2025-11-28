/**
 * Advanced AI server request module for production readiness.
 * - Health-check and gating before all requests.
 * - Actionable, friendly error messages.
 * - Robust timeout/socket handling and exponential backoff.
 * - Notifies frontend/user if AI backend is not ready before sending request.
 */

import { IncomingMessage } from 'http';

// API response types
interface AIGenerationResponse {
  generated_text?: string;
  generated_code?: string;
  error?: string;
}
interface AIEmbeddingResponse {
  embedding?: number[];
  error?: string;
  note?: string;
}
interface AIHealthResponse {
  status?: string;
  model_loaded?: boolean;
  modelLoaded?: boolean;
  import_error?: string;
}

type UserNotifiableError = Error & { userFriendly?: boolean; userMessage?: string };

// Centralized logger - replace with Winston/Pino if needed
const log = {
  info: (msg: string, ...args: any[]) => console.info('[INFO]', msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn('[WARN]', msg, ...args),
  error: (msg: string, ...args: any[]) => console.error('[ERROR]', msg, ...args),
  debug: (msg: string, ...args: any[]) => {
    if (process.env.DEBUG) console.debug('[DEBUG]', msg, ...args);
  },
};

/**
 * Health check for the AI server before requests.
 * Waits up to `maxWaitMs` for model_loaded === true, else returns false.
 * Returns a status object with extra detail if needed.
 */
export async function pollAIHealth(maxWaitMs = 12000): Promise<{ healthy: boolean; status?: string; error?: string }> {
  const pollInterval = 1000;
  let elapsed = 0;
  let lastStatus = '';
  let lastError = '';

  while (elapsed < maxWaitMs) {
    try {
      const http = await import('http');
      await new Promise((resolve, reject) => {
        const options: any = {
          hostname: 'localhost',
          port: 8000,
          path: '/health',
          method: 'GET',
          timeout: 4000,
        };
        const req = http.request(options, (res: IncomingMessage) => {
          let data = '';
          res.on('data', (chunk: any) => (data += chunk));
          res.on('end', () => {
            try {
              if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                lastStatus = `HTTP ${res.statusCode}`;
                return resolve(false);
              }
              const parsed: AIHealthResponse = JSON.parse(data || '{}');
              lastStatus = parsed.status ?? '';
              lastError = parsed.import_error ?? '';
              if (
                parsed.model_loaded === true ||
                parsed.modelLoaded === true ||
                parsed.status === 'healthy' ||
                parsed.status === 'ok'
              ) {
                return resolve(true);
              }
              return resolve(false);
            } catch {
              return resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
      if (
        lastStatus === 'healthy' ||
        lastStatus === 'ok'
      ) {
        return { healthy: true };
      }
      if (
        lastStatus === 'mock_mode' ||
        lastStatus === 'degraded'
      ) {
        return { healthy: false, status: lastStatus, error: lastError };
      }
    } catch {
      // Network error - continue polling
    }
    await new Promise(r => setTimeout(r, pollInterval));
    elapsed += pollInterval;
  }
  return { healthy: false, status: lastStatus, error: lastError };
}

// Helper: Make HTTP request with error handling, retries, and logging.
async function httpRequest(
  options: any,
  requestBody: string,
  responseTimeoutMs = 30000,
  maxRetries = 0
): Promise<string> {
  const http = await import('http');
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const req = http.request(
          { ...options, timeout: responseTimeoutMs },
          (res: IncomingMessage) => {
            let data = '';
            res.on('data', (chunk: any) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                log.warn(`HTTP ${res.statusCode}: ${res.statusMessage}`);
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage ?? ''}. Response: ${data}`));
              }
              resolve(data);
            });
          }
        );
        req.on('error', (error: any) => {
          log.error('Request error:', error);
          reject(error);
        });
        req.on('timeout', () => {
          log.warn(`Request timed out after ${responseTimeoutMs} ms`);
          req.destroy();
          reject(new Error(`Request timeout after ${responseTimeoutMs} ms.`));
        });
        req.write(requestBody);
        req.end();
      });
    } catch (err) {
      lastError = err;
      log.warn(`Attempt ${attempt + 1} failed:`, err);
      if (attempt < maxRetries) {
        log.info(`Retrying AI server request (attempt ${attempt + 2}/${maxRetries + 1})...`);
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('Unknown error in AI call');
}

/**
 * Core AI Call (generation) with full health-check gating, smart timeout management,
 * exponential retry, and rich error messages for UI display.
 */
export async function callAI(prompt: string): Promise<string> {
  let healthStatus;
  try {
    healthStatus = await pollAIHealth(20000); // Wait up to 20s for AI server
  } catch (healthErr: any) {
    log.warn("Health check failed", healthErr);
    healthStatus = { healthy: false };
  }

  if (!healthStatus.healthy) {
    const serverStatus = healthStatus?.status || "unavailable";
    const serverError = healthStatus?.error || "";
    
    let userMessage = '';
    if (serverStatus === 'mock_mode') {
      userMessage = 
        "The AI engine is running in mock mode. Results may not reflect real analysis until the model loads.";
    } else if (serverStatus === 'degraded') {
      userMessage = 
        "The AI engine is in a degraded state due to import or loading errors. Live code analysis may not work.";
    } else {
      userMessage = 
        "The AI engine is still loading and not ready. Please wait up to a minute, then retry your query.";
    }
    if (serverError) userMessage += `\nDiagnostic detail: ${serverError}`;
    const err: UserNotifiableError = new Error(userMessage);
    err.userFriendly = true;
    err.userMessage = userMessage;
    log.warn(userMessage);
    throw err;
  }

  const maxAttempts = 3;
  const baseTimeout = 30000;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      const timeout = attempts === 0 ? baseTimeout * 2 : baseTimeout + (attempts * 5000);
      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(JSON.stringify({ prompt })),
        },
        timeout
      };
      log.info(`Sending request to AI server (attempt ${attempts + 1}/${maxAttempts}, timeout: ${timeout}ms)...`);
      log.debug('Prompt:', (prompt || '').substring(0, 200).replace(/\n/g, ' '));
      const rawResponse = await httpRequest(options, JSON.stringify({ prompt }), timeout, 0 /* no inner retry */);
      let parsedData: AIGenerationResponse;
      try {
        parsedData = JSON.parse(rawResponse || '{}');
      } catch (err) {
        log.error('Response parse error', err, rawResponse);
        const parseUserMsg = "AI backend sent an invalid response. Please retry, or check backend logs for errors.";
        const errObj: UserNotifiableError = new Error(parseUserMsg);
        errObj.userFriendly = true;
        errObj.userMessage = parseUserMsg;
        throw errObj;
      }
      // Prefer generated_text, fallback to legacy generated_code
      const generated = parsedData.generated_text ?? parsedData.generated_code;
      if (typeof generated === 'string') {
        let code = generated;
        if (code.startsWith(prompt)) code = code.substring(prompt.length).trim();
        return code;
      }
      if (parsedData.error) {
        const userMsg = `AI Server Error: ${parsedData.error}`;
        const errObj: UserNotifiableError = new Error(userMsg);
        errObj.userFriendly = true;
        errObj.userMessage = userMsg;
        throw errObj;
      }
      throw new Error(`Unexpected AI response shape: ${JSON.stringify(parsedData)}`);
    } catch (err: any) {
      // Friendly handling for timeouts/sockets
      let userMessage = '';
      if (String(err).includes('Request timeout')) {
        log.warn(`[WARN] Request timed out (attempt ${attempts + 1}/${maxAttempts})`);
        userMessage = "AI server did not respond in time. It may still be starting or busy. Please wait 1–2 minutes and try again.";
      } else if (
        String(err).includes('ECONNRESET') ||
        String(err).includes('socket hang up')
      ) {
        log.error(`[ERROR] Socket hang up (attempt ${attempts + 1}/${maxAttempts})`);
        userMessage = "AI server closed the connection. It may be restarting or updating models. Please re-run your query soon.";
      }
      if (userMessage && attempts === maxAttempts - 1) {
        const finalErr: UserNotifiableError = new Error(userMessage);
        finalErr.userFriendly = true;
        finalErr.userMessage = userMessage;
        log.warn(userMessage);
        throw finalErr;
      }

      if (!userMessage && attempts === maxAttempts - 1) {
        const finalErr: UserNotifiableError = new Error(
          "AI server failed multiple times—please check if the backend is running and healthy."
        );
        finalErr.userFriendly = true;
        finalErr.userMessage = "AI backend is not responding as expected. Please check logs or restart the backend.";
        throw finalErr;
      }
      // Short backoff before retry
      await new Promise(r => setTimeout(r, 700 * (attempts + 1)));
      continue;
    }
  }
  // Should never reach here
  const failErr: UserNotifiableError = new Error(
    "AI server failed to respond after multiple attempts. Please check backend logs."
  );
  failErr.userFriendly = true;
  failErr.userMessage = "AI backend is unavailable after several attempts. Please check if it is running, or restart it.";
  throw failErr;
}

/**
 * Embedding requests - same robust pattern & error handling
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  let healthStatus;
  try {
    healthStatus = await pollAIHealth(15000); // Wait up to 15s
  } catch (healthErr: any) {
    log.warn("Health check failed", healthErr);
    healthStatus = { healthy: false };
  }

  if (!healthStatus.healthy) {
    throw new Error(
      `Cannot generate embedding: AI backend is not ready yet. Status: ${healthStatus.status || ''} ${healthStatus.error || ''}`.trim()
    );
  }

  const maxAttempts = 2;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      const requestData = JSON.stringify({ text });
      const timeout = attempts === 0 ? 20000 : 10000; // Slightly increased timeout for embeddings
      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/embed',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
        },
        timeout
      };
      log.info(`Requesting embedding from AI server (attempt ${attempts + 1}/${maxAttempts})...`);
      const rawResponse = await httpRequest(options, requestData, timeout, 0);
      let parsedData: AIEmbeddingResponse;
      try {
        parsedData = JSON.parse(rawResponse || '{}');
      } catch (err) {
        log.error('Embedding response parse error', err, rawResponse);
        throw new Error(`Embedding parse error: ${err} Raw response: ${rawResponse}`);
      }
      if (parsedData.embedding && Array.isArray(parsedData.embedding)) {
        return parsedData.embedding;
      }
      if (parsedData.error) {
        throw new Error(`Embedding Error: ${parsedData.error}`);
      }
      throw new Error(`Unexpected embedding response format: ${JSON.stringify(parsedData)}`);
    } catch (err: any) {
      if (String(err).includes('Request timeout') && attempts === maxAttempts - 1) {
        throw new Error("Embedding server did not respond in time. Please try again later.");
      }
      if (
        String(err).includes('ECONNRESET') ||
        String(err).includes('socket hang up')
      ) {
        throw new Error("Embedding server closed the connection. It may be restarting.");
      }
      await new Promise(r => setTimeout(r, 700 * (attempts + 1)));
      continue;
    }
  }
  throw new Error("Embedding server failed multiple times. Please check backend logs.");
}

// Health check: lightweight, returns boolean only
export async function checkAIHealth(): Promise<boolean> {
  try {
    const http = await import('http');
    return await new Promise<boolean>((resolve) => {
      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/health',
        method: 'GET',
        timeout: 4000,
      };
      const req = http.request(options, (res: IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          try {
            const parsedData: AIHealthResponse = JSON.parse(data || '{}');
            const status = parsedData.status ?? '';
            const modelLoaded = parsedData.model_loaded ?? parsedData.modelLoaded ?? false;
            const healthy = modelLoaded === true || status === 'healthy' || status === 'ok';
            return resolve(Boolean(healthy));
          } catch {
            return resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
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
 * MOCKS (for testing)
 */

export async function callAIMock(prompt: string) {
  return `MOCK RESPONSE: This is a mock AI response for: "${prompt.substring(0, 100)}..."\n\nIn production, this would call the actual local API.`;
}
export async function generateEmbeddingMock(): Promise<number[]> {
  return Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);
}