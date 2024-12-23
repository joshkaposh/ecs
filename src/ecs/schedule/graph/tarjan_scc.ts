import { DiGraph } from "./graphmap";
import { NodeId } from "./node";
import { is_none, is_some, Option } from "joshkaposh-option";
import { done, item, iter, Iterator } from "joshkaposh-iterator";
import { truncate } from "../../../array-helpers";
import { u32 } from "../../../Intrinsics";

type NodeData<N extends Iterator<NodeId>> = {
    root_index: Option<number> // NonZeroUsize;
    neighbors: N;
}

export function new_tarjan_scc(graph: DiGraph) {
    const unchecked_nodes = graph.nodes();

    const nodes = graph
        .nodes()
        .map(node => ({
            root_index: undefined,
            neighbors: graph.neighbors(node)
        }))
        .collect();

    return new TarjanScc(
        graph,
        unchecked_nodes,
        1,
        u32.MAX,
        nodes,
        [],
        [],
        undefined,
        undefined
    )

}

class TarjanScc<AllNodes extends Iterator<NodeId>, Neighbors extends Iterator<NodeId>> extends Iterator<[NodeId, NodeId, NodeId, NodeId]> {
    #graph: DiGraph
    #unchecked_nodes: AllNodes;
    #index: number;
    #component_count: number;
    #nodes: NodeData<Neighbors>[];
    #stack: NodeId[];
    #visitation_stack: Array<[NodeId, boolean]>;
    #start: Option<number>;
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

    next_scc(): Option<NodeId[]> {

        // cleanup from previous iterations
        const start = this.#start;
        this.#start = undefined;

        const index_adjustment = this.#index_adjustment;
        this.#index_adjustment = undefined;

        if (is_some(start) && is_some(index_adjustment)) {
            truncate(this.#stack, start);
            this.#index -= index_adjustment;
            this.#component_count -= 1;
        }

        while (true) {
            let n;
            while (is_some(n = this.#visitation_stack.pop())) {
                const [v, v_is_local_root] = n;
                const start = this.visit_once(v, v_is_local_root);
                if (is_some(start)) {
                    return this.#stack.slice(start, this.#stack.length);

                }
            }

            const node = this.#unchecked_nodes.next();
            if (node.done) {
                break;
            }

            const visited = is_some(this.#nodes[this.#graph.to_index(node.value)].root_index);
            if (!visited) {
                this.#visitation_stack.push([node.value, true]);
            }

        }
        return
    }

    visit_once(v: NodeId, v_is_local_root: boolean) {
        const node_v = this.#nodes[this.#graph.to_index(v)];

        if (is_none(node_v.root_index)) {
            const v_index = this.#index;
            node_v.root_index = v_index;
            this.#index += 1;
        }

        let w;
        while (!(w = this.#nodes[this.#graph.to_index(v)].neighbors.next()).done) {
            if (is_none(this.#nodes[this.#graph.to_index(w.value)].root_index)) {
                this.#visitation_stack.push([v, v_is_local_root]);
                this.#visitation_stack.push([w.value, true]);
                return
            }

            if ((this.#nodes[this.#graph.to_index(w.value)].root_index ?? 1) < (this.#nodes[this.#graph.to_index(v)].root_index ?? 1)) {
                this.#nodes[this.#graph.to_index(v)].root_index = this.#nodes[this.#graph.to_index(w.value)].root_index;
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
                if ((nodes[this.#graph.to_index(v)].root_index ?? 1) > (nodes[this.#graph.to_index(w)].root_index ?? 1)) {
                    return true
                } else {
                    index_adjustment += 1;
                    return false
                }
            })
        const start = is_some(i) ? i + 1 : 0;
        nodes[this.#graph.to_index(v)].root_index = c;
        this.#stack.push(v);
        this.#start = start;
        this.#index_adjustment = index_adjustment;

        return start;

    }

    into_iter(): Iterator<[NodeId, NodeId, NodeId, NodeId]> {
        return this;
    }

    next(): IteratorResult<[NodeId, NodeId, NodeId, NodeId], any> {
        // TODO: maybe needs `SmallVec`
        const next = this.next_scc() as Option<[NodeId, NodeId, NodeId, NodeId]>;
        return is_some(next) ? item(next) : done();
    }

    size_hint(): [number, Option<number>] {
        return [0, this.#nodes.length]
    }

}