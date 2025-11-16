/**
 * Hash Table implementation with separate chaining
 */

interface HashNode<K, V> {
  key: K;
  value: V;
  next: HashNode<K, V> | null;
}

export class HashTable<K, V> {
  private buckets: Array<HashNode<K, V> | null>;
  private size: number;
  private capacity: number;
  private loadFactor: number = 0.75;

  constructor(capacity: number = 16) {
    this.capacity = capacity;
    this.buckets = new Array(capacity).fill(null);
    this.size = 0;
  }

  private hash(key: K): number {
    const keyString = String(key);
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
      hash = (hash << 5) - hash + keyString.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % this.capacity;
  }

  public put(key: K, value: V): void {
    const index = this.hash(key);
    let currentNode = this.buckets[index];

    // Update existing key
    while (currentNode !== null) {
      if (currentNode.key === key) {
        currentNode.value = value;
        return;
      }
      currentNode = currentNode.next;
    }

    // Insert new key
    const newNode: HashNode<K, V> = { key, value, next: this.buckets[index] };
    this.buckets[index] = newNode;
    this.size++;

    // Check if resizing is needed
    if (this.size / this.capacity > this.loadFactor) {
      this.resize();
    }
  }

  public get(key: K): V | undefined {
    const index = this.hash(key);
    let currentNode = this.buckets[index];

    while (currentNode !== null) {
      if (currentNode.key === key) {
        return currentNode.value;
      }
      currentNode = currentNode.next;
    }

    return undefined;
  }

  public remove(key: K): boolean {
    const index = this.hash(key);
    let currentNode = this.buckets[index];
    let previousNode: HashNode<K, V> | null = null;

    while (currentNode !== null) {
      if (currentNode.key === key) {
        if (previousNode === null) {
          this.buckets[index] = currentNode.next;
        } else {
          previousNode.next = currentNode.next;
        }
        this.size--;
        return true;
      }
      previousNode = currentNode;
      currentNode = currentNode.next;
    }

    return false;
  }

  public contains(key: K): boolean {
    return this.get(key) !== undefined;
  }

  private resize(): void {
    const oldBuckets = this.buckets;
    this.capacity *= 2;
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;

    for (const bucket of oldBuckets) {
      let currentNode = bucket;
      while (currentNode !== null) {
        this.put(currentNode.key, currentNode.value);
        currentNode = currentNode.next;
      }
    }
  }

  public getSize(): number {
    return this.size;
  }

  public isEmpty(): boolean {
    return this.size === 0;
  }

  public keys(): K[] {
    const keys: K[] = [];
    for (const bucket of this.buckets) {
      let currentNode = bucket;
      while (currentNode !== null) {
        keys.push(currentNode.key);
        currentNode = currentNode.next;
      }
    }
    return keys;
  }

  public values(): V[] {
    const values: V[] = [];
    for (const bucket of this.buckets) {
      let currentNode = bucket;
      while (currentNode !== null) {
        values.push(currentNode.value);
        currentNode = currentNode.next;
      }
    }
    return values;
  }

  public entries(): [K, V][] {
    const entries: [K, V][] = [];
    for (const bucket of this.buckets) {
      let currentNode = bucket;
      while (currentNode !== null) {
        entries.push([currentNode.key, currentNode.value]);
        currentNode = currentNode.next;
      }
    }
    return entries;
  }

  public clear(): void {
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;
  }
}

// Specialized hash table with custom hash function
export class StringHashTable<V> extends HashTable<string, V> {
  private customHash(key: string): number {
    // DJB2 hash function
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) + hash + key.charCodeAt(i);
    }
    return Math.abs(hash) % this.capacity;
  }
}
