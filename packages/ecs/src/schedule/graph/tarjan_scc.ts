import { DiGraph } from "./graphmap";
import { NodeId } from "./node";
import { type Option, u32 } from "joshkaposh-option";
import { done, item, iter, Iterator } from "joshkaposh-iterator";

type NodeData<N extends Iterator<NodeId>> = {
    root_index: number | undefined // NonZeroUsize;
    neighbors: N;
}

export function new_tarjan_scc(graph: DiGraph) {
    const unchecked_nodes = graph.nodes();

    // For each node we need to visit, we also need to visit its neighbors.
    // Storing the iterator for each set of neighbors allows this list to be computed without an additional allocation
    const nodes = graph
        .nodes()
        .map(node => ({
            root_index: undefined,
            neighbors: graph.iter_neighbors(node)
        }))
        .collect();

    return new TarjanScc(
        graph,
        unchecked_nodes,
        1, // Invariant: index < component_count at all tunes
        u32.MAX, // Will hold is component_count is initialized to number of nodes - 1 or higher
        nodes,
        [],
        [],
        undefined,
        undefined
    )

}

class TarjanScc<AllNodes extends Iterator<NodeId>, Neighbors extends Iterator<NodeId>> extends Iterator<[NodeId, NodeId, NodeId, NodeId]> {
    // Source of truth
    #graph: DiGraph
    // An iterator of NodeIds from the graph which may not have been visited yet.
    #unchecked_nodes: AllNodes;
    // index of the next SCC
    #index: number;
    // count of potentially remaining SCCs
    #component_count: number;
    // Information about each NodeId, including a possible SCC index and an Iterator of possibly unvisited neighbors.
    #nodes: NodeData<Neighbors>[];
    // Stack of NodeIds where a SCC will be found starting at the top of the stack
    #stack: NodeId[];
    // Stack of NodIds which need to be visited to determine which SCC they belong to.
    #visitation_stack: Array<[NodeId, boolean]>;
    // index into the stick indicating the starting point of an SCC.
    #start: Option<number>;
    // adjustment to the index which will be appliec once the current SCC is found.
    #index_adjustment: Option<number>;

    constructor(
        graph: DiGraph,
        unchecked_nodes: AllNodes,
        index: number,
        component_count: number,
        nodes: NodeData<Neighbors>[],
        stack: NodeId[],
        visitation_stack: Array<[NodeId, boolean]>,
        start: Option<number>,
        index_adjustment: Option<number>
    ) {
        super();
        this.#graph = graph;
        this.#unchecked_nodes = unchecked_nodes;
        this.#index = index;
        this.#component_count = component_count;
        this.#nodes = nodes;
        this.#stack = stack;
        this.#visitation_stack = visitation_stack;
        this.#start = start;
        this.#index_adjustment = index_adjustment;
    }

    into_iter(): Iterator<[NodeId, NodeId, NodeId, NodeId]> {
        return this;
    }

    /**
     * Compute the next *strongly connected component* using algorithm 3 in
     * [A Space-Efficient Algorithm for Finding Strongly Connected Components] by David J. Pierce,
     * which is a memory-efficient variation of Tarjan's algorithm
     * 
     * Returns NodeId[] for each strongly connected component (SCC).
     * The order of node ids within each SCC is arbitrary, but the order the SCCs is their post-order (reverse topological sort).
     */
    next(): IteratorResult<[NodeId, NodeId, NodeId, NodeId], any> {
        // cleanup from previous iterations
        const start = this.#start;
        this.#start = undefined;

        const index_adjustment = this.#index_adjustment;
        this.#index_adjustment = undefined;

        if (start != null && index_adjustment != null) {
            this.#stack.length = start;
            this.#index -= index_adjustment;
            this.#component_count -= 1;
        }

        while (true) {
            /**
             * If there are items on the visitation stack, then we haven't finished visiting
             * the node at the bottom of the stack yet.
             * Must visit all nodes in the stack from top to bottom before visiting the next node.
             */
            const vstack = this.#visitation_stack;
            let n: [NodeId, boolean];
            while (n = vstack.pop()!) {
                const [v, v_is_local_root] = n;
                const start = this.visit_once(v, v_is_local_root);
                // If this visitation finds a complete SCC, return it.
                if (start != null) {
                    return item(this.#stack.slice(start) as [NodeId, NodeId, NodeId, NodeId]);
                }
            }

            // Get the next node to check, otherwise we're done and can early exit
            const node = this.#unchecked_nodes.next();

            if (node.done) {
                return done();
            }

            const visited = this.#nodes[this.#graph.to_index(node.value)].root_index != null;
            if (!visited) {
                vstack.push([node.value, true]);
            }
        }
    }


    /**
     * Attempt to find the starting point on the stack for a new SCC without visiting neighbours.
     * If a visitation is required, this will return `done()` and mark the required neighbour and the current node for visitation again.
     * If no SCC can be found in the current visitation stack, return `done()`.
     */
    visit_once(v: NodeId, v_is_local_root: boolean) {
        const node_v = this.#nodes[this.#graph.to_index(v)];
        if (node_v.root_index == null) {
            const v_index = this.#index;
            node_v.root_index = v_index;
            this.#index += 1;
        }

        let w;
        while (!(w = this.#nodes[this.#graph.to_index(v)].neighbors.next()).done) {
            const w_value = w.value;

            if (this.#nodes[this.#graph.to_index(w.value)].root_index == null) {
                // If neighbor hasn't been visited yet,
                // Push the current node and the neigbor back onto the visitation stack.
                // On the next execution of `visit_once`, the neighbor will be visited.
                this.#visitation_stack.push([v, v_is_local_root]);
                this.#visitation_stack.push([w_value, true]);
                return
            }
            const node_w = this.#nodes[this.#graph.to_index(w_value)];
            const node_v = this.#nodes[this.#graph.to_index(v)];

            if (
                node_w.root_index!
                < node_v.root_index!
            ) {
                node_v.root_index = node_w.root_index;
                v_is_local_root = false;
            }
        }

        if (!v_is_local_root) {
            this.#stack.push(v);
            return;
        }

        let index_adjustment = 1;
        let c = this.#component_count;
        const nodes = this.#nodes;
        const i = iter(this.#stack)
            .rposition(w => {
                if (node_v.root_index! > (nodes[this.#graph.to_index(w)].root_index!)) {
                    return true
                } else {
                    index_adjustment += 1;
                    return false
                }
            })

        const start = i != null ? i + 1 : 0;
        node_v.root_index = c;
        this.#stack.push(v);
        this.#start = start;
        this.#index_adjustment = index_adjustment;

        return start;
    }

    size_hint(): [number, Option<number>] {
        return [0, this.#nodes.length]
    }

}