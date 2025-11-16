/**
 * Graph implementation with adjacency list
 * Supports directed/undirected graphs and various algorithms
 */

export interface GraphNode {
  id: string;
  data: any;
  visited: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

export class Graph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge[]> = new Map();
  private isDirected: boolean;

  constructor(isDirected: boolean = false) {
    this.isDirected = isDirected;
  }

  public addNode(id: string, data: any = null): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, data, visited: false });
      this.edges.set(id, []);
    }
  }

  public addEdge(from: string, to: string, weight: number = 1): void {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      throw new Error('Both nodes must exist in the graph');
    }

    const fromEdges = this.edges.get(from) || [];
    fromEdges.push((
    fromEdges.push({ from, to, weight });

    if (!this.isDirected) {
      const toEdges = this.edges.get(to) || [];
      toEdges.push({ from: to, to: from, weight });
    }
  }

  public removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;

    this.nodes.delete(id);
    this.edges.delete(id);

    // Remove all edges pointing to this node
    for (const [nodeId, edges] of this.edges) {
      this.edges.set(nodeId, edges.filter(edge => edge.to !== id));
    }

    return true;
  }

  public getNeighbors(id: string): GraphEdge[] {
    return this.edges.get(id) || [];
  }

  public depthFirstSearch(startId: string, callback: (node: GraphNode) => void): void {
    this.clearVisited();
    this.dfs(startId, callback);
  }

  private dfs(nodeId: string, callback: (node: GraphNode) => void): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.visited) return;

    node.visited = true;
    callback(node);

    const neighbors = this.getNeighbors(nodeId);
    for (const neighbor of neighbors) {
      this.dfs(neighbor.to, callback);
    }
  }

  public breadthFirstSearch(startId: string, callback: (node: GraphNode) => void): void {
    this.clearVisited();
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const currentNodeId = queue.shift() !;
      const currentNode = this.nodes.get(currentNodeId);

      if (currentNode && !currentNode.visited) {
        currentNode.visited = true;
        callback(currentNode);

        const neighbors = this.getNeighbors(currentNodeId);
        for (const neighbor of neighbors) {
          if (!this.nodes.get(neighbor.to)?.visited) {
            queue.push(neighbor.to);
          }
        }
      }
    }
  }

  public dijkstra(startId: string, endId: string): { path: string[]; distance: number } | null {
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) return null;

    const distances: Map<string, number> = new Map();
    const previous: Map<string, string | null> = new Map();
    const unvisited: Set<string> = new Set();

    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
      unvisited.add(nodeId);
    }

    distances.set(startId, 0);

    while (unvisited.size > 0) {
      const currentNodeId = this.getMinDistanceNode(unvisited, distances);
      if (!currentNodeId) break;

      unvisited.delete(currentNodeId);

      if (currentNodeId === endId) {
        return this.buildPath(previous, endId);
      }

      const neighbors = this.getNeighbors(currentNodeId);
      for (const neighbor of neighbors) {
        if (unvisited.has(neighbor.to)) {
          const alt = distances.get(currentNodeId) ! + neighbor.weight;
          if (alt < (distances.get(neighbor.to) || Infinity)) {
            distances.set(neighbor.to, alt);
            previous.set(neighbor.to, currentNodeId);
          }
        }
      }
    }

    return null;
  }

  private getMinDistanceNode(unvisited: Set<string>, distances: Map<string, number>): string | null {
    let minDistance = Infinity;
    let minNode: string | null = null;

    for (const nodeId of unvisited) {
      const distance = distances.get(nodeId) || Infinity;
      if (distance < minDistance) {
        minDistance = distance;
        minNode = nodeId;
      }
    }

    return minNode;
  }

  private buildPath(previous: Map<string, string | null>, endId: string): { path: string[]; distance: number } {
    const path: string[] = [];
    let current: string | null = endId;
    let distance = 0;

    while (current !== null) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev) {
        const edges = this.getNeighbors(prev);
        const edge = edges.find(e => e.to === current);
        if (edge) distance += edge.weight;
      }
      current = prev;
    }

    return { path, distance };
  }

  private clearVisited(): void {
    for (const node of this.nodes.values()) {
      node.visited = false;
    }
  }

  public hasCycle(): boolean {
    this.clearVisited();
    const recStack: Set<string> = new Set();

    for (const nodeId of this.nodes.keys()) {
      if (this.isCyclicUtil(nodeId, recStack)) {
        return true;
      }
    }

    return false;
  }

  private isCyclicUtil(nodeId: string, recStack: Set<string>): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    if (!node.visited) {
      node.visited = true;
      recStack.add(nodeId);

      const neighbors = this.getNeighbors(nodeId);
      for (const neighbor of neighbors) {
        if (!this.nodes.get(neighbor.to)?.visited && this.isCyclicUtil(neighbor.to, recStack)) {
          return true;
        } else if (recStack.has(neighbor.to)) {
          return true;
        }
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  public toString(): string {
    let result = '';
    for (const [nodeId, edges] of this.edges) {
      result += `${nodeId} -> ${edges.map(e => e.to).join(', ')}\n`;
    }
    return result;
  }
}

// Example usage and specialized graphs
export class WeightedGraph extends Graph {
  constructor(isDirected: boolean = false) {
    super(isDirected);
  }

  public findMinimumSpanningTree(): GraphEdge[] {
    // Prim's algorithm implementation
    const mst: GraphEdge[] = [];
    const visited: Set<string> = new Set();
    const edges: GraphEdge[] = [];

    // Start with first node
    const firstNode = Array.from(this.nodes.keys())[0];
    if (!firstNode) return [];

    visited.add(firstNode);
    edges.push(...this.getNeighbors(firstNode));

    while (visited.size < this.nodes.size && edges.length > 0) {
      // Find minimum weight edge connecting visited to unvisited
      edges.sort((a, b) => a.weight - b.weight);
      const minEdge = edges.shift() !;

      if (!visited.has(minEdge.to)) {
        visited.add(minEdge.to);
        mst.push(minEdge);
        edges.push(...this.getNeighbors(minEdge.to)
          .filter(edge => !visited.has(edge.to)));
      }
    }

    return mst;
  }
}
