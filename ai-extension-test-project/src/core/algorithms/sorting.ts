/**
 * Various sorting algorithms implementation
 */

export class SortingAlgorithms {
  /**
   * Bubble Sort - O(n�)
   */
  public static bubbleSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    const array = [...arr];
    const n = array.length;

    for (let i = 0; i < n - 1; i++) {
      let swapped = false;

      for (let j = 0; j < n - i - 1; j++) {
        if (compare(array[j], array[j + 1]) > 0) {
          [array[j], array[j + 1]] = [array[j + 1], array[j]];
          swapped = true;
        }
      }

      if (!swapped) break;
    }

    return array;
  }

  /**
   * Quick Sort - O(n log n) average, O(n�) worst case
   */
  public static quickSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    if (arr.length <= 1) return arr;

    const pivot = arr[Math.floor(arr.length / 2)];
    const left: T[] = [];
    const right: T[] = [];
    const equal: T[] = [];

    for (const element of arr) {
      const comparison = compare(element, pivot);
      if (comparison < 0) {
        left.push(element);
      } else if (comparison > 0) {
        right.push(element);
      } else {
        equal.push(element);
      }
    }

    return [
      ...this.quickSort(left, compare),
      ...equal,
      ...this.quickSort(right, compare)
    ];
  }

  /**
   * Merge Sort - O(n log n)
   */
  public static mergeSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    if (arr.length <= 1) return arr;

    const mid = Math.floor(arr.length / 2);
    const left = this.mergeSort(arr.slice(0, mid), compare);
    const right = this.mergeSort(arr.slice(mid), compare);

    return this.merge(left, right, compare);
  }

  private static merge<T>(left: T[], right: T[], compare: (a: T, b: T) => number): T[] {
    const result: T[] = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
      if (compare(left[leftIndex], right[rightIndex]) <= 0) {
        result.push(left[leftIndex]);
        leftIndex++;
      } else {
        result.push(right[rightIndex]);
        rightIndex++;
      }
    }

    return [
      ...result,
      ...left.slice(leftIndex),
      ...right.slice(rightIndex)
    ];
  }

  /**
   * Heap Sort - O(n log n)
   */
  public static heapSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    const array = [...arr];
    const n = array.length;

    // Build max heap
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      this.heapify(array, n, i, compare);
    }

    // Extract elements from heap
    for (let i = n - 1; i > 0; i--) {
      [array[0], array[i]] = [array[i], array[0]];
      this.heapify(array, i, 0, compare);
    }

    return array;
  }

  private static heapify<T>(arr: T[], n: number, i: number, compare: (a: T, b: T) => number): void {
    let largest = i;
    const left = 2 * i + 1;
    const right = 2 * i + 2;

    if (left < n && compare(arr[left], arr[largest]) > 0) {
      largest = left;
    }

    if (right < n && compare(arr[right], arr[largest]) > 0) {
      largest = right;
    }

    if (largest !== i) {
      [arr[i], arr[largest]] = [arr[largest], arr[i]];
      this.heapify(arr, n, largest, compare);
    }
  }

  /**
   * Insertion Sort - O(n�) but efficient for small arrays
   */
  public static insertionSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    const array = [...arr];

    for (let i = 1; i < array.length; i++) {
      const key = array[i];
      let j = i - 1;

      while (j >= 0 && compare(array[j], key) > 0) {
        array[j + 1] = array[j];
        j--;
      }

      array[j + 1] = key;
    }

    return array;
  }

  /**
   * Selection Sort - O(n�)
   */
  public static selectionSort<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): T[] {
    const array = [...arr];

    for (let i = 0; i < array.length - 1; i++) {
      let minIndex = i;

      for (let j = i + 1; j < array.length; j++) {
        if (compare(array[j], array[minIndex]) < 0) {
          minIndex = j;
        }  
      }

      if (minIndex !== i) {
        [array[i], array[minIndex]] = [array[minIndex], array[i]];
      }
    }

    return array;
  }
}

// Utility functions for sorting
export class SortUtils {
  public static isSorted<T>(arr: T[], compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0): boolean {
    for (let i = 0; i < arr.length - 1; i++) {
      if (compare(arr[i], arr[i + 1]) > 0) {
        return false;
      }
    }
    return true;
  }

  public static generateRandomArray(size: number, min: number = 0, max: number = 100): number[] {
    return Array.from({ length: size }, () => Math.floor(Math.random() * (max - min + 1)) + min);
  }

  public static benchmarkSort<T>(
    arr: T[], 
    sortFn: (arr: T[], compare: (a: T, b: T) => number) => T[],
    compare: (a: T, b: T) => number = (a, b) => a < b ? -1 : a > b ? 1 : 0
  ): number {
    const start = performance.now();
    sortFn(arr, compare);
    const end = performance.now();
    return end - start;
  }
}
