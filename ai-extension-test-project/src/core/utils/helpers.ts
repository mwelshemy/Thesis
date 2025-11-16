/**
 * General utility functions
 */

export class Helpers {
  /**
   * Deep clone an object
   */
  public static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;

    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T;
    if (obj instanceof Object) {
      const cloned = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Debounce function calls
   */
  public static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function calls
   */
  public static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Generate unique ID
   */
  public static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format bytes to human readable format
   */
  public static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Sleep for specified milliseconds
   */
  public static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if value is empty (null, undefined, empty string, empty array, empty object)
   */
  public static isEmpty(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Capitalize first letter of string
   */
  public static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Convert camelCase to kebab-case
   */
  public static camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Convert kebab-case to camelCase
   */
  public static kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  }
}

// Advanced utility functions
export class AdvancedHelpers {
  /**
   * Memoize expensive function calls
   */
  public static memoize<T extends (...args: any[]) => any>(fn: T): T {
    const cache = new Map();

    return ((...args: any[]) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) return cache.get(key);

      const result = fn(...args);
      cache.set(key, result);
      return result;
    }) as T;
  }

  /**
   * Retry async function with exponential backoff
   */
  public static async retry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;

      await Helpers.sleep(delay);
      return this.retry(fn, retries - 1, delay * 2);
    }
  }

  /**
   * Compose multiple functions
   */
  public static compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
    return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
  }

  /**
   * Pipe multiple functions
   */
  public static pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
    return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
  }
}
