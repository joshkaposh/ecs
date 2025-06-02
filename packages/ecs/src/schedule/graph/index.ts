import { type Iterator } from 'joshkaposh-iterator';
import { assert } from 'joshkaposh-iterator/src/util';
import { FixedBitSet } from 'fixed-bit-set';
import type { InternedSystemSet, SystemSet } from '../set';
import { NodeId } from './node';
import { DiGraph, Direction, Incoming, Outgoing } from './graphmap';
import { entry, TypeId } from '../../util';

export * from './node';
export * from './graphmap';
export { new_tarjan_scc } from './tarjan_scc';

export type DependencyKind = typeof DependencyKind[keyof typeof DependencyKind];
export const DependencyKind = {
    // node should be preceded
    Before: 0,
    // node should be succeeded
    After: 1,
} as const

export class Dependency {
    kind: DependencyKind;
    set: InternedSystemSet;
    options: Map<any, any>;
    constructor(kind: DependencyKind, set: InternedSystemSet) {
        this.kind = kind;
        this.set = set;
        this.options = new Map();
    }

    add_config(option: TypeId) {
        this.options.set(option.type_id, option);
        return this;
    }
}

export type Ambiguity = 0 | 1 | SystemSet[]
export const Ambiguity = {
    Check: 0,
    IgnoreWithSet(set: SystemSet) {
        return [set]
    },
    IgnoreAll: 1,

    default(): Ambiguity {
        return this.Check as Ambiguity;
    }
} as const

export type GraphInfo = {
    hierarchy: InternedSystemSet[];
    dependencies: Dependency[];
    ambiguous_with: Ambiguity
}

/**
 * Converts a 2d row-majoy pair of indices into a 1d array index
 */
export function index(row: number, col: number, num_cols: number) {
    assert(col < num_cols);
    return (row * num_cols) + col;
}


/**
 * Converts a 1d array index into a 2d row-major pair of indices
 */
export function row_col(index: number, num_cols: number): [number, number] {
    return [Math.floor(index / num_cols), Math.floor(index % num_cols)]
}

type ConnectedNodes = `${`${'system' | 'set'}:${number}`}-${`${'system' | 'set'}:${number}`}`
type Connected = Set<ConnectedNodes>;

export type CheckGraphResults = {
    reachable: FixedBitSet;
    connected: Connected;
    disconnected: Array<[NodeId, NodeId]>;
    transitive_edges: Array<[NodeId, NodeId]>;
    transitive_reduction: DiGraph;
    transitive_closure: DiGraph;
}

export function check_graph(graph: DiGraph, topological_order: NodeId[]): CheckGraphResults {
    const n = graph.node_count();
    if (n === 0) {
        return {
            reachable: FixedBitSet.default(),
            connected: new Set(),
            disconnected: [],
            transitive_edges: [],
            transitive_reduction: DiGraph(),
            transitive_closure: DiGraph(),
        }
    }

    // build a copy of the graph where the nodes and edges appear in topsorted order
    const map = new Map<string, number>();
    const topsorted = DiGraph();

    for (let i = 0; i < topological_order.length; i++) {
        const node = topological_order[i];
        map.set(node.to_primitive(), i);
        topsorted.add_node(node);

        // insert nodes as successors to their predecessors
        const predecessors = graph.neighbors_directed(node, Incoming)
        for (let j = 0; j < predecessors.length; j++) {
            topsorted.add_edge(predecessors[j], node);
        }
    }

    const reachable = FixedBitSet.with_capacity(n * n);
    const connected: Connected = new Set();
    const disconnected: [NodeId, NodeId][] = [];

    const transitive_edges: [NodeId, NodeId][] = [];
    const transitive_reduction = DiGraph();
    const transitive_closure = DiGraph();

    const visited = FixedBitSet.with_capacity(n);

    for (const node of topsorted.nodes()) {
        transitive_reduction.add_node(node)
        transitive_closure.add_node(node)
    }


    // iterate nodes in reverse topological order
    for (const a of topsorted.nodes().rev()) {
        const index_a = map.get(a.to_primitive())!;
        // iterate their successors in topological order
        const b_array = topsorted.neighbors_directed(a, Outgoing);
        for (let i = 0; i < b_array.length; i++) {
            const b = b_array[i];
            const index_b = map.get(b.to_primitive())!;
            assert(index_a < index_b, `index a ${index_a} must be less than index b ${index_b}`);

            if (!visited.contains(index_b)) {
                // edge <a, b> is not redundant
                transitive_reduction.add_edge(a, b);
                transitive_closure.add_edge(a, b);
                reachable.insert(index(index_a, index_b, n))

                const successors = transitive_closure.neighbors_directed(b, Direction.Outgoing())
                for (let j = 0; j < successors.length; j++) {
                    const c = successors[j];
                    const index_c = map.get(c.to_primitive())!;

                    assert(index_b < index_c);
                    if (!visited.contains(index_c)) {
                        visited.insert(index_c);
                        transitive_closure.add_edge(a, c);
                        reachable.insert(index(index_a, index_c, n));
                    }
                }
            } else {
                // edge <a, b> is redundant
                transitive_edges.push([a, b])
            }
        }

        visited.clear();
    }

    // partition pairs of nodes into "connected by path" and "not connected by path"
    for (let i = 0; i < n - 1; i++) {
        for (let ix = index(i, i + 1, n); ix <= index(i, n - 1, n); ix++) {
            const [a, b] = row_col(ix, n)
            const pair = [topological_order[a], topological_order[b]] as [NodeId, NodeId]
            if (reachable.contains(ix)) {
                connected.add(pair.join('-') as ConnectedNodes);
            } else {
                disconnected.push(pair);
            }

        }

    }

    return {
        reachable,
        connected,
        disconnected,
        transitive_edges,
        transitive_reduction,
        transitive_closure
    }
}

