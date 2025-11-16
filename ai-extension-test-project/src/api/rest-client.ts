import { ApiResponse, User, RequestConfig, CacheConfig } from '../types';

/**
 * Advanced REST client with caching, retry logic, and interceptors
 */
export class RestClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private interceptors: {
    request: Array<(config: RequestConfig) => RequestConfig | Promise<RequestConfig>>;
    response: Array<(response: Response) => Response | Promise<Response>>;
    error: Array<(error: Error) => Error | Promise<Error>>;
  } = {
    request: [],
    response: [],
    error: []
  };

  constructor(baseURL: string, defaultHeaders: Record<string, string> = {}) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders
    };
  }

  // Request interceptor
  public addRequestInterceptor(
    interceptor: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  ): void {
    this.interceptors.request.push(interceptor);
  }

  // Response interceptor
  public addResponseInterceptor(
    interceptor: (response: Response) => Response | Promise<Response>
  ): void {
    this.interceptors.response.push(interceptor);
  }

  // Error interceptor
  public addErrorInterceptor(
    interceptor: (error: Error) => Error | Promise<Error>
  ): void {
    this.interceptors.error.push(interceptor);
  }

  /**
   * Execute HTTP request with retry logic and caching
   */
  public async request<T>(
    endpoint: string,
    config: RequestConfig & { cache?: CacheConfig } = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      data,
      headers = {},
      retries = 3,
      retryDelay = 1000,
      cache,
      ...restConfig
    } = config;

    // Check cache first for GET requests
    const cacheKey = this.generateCacheKey(endpoint, method, data);
    if (method === 'GET' && cache?.enabled) {
      const cached = this.getFromCache<T>(cacheKey, cache.maxAge);
      if (cached) {
        return {
          success: true,
          data: cached,
          cached: true,
          timestamp: Date.now()
        };
      }
    }

    let requestConfig: RequestConfig = {
      method,
      headers: { ...this.defaultHeaders, ...headers },
      ...restConfig
    };

    // Add body for non-GET requests
    if (method !== 'GET' && data) {
      requestConfig.body = JSON.stringify(data);
    }

    // Apply request interceptors
    for (const interceptor of this.interceptors.request) {
      requestConfig = await interceptor(requestConfig);
    }

    let response: Response;
    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        response = await fetch(`${this.baseURL}${endpoint}`, requestConfig);

        // Apply response interceptors
        for (const interceptor of this.interceptors.response) {
          response = await interceptor(response);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();

        // Cache successful GET responses
        if (method === 'GET' && cache?.enabled) {
          this.setCache(cacheKey, responseData, cache.maxAge);
        }

        return {
          success: true,
          data: responseData,
          status: response.status,
          timestamp: Date.now()
        };

      } catch (error) {
        lastError = error as Error;

        if (attempt < retries) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
          continue;
        }
      }
    }

    // Apply error interceptors
    for (const interceptor of this.interceptors.error) {
      lastError = await interceptor(lastError);
    }

    return {
      success: false,
      error: lastError.message,
      timestamp: Date.now()
    };
  }

  // CRUD operations
  public async get<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  public async post<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'POST', data });
  }

  public async put<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', data });
  }

  public async delete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  // Cache management
  private generateCacheKey(endpoint: string, method: string, data?: any): string {
    return `${method}:${endpoint}:${JSON.stringify(data || {})}`;
  }

  private getFromCache<T>(key: string, maxAge?: number): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (maxAge && Date.now() - cached.timestamp > maxAge) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any, maxAge?: number): void {
    this.cache.set(key, { data, timestamp: Date.now() });

    // Auto-cleanup based on maxAge
    if (maxAge) {
      setTimeout(() => {
        this.cache.delete(key);
      }, maxAge);
    }
  }

  public clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance with default configuration
export const apiClient = new RestClient(
  process.env.API_BASE_URL || 'https://api.example.com',
  {
    'Authorization': `Bearer ${process.env.API_TOKEN}`
  }
);

// Add default interceptors
apiClient.addRequestInterceptor((config) => {
  console.log(`Making ${config.method} request to ${config.url}`);
  return config;
});

apiClient.addResponseInterceptor((response) => {
  console.log(`Received response with status ${response.status}`);
  return response;
});

apiClient.addErrorInterceptor((error) => {
  console.error('API Request failed:', error);
  return error;
});
