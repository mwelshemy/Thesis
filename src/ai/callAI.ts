/**
 * callAI.ts — client wrapper with timeouts removed for long-running backend requests.
 * NOTE: Removing client-side timeouts causes callers to wait indefinitely for server responses.
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

// Create a reusable HTTP agent (keep-alive) to reduce socket churn
let keepAliveAgent: any | null = null;
function getAgent() {
  if (!keepAliveAgent) {
    const http = require('http');
    keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
  }
  return keepAliveAgent;
}

/**
 * Health check for the AI server before requests.
 */
export async function pollAIHealth(maxWaitMs = 12000): Promise<{ healthy: boolean; status?: string; error?: string }> {
  const pollInterval = 1000;
  let elapsed = 0;
  let lastStatus = '';
  let lastError = '';

  while (elapsed < maxWaitMs) {
    try {
      const http = require('http');
      await new Promise((resolve) => {
        const options: any = {
          hostname: 'localhost',
          port: 8000,
          path: '/health',
          method: 'GET',
          timeout: 4000,
          agent: getAgent()
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
            } catch {
              // parse error -> treat as not ready
            }
            return resolve(false);
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

// Helper: sleep with jitter
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function jitter(ms: number) {
  return Math.floor(ms + (Math.random() * Math.min(300, ms)));
}

// Helper: Make HTTP request WITHOUT per-request socket timeout (client-side).
// The underlying socket may still be reset if the server crashes; caller will observe a socket error.
async function httpRequest(
  options: any,
  requestBody: string,
): Promise<string> {
  const http = require('http');
  const agent = getAgent();
  options = { ...options, agent };

  return await new Promise<string>((resolve, reject) => {
    try {
      const req = http.request(options, (res: IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            log.warn(`HTTP ${res.statusCode}: ${res.statusMessage}`);
            return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage ?? ''}. Response: ${data}`));
          }
          resolve(data);
        });
      });

      req.on('error', (error: any) => {
        reject(error);
      });

      // Best-practice: set 'Connection: keep-alive'
      if (!options.headers) options.headers = {};
      options.headers['Connection'] = options.headers['Connection'] || 'keep-alive';

      // Write and end
      req.write(requestBody);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Core AI Call (generation) with health-check gating.
 * NOTE: client-side timeouts removed as requested — caller waits until server responds or socket errors.
 */
export async function callAI(prompt: string): Promise<string> {
  // Health gating
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

  // Retry policy for transient connection errors (socket resets). No request timeout.
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const body = JSON.stringify({ prompt });
      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Connection': 'keep-alive',
        }
      };

      log.info(`Sending request to AI server (attempt ${attempt + 1}/${maxAttempts})...`);
      log.debug('Prompt (truncated):', (prompt || '').substring(0, 200).replace(/\n/g, ' '));

      const rawResponse = await httpRequest(options, body);
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
      const errStr = String(err || '');
      log.warn(`Attempt ${attempt + 1} failed:`, errStr);

      const isSocketReset = errStr.includes('ECONNRESET') || errStr.includes('socket hang up') || errStr.includes('socket hangup') || errStr.includes('socket hang');

      if (isSocketReset && attempt < maxAttempts - 1) {
        const backoff = jitter(500 * Math.pow(2, attempt));
        log.info(`Transient socket error detected, retrying after ${backoff}ms (attempt ${attempt + 2}/${maxAttempts})...`);
        await sleep(backoff);
        continue;
      }

      // If error is user-friendly, rethrow
      if (err && (err.userFriendly === true || /AI Server Error|invalid response/i.test(errStr))) {
        throw err;
      }

      // Final attempt: provide actionable user message
      if (attempt === maxAttempts - 1) {
        const userMessage = "AI backend is not responding as expected. Ensure it is running and reachable (http://localhost:8000).";
        const finalErr: UserNotifiableError = new Error(userMessage);
        finalErr.userFriendly = true;
        finalErr.userMessage = userMessage;
        log.warn(userMessage, errStr);
        throw finalErr;
      }

      await sleep(jitter(400 * Math.pow(2, attempt)));
      continue;
    }
  }

  const failErr: UserNotifiableError = new Error(
    "AI server failed to respond after multiple attempts. Please check backend logs."
  );
  failErr.userFriendly = true;
  failErr.userMessage = "AI backend is unavailable after several attempts. Please check if it is running, or restart it.";
  throw failErr;
}

/**
 * Embedding requests - no client-side timeouts here either.
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
      const requestData = JSON.stringify({ text: text.substring(0, 1000) });
      const options = {
        hostname: 'localhost',
        port: 8000,
        path: '/embed',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData),
          'Connection': 'keep-alive'
        }
      };
      log.info(`Requesting embedding from AI server (attempt ${attempts + 1}/${maxAttempts})...`);
      const rawResponse = await httpRequest(options, requestData);
      const parsedData: AIEmbeddingResponse = JSON.parse(rawResponse || '{}');
      const embedding = parsedData.embedding;
      if (Array.isArray(embedding)) return embedding;
      if (parsedData.error) throw new Error(`Embedding Error: ${parsedData.error}`);
      throw new Error('Unexpected embedding response format');
    } catch (err: any) {
      const msg = String(err || '');
      const isSocketReset = msg.includes('ECONNRESET') || msg.includes('socket hang up');
      if (isSocketReset && attempts < maxAttempts - 1) {
        await sleep(jitter(500 * (attempts + 1)));
        continue;
      }
      if (attempts < maxAttempts - 1) {
        await sleep(jitter(500 * (attempts + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Embedding server failed multiple times. Please check backend logs.");
}

// Health check: lightweight, returns boolean only
export async function checkAIHealth(): Promise<boolean> {
  try {
    const http = require('http');
    return await new Promise<boolean>((resolve) => {
      const options: any = {
        hostname: 'localhost',
        port: 8000,
        path: '/health',
        method: 'GET',
        timeout: 4000,
        agent: getAgent()
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