export function simple_cycles_in_component(graph: DiGraph, scc: NodeId[]): [NodeId, NodeId][] {
    const cycles: [NodeId, NodeId][] = [];
    const sccs = [scc];

    while (scc = sccs.pop()!) {
        const subgraph = DiGraph();
        for (let i = 0; i < scc.length; i++) {
            subgraph.add_node(scc[i])
        }

        for (let i = 0; i < scc.length; i++) {
            const node = scc[i];
            for (const succ of graph.neighbors(node)) {
                if (subgraph.contains_node(succ)) {
                    subgraph.add_edge(node, succ)
                }
            }
        }

        // path of nodes that may form a cycle
        const path = [];
        // we mark nodes as blocked to avoid finding permutations of the same cycles
        const blocked = new Set<NodeId>();
        // connects nodes along path segments that can't be part of a cycle (given current root)
        // those nodes can be unblocked at the same time
        const unblock_together = new Map<NodeId, Set<NodeId>>();
        // stack for ublocking nodes
        const unblock_stack: NodeId[] = [];
        // nodes can be involved in multiple cycles
        const maybe_in_more_cycles = new Set<NodeId>();
        // DFS stack
        const stack: [NodeId, Iterator<NodeId>][] = [];

        const root = scc.pop()!;
        path.length = 0;
        path.push(root);
        // mark this node as blocked
        blocked.add(root)

        // DFS
        stack.length = 0;
        stack.push([root, subgraph.iter_neighbors(root)]);

        while (stack.length !== 0) {
            const [node, successors] = stack[stack.length - 1];

            const { done, value: next } = successors.next();
            if (!done) {
                if (next.eq(root)) {
                    // found a cycle
                    for (let i = 0; i < path.length; i++) {
                        maybe_in_more_cycles.add(path[i])
                    }
                    cycles.push(...path as unknown as [NodeId, NodeId][])

                } else if (!blocked.has(next)) {
                    // first time seeing `next` on this path
                    maybe_in_more_cycles.delete(next);
                    path.push(next);
                    blocked.add(next);
                    stack.push([next, subgraph.iter_neighbors(next)])
                    continue
                }
            }

            if (successors.peekable().peek().done) {
                unblock_stack.push(node);
                if (maybe_in_more_cycles.has(node)) {
                    let n;
                    while (n = unblock_stack.pop()!) {
                        if (blocked.delete(n)) {
                            const unblocked_predecessors = entry(unblock_together, n, () => new Set())
                            unblock_stack.push(...unblocked_predecessors)
                            unblocked_predecessors.clear();
                        }
                    }
                } else {
                    // if its descendants can be unblocked later, this node will be too
                    const successors = subgraph.neighbors(node);
                    for (let i = 0; i < successors.length; i++) {
                        entry(unblock_together, successors[i], () => new Set()).add(node)
                    }
                }
                // remove node from path and DFS stack
                path.pop();
                stack.pop();
            }
        }

        stack.length = 0;

        subgraph.remove_node(root);
        // divide remainder into smaller SCCs
        sccs.push(...subgraph.iter_sccs().filter(scc => scc.length > 1))
    }

    return cycles
}