import { assert } from 'joshkaposh-iterator/src/util';
import { InternedSystemSet, SystemSet } from '../set';
import { FixedBitSet } from 'fixed-bit-set';
import { NodeId } from './node';
import { DiGraph, Direction, Incoming } from './graphmap';
import { iter, Iterator, range } from 'joshkaposh-iterator';
import { is_some } from 'joshkaposh-option';
import { extend } from 'joshkaposh-index-map/src/util';

export * from './node';
export * from './graphmap'
export { new_tarjan_scc } from './tarjan_scc'

export type DependencyKind = 0 | 1 | 2 | 3;
export const DependencyKind = {
    // node should be preceded
    Before: 0,
    // node should be succeeded
    After: 2,
    // node that should be preceded and will NOT automatically insert an instance of `ApplyDeferred on the edge`
    BeforeNoSync: 1,
    // node that should be succeeded and will NOT automatically insert an instance of `ApplyDeferred on the edge`
    AfterNoSync: 3,
} as const

export type Dependency = {
    kind: DependencyKind;
    set: SystemSet;
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

export type CheckGraphResults = {
    reachable: FixedBitSet;
    connected: Set<[NodeId, NodeId]>;
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

    // console.log('check_graph() received topological order', topological_order);


    // build a copy of the graph where the nodes and edges appear in topsorted order
    const map = new Map<string, number>();
    const topsorted = DiGraph();

    for (let i = 0; i < topological_order.length; i++) {
        const node = topological_order[i];
        map.set(node.to_primitive(), i);
        topsorted.add_node(node);

        // insert nodes as successors to their predecessors
        for (const pred of graph.neighbors_directed(node, Incoming)) {
            topsorted.add_edge(pred, node);
        }
    }

    const reachable = FixedBitSet.with_capacity(n * n);
    const connected = new Set<[NodeId, NodeId]>();
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
        for (const b of topsorted.neighbors_directed(a, Direction.Outgoing())) {
            const index_b = map.get(b.to_primitive())!;
            // console.log('check_graph topsorted', b, index_b);

            if (!visited.contains(index_b)) {
                // edge <a, b> is not redundant
                transitive_reduction.add_edge(a, b);
                transitive_closure.add_edge(a, b);
                reachable.insert(index(index_a, index_b, n))

                const successors = transitive_closure
                    .neighbors_directed(b, Direction.Outgoing())
                    .collect()

                for (const c of successors) {
                    const index_c = map.get(c.to_primitive())!;
                    assert(index_b < index_c)
                    if (!visited.contains(index_c)) {
                        visited.insert(index_c);
                        transitive_closure.add_edge(a, c);
                        reachable.insert(index(index_a, index_c, n))
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
                connected.add(pair)
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

export function simple_cycles_in_component(graph: DiGraph, scc: NodeId[]) {
    const cycles = [];
    const sccs = [scc];

    while (is_some(scc = sccs.pop()!)) {
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
        const unblock_stack = [];
        // nodes can be involved in multiple cycles
        const maybe_in_more_cycles = new Set<NodeId>();
        // DFS stack
        const stack: [NodeId, Iterator<NodeId>][] = [];

        const root = scc.pop()!;
        path.length = 0;
        path.push(root);
        blocked.add(root)
        // DFS

        stack.length = 0;
        stack.push([root, subgraph.neighbors(root)])
        while (stack.length !== 0) {
            const [node, successors] = stack[stack.length - 1]
            const { done, value } = successors.next();
            const next = value;
            if (!done) {
                if (next === root) {
                    // found a cycle
                    extend(maybe_in_more_cycles, iter(path))
                    cycles.push(structuredClone(path))
                } else if (!blocked.has(next)) {
                    maybe_in_more_cycles.delete(next);
                    path.push(next);
                    blocked.add(next);
                    stack.push([next, subgraph.neighbors(next)])
                    continue
                }
            }

            if (successors.peekable().peek().done) {
                unblock_stack.push(node);
                let n
                while (is_some(n = unblock_stack.pop()!)) {
                    if (blocked.delete(n)) {
                        let unblocked_predecessors = unblock_together.get(n)!
                        if (!unblocked_predecessors) {
                            unblocked_predecessors = new Set()
                            unblock_together.set(n, unblocked_predecessors)
                        }

                        extend(unblock_stack, iter(unblocked_predecessors));
                        unblocked_predecessors.clear();
                    }
                }
            } else {
                for (const successor of subgraph.neighbors(node)) {
                    let s = unblock_together.get(successor);
                    if (!s) {
                        s = new Set();
                        unblock_together.set(successor, s);
                    }
                    s.add(node);
                }
            }
            // remove node from path and DFS stack
            path.pop();
            stack.pop();
        }
        subgraph.remove_node(root);

        extend(sccs, subgraph.iter_sccs().filter(scc => scc.length > 1))
    }

    return cycles
}