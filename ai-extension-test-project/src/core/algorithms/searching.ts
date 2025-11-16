/**
 * Various searching algorithms implementation
 */

export class SearchingAlgorithms {
  /**
   * Binary Search - O(log n)
   * Works only on sorted arrays
   */
  public static binarySearch<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const comparison = compare(arr[mid], target);

      if (comparison === 0) {
        return mid;
      } else if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1;
  }

  /**
   * Linear Search - O(n)
   * Works on any array
   */
  public static linearSearch<T>(arr: T[], target: T, compare: (a: T, b: T) => number = (a, b) => a === b ? 0 : -1): number {
    for (let i = 0; i < arr.length; i++) {
      if (compare(arr[i], target) === 0) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Interpolation Search - O(log log n) average for uniformly distributed data
   */
  public static interpolationSearch(arr: number[], target: number): number {
    let left = 0;
    let right = arr.length - 1;

    while (left <= right && target >= arr[left] && target <= arr[right]) {
      if (left === right) {
        return arr[left] === target ? left : -1;
      }

      const pos = left + Math.floor(
        ((target - arr[left]) * (right - left)) / (arr[right] - arr[left])
      );

      if (arr[pos] === target) {
        return pos;
      }

      if (arr[pos] < target) {
        left = pos + 1;
      } else {
        right = pos - 1;
      }
    }

    return -1;
  }

  /**
   * Jump Search - O(ûn)
   */
  public static jumpSearch<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    const n = arr.length;
    const step = Math.floor(Math.sqrt(n));

    let prev = 0;
    while (compare(arr[Math.min(step, n) - 1], target) < 0) {
      prev = step;
      step += Math.floor(Math.sqrt(n));
      if (prev >= n) return -1;
    }

    while (compare(arr[prev], target) < 0) {
      prev++;
      if (prev === Math.min(step, n)) return -1;
    }

    if (compare(arr[prev], target) === 0) return prev;
    return -1;
  }

  /**
   * Exponential Search - O(log n)
   */
  public static exponentialSearch<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    if (arr.length === 0) return -1;

    if (compare(arr[0], target) === 0) return 0;

    let i = 1;
    while (i < arr.length && compare(arr[i], target) <= 0) {
      i *= 2;
    }

    return this.binarySearch(
      arr, 
      target, 
      compare
    );
  }
}

// Search utilities and advanced patterns
export class SearchUtils {
  public static findFirstOccurrence<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    let left = 0;
    let right = arr.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const comparison = compare(arr[mid], target);

      if (comparison === 0) {
        result = mid;
        right = mid - 1; // Continue searching left
      } else if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  public static findLastOccurrence<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    let left = 0;
    let right = arr.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const comparison = compare(arr[mid], target);

      if (comparison === 0) {
        result = mid;
        left = mid + 1; // Continue searching right
      } else if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return result;
  }

  public static findClosestElement<T>(
    arr: T[], 
    target: T, 
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0,
    distance: (a: T, b: T) => number
  ): number {
    if (arr.length === 0) return -1;

    let left = 0;
    let right = arr.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);

      if (compare(arr[mid], target) < 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Check which of left or left-1 is closer
    if (left > 0 && distance(arr[left - 1], target) < distance(arr[left], target)) {
      return left - 1;
    }

    return left;
  }
}
