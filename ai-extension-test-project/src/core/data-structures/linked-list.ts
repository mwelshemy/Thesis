/**
 * Singly and Doubly Linked List implementations
 */

export interface ListNode<T> {
  value: T;
  next: ListNode<T> | null;
  prev?: ListNode<T> | null; // For doubly linked list
}

export class LinkedList<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private size: number = 0;

  public append(value: T): void {
    const newNode: ListNode<T> = { value, next: null };
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail!.next = newNode;
      this.tail = newNode;
    }
    this.size++;
  }

  public prepend(value: T): void {
    const newNode: ListNode<T> = { value, next: this.head };
    this.head = newNode;
    if (!this.tail) {
      this.tail = newNode;
    }
    this.size++;
  }

  public delete(value: T): boolean {
    if (!this.head) return false;

    if (this.head.value === value) {
      this.head = this.head.next;
      if (!this.head) {
        this.tail = null;
      }
      this.size--;
      return true;
    }

    let current = this.head;
    while (current.next) {
      if (current.next.value === value) {
        current.next = current.next.next;
        if (!current.next) {
          this.tail = current;
        }
        this.size--;
        return true;
      }
      current = current.next;
    }
    return false;
  }

  public find(value: T): ListNode<T> | null {
    let current = this.head;
    while (current) {
      if (current.value === value) return current;
      current = current.next;
    }
    return null;
  }

  public toArray(): T[] {
    const result: T[] = [];
    let current = this.head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }

  public getSize(): number {
    return this.size;
  }

  public isEmpty(): boolean {
    return this.size === 0;
  }
}
