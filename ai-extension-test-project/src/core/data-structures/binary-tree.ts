/**
 * Binary Search Tree implementation with advanced operations
 * Supports insertion, deletion, traversal, and balancing
 */

export interface TreeNode<T> {
  value: T;
  left: TreeNode<T> | null;
  right: TreeNode<T> | null;
  height: number;
  parent?: TreeNode<T> | null;
}

export class BinarySearchTree<T> {
  private root: TreeNode<T> | null;
  private comparator: (a: T, b: T) => number;

  constructor(comparator?: (a: T, b: T) => number) {
    this.root = null;
    this.comparator = comparator || this.defaultComparator;
  }

  private defaultComparator(a: T, b: T): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Insert a value into the BST
   * @param value - The value to insert
   * @returns The inserted node
   */
  public insert(value: T): TreeNode<T> {
    const newNode: TreeNode<T> = {
      value,
      left: null,
      right: null,
      height: 1
    };

    if (!this.root) {
      this.root = newNode;
      return newNode;
    }

    return this.insertNode(this.root, newNode);
  }

  private insertNode(node: TreeNode<T>, newNode: TreeNode<T>): TreeNode<T> {
    const comparison = this.comparator(newNode.value, node.value);

    if (comparison < 0) {
      if (node.left === null) {
        node.left = newNode;
        newNode.parent = node;
      } else {
        return this.insertNode(node.left, newNode);
      }
    } else if (comparison > 0) {
      if (node.right === null) {
        node.right = newNode;
        newNode.parent = node;
      } else {
        return this.insertNode(node.right, newNode);
      }
    } else {
      // Handle duplicate values (implementation specific)
      node.value = newNode.value;
      return node;
    }

    this.updateHeight(node);
    return newNode;
  }

  /**
   * Search for a value in the BST
   * @param value - The value to search for
   * @returns The node containing the value, or null if not found
   */
  public search(value: T): TreeNode<T> | null {
    return this.searchNode(this.root, value);
  }

  private searchNode(node: TreeNode<T> | null, value: T): TreeNode<T> | null {
    if (!node) return null;

    const comparison = this.comparator(value, node.value);

    if (comparison === 0) return node;
    if (comparison < 0) return this.searchNode(node.left, value);
    return this.searchNode(node.right, value);
  }

  /**
   * Delete a value from the BST
   * @param value - The value to delete
   * @returns True if deletion was successful
   */
  public delete(value: T): boolean {
    if (!this.root) return false;

    const nodeToDelete = this.search(value);
    if (!nodeToDelete) return false;

    this.root = this.deleteNode(this.root, value);
    return true;
  }

  private deleteNode(node: TreeNode<T> | null, value: T): TreeNode<T> | null {
    if (!node) return null;

    const comparison = this.comparator(value, node.value);

    if (comparison < 0) {
      node.left = this.deleteNode(node.left, value);
    } else if (comparison > 0) {
      node.right = this.deleteNode(node.right, value);
    } else {
      // Node to be deleted found
      if (!node.left && !node.right) {
        // Case 1: No children
        return null;
      } else if (!node.left) {
        // Case 2: Only right child
        return node.right;
      } else if (!node.right) {
        // Case 3: Only left child
        return node.left;
      } else {
        // Case 4: Two children
        const successor = this.findMin(node.right);
        node.value = successor.value;
        node.right = this.deleteNode(node.right, successor.value);
      }
    }

    this.updateHeight(node);
    return node;
  }

  private findMin(node: TreeNode<T>): TreeNode<T> {
    let current = node;
    while (current.left) {
      current = current.left;
    }
    return current;
  }

  private updateHeight(node: TreeNode<T>): void {
    node.height = Math.max(
      this.getHeight(node.left),
      this.getHeight(node.right)
    ) + 1;
  }

  private getHeight(node: TreeNode<T> | null): number {
    return node ? node.height : 0;
  }

  // Traversal methods
  public inOrderTraversal(): T[] {
    const result: T[] = [];
    this.inOrder(this.root, result);
    return result;
  }

  private inOrder(node: TreeNode<T> | null, result: T[]): void {
    if (!node) return;
    this.inOrder(node.left, result);
    result.push(node.value);
    this.inOrder(node.right, result);
  }

  public preOrderTraversal(): T[] {
    const result: T[] = [];
    this.preOrder(this.root, result);
    return result;
  }

  private preOrder(node: TreeNode<T> | null, result: T[]): void {
    if (!node) return;
    result.push(node.value);
    this.preOrder(node.left, result);
    this.preOrder(node.right, result);
  }

  /**
   * Check if the tree is balanced
   * @returns True if the height difference between subtrees is <= 1
   */
  public isBalanced(): boolean {
    return this.checkBalance(this.root);
  }

  private checkBalance(node: TreeNode<T> | null): boolean {
    if (!node) return true;

    const leftHeight = this.getHeight(node.left);
    const rightHeight = this.getHeight(node.right);

    if (Math.abs(leftHeight - rightHeight) > 1) return false;

    return this.checkBalance(node.left) && this.checkBalance(node.right);
  }

  /**
   * Convert BST to sorted array
   */
  public toArray(): T[] {
    return this.inOrderTraversal();
  }

  /**
   * Get the size of the tree
   */
  public size(): number {
    return this.countNodes(this.root);
  }

  private countNodes(node: TreeNode<T> | null): number {
    if (!node) return 0;
    return 1 + this.countNodes(node.left) + this.countNodes(node.right);
  }
}

// Factory function for creating BST from array
export function createBSTFromArray<T>(values: T[]): BinarySearchTree<T> {
  const bst = new BinarySearchTree<T>();
  values.forEach(value => bst.insert(value));
  return bst;
}

// Example usage and complex patterns
export class AdvancedBST<T> extends BinarySearchTree<T> {
  private nodeCount: number = 0;

  constructor(comparator?: (a: T, b: T) => number) {
    super(comparator);
  }

  /**
   * Find the kth smallest element
   */
  public findKthSmallest(k: number): T | null {
    const result: { count: number; value: T | null } = { count: 0, value: null };
    this.inOrderKth(this.root, k, result);
    return result.value;
  }

  private inOrderKth(
    node: TreeNode<T> | null, 
    k: number, 
    result: { count: number; value: T | null }
  ): void {
    if (!node || result.value !== null) return;

    this.inOrderKth(node.left, k, result);

    result.count++;
    if (result.count === k) {
      result.value = node.value;
      return;
    }

    this.inOrderKth(node.right, k, result);
  }

  /**
   * Find the lowest common ancestor of two values
   */
  public findLCA(value1: T, value2: T): TreeNode<T> | null {
    return this.findLCANode(this.root, value1, value2);
  }

  private findLCANode(
    node: TreeNode<T> | null, 
    value1: T, 
    value2: T
  ): TreeNode<T> | null {
    if (!node) return null;

    const comp1 = this.comparator(value1, node.value);
    const comp2 = this.comparator(value2, node.value);

    if (comp1 < 0 && comp2 < 0) {
      return this.findLCANode(node.left, value1, value2);
    } else if (comp1 > 0 && comp2 > 0) {
      return this.findLCANode(node.right, value1, value2);
    } else {
      return node;
    }
  }
}
