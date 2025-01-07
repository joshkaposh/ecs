import { IndexMap } from "joshkaposh-index-map";
import { NodeId } from "./node";
import { iter } from "joshkaposh-iterator";
import { new_tarjan_scc } from "./tarjan_scc";
import { assert } from "joshkaposh-iterator/src/util";
import { is_none } from "joshkaposh-option";
import { swap_remove } from "joshkaposh-graph/src/array-helpers";

export class Graph<const DIRECTED extends boolean, S extends (value: any) => number | string = (value: any) => number | string> {
    #DIRECTED: DIRECTED;
    #nodes: IndexMap<NodeId, CompactNodeIdAndDirection[], S>;
    #edges: Set<CompactNodeIdPair>
    constructor(DIRECTED: DIRECTED = true as DIRECTED, nodes: IndexMap<NodeId, CompactNodeIdAndDirection[], S> = IndexMap.with_capacity_and_hasher(0, (n => n.to_primitive()) as S), edges: Set<CompactNodeIdPair> = new Set()) {
        this.#nodes = nodes
        this.#edges = edges;
        this.#DIRECTED = DIRECTED;
    }

    static with_capacity<const DIRECTED extends boolean>(nodes: number, _edges: number, directed: DIRECTED): Graph<DIRECTED> {
        return new Graph(directed, IndexMap.with_capacity_and_hasher(nodes, (n) => n.to_primitive()), new Set());
    }

    static default<const DIRECTED extends boolean>(DIRECTED: DIRECTED) {
        return Graph.with_capacity<DIRECTED>(0, 0, DIRECTED)
    }

    clone() {
        return new Graph(this.#DIRECTED, IndexMap.from(this.#nodes.entries()), new Set(this.#edges))
    }

    edge_key(a: NodeId, b: NodeId) {
        const [a_, b_] = this.#DIRECTED ?? a < b ? [a, b] : [b, a];
        return CompactNodeIdPair.store(a_, b_);
    }

    node_count() {
        return this.#nodes.len();
    }

    add_node(n: NodeId) {
        if (!this.#nodes.contains_key(n)) {
            this.#nodes.insert(n, []);
        }
    }

    remove_node(n: NodeId) {
        const links_ = this.#nodes.swap_remove(n);
        if (!links_) {
            return
        }

        const links = iter(links_).map(l => l.load());

        for (const [succ, dir] of links) {
            const edge = dir.value === Outgoing.value ?
                this.edge_key(n, succ) :
                this.edge_key(succ, n);

            this.remove_single_edge(succ, n, dir.opposite());
            this.#edges.delete(edge);
        }
    }

    contains_node(n: NodeId) {
        return this.#nodes.contains_key(n);
    }

    add_edge(a: NodeId, b: NodeId) {
        const key = this.edge_key(a, b)
        const is_new_edge = !this.#edges.has(key)
        this.#edges.add(key);

        if (is_new_edge) {
            // insert into adjacency list if new edge
            let list = this.#nodes.get(a);
            if (!list) {
                list = []
                this.#nodes.insert(a, list)
            }
            list.push(CompactNodeIdAndDirection.store(b, Outgoing))

            if (!a.eq(b)) {
                let list = this.#nodes.get(b);

                if (!list) {
                    list = []
                    this.#nodes.insert(b, list)
                }
                list.push(CompactNodeIdAndDirection.store(a, Incoming))

            }

        }

    }

    remove_single_edge(a: NodeId, b: NodeId, dir: Direction): boolean {
        const sus = this.#nodes.get(a);
        if (!sus) {
            return false
        }
        const index = iter(sus)
            .map(c => c.load())
            .position(([node, direction]) => {
                return (this.#DIRECTED && node.index === b.index && direction.value === dir.value)
                    || (!this.#DIRECTED && node.index === b.index)
            })

        if (is_none(index)) {
            return false
        }

        swap_remove(sus, index);
        return true;
    }

    remove_edge(a: NodeId, b: NodeId) {
        const exist1 = this.remove_single_edge(a, b, Outgoing);
        const exist2 = a.index !== b.index ? this.remove_single_edge(b, a, Incoming) : exist1;
        const weight = this.edge_key(a, b);
        this.#edges.delete(weight)

        assert(exist1 === exist2);
        return exist1;
    }

    contains_edge(a: NodeId, b: NodeId) {
        return this.#edges.has(this.edge_key(a, b))
    }

    nodes() {
        return this.#nodes.keys()
    }

    neighbors(a: NodeId) {
        const neighbors = this.#nodes.get(a);
        const it = neighbors ? iter(neighbors) : iter([]);
        return it
            .map(c => c.load())
            .filter_map(([n, dir]) => {
                const bool = !this.#DIRECTED || dir.value === Outgoing.value
                return bool ? n : undefined;
            })
    }

    neighbors_directed(a: NodeId, dir: Direction) {
        const neighbors = this.#nodes.get(a);
        return iter(neighbors ?? []).filter_map((c) => {
            const [n, d] = c.load();
            const bool = !this.#DIRECTED || d.value === dir.value || n.eq(a);
            return bool ? n : undefined;
        })
    }

    edges(a: NodeId) {
        return this.neighbors(a)
            .map(b => {
                const key = this.edge_key(a, b);
                assert(this.#edges.has(key), `Failed to map ${key} to Graph edge as it does not exist`)
                return [a, b];
            })
    }

    edges_directed(a: NodeId, dir: Direction) {
        return this.neighbors_directed(a, dir)
            .map(b => {
                const [a1, b1] = dir.value === Incoming.value ? [b, a] : [a, b]
                const key = this.edge_key(a1, b1);
                assert(this.#edges.has(key), `Failed to map ${key} to Graph edge as it does not exist`)
                return [a, b] as const;
            })
    }

    all_edges() {
        return iter(this.#edges).map(e => e.load())
    }

    to_index(ix: NodeId) {
        return this.#nodes.get_index_of(ix)!;
    }

    iter_sccs() {
        assert(this.#DIRECTED, 'Graph must be directed in order to call iter_sccs()')
        return new_tarjan_scc(this as DiGraph);
    }


}

export type UnGraph = Graph<false>;
export function UnGraph() {
    return Graph.default(false)
};
export type DiGraph = Graph<true>;
export function DiGraph() {
    return Graph.default(true)
};

export class Direction {
    private constructor(public value: 0 | 1) { }

    static Incoming() {
        return new Direction(1)
    }

    static Outgoing() {
        return new Direction(0);
    }

    opposite() {
        return new Direction(this.value === 0 ? 1 : 0);
    }

    index() {
        return this.value & 0x1;
    }
}

export const Outgoing = Direction.Outgoing()
export const Incoming = Direction.Incoming()


class CompactNodeIdAndDirection {
    constructor(
        public index: number,
        public is_system: boolean,
        public direction: Direction
    ) { }

    static store(node: NodeId, direction: Direction) {
        return new CompactNodeIdAndDirection(
            node.index,
            node.is_system(),
            direction
        )
    }

    load(): [NodeId, Direction] {
        const { index, is_system, direction } = this;
        const node = is_system ? new NodeId.System(index) : new NodeId.Set(index)
        return [node, direction];
    }

}

class CompactNodeIdPair {
    constructor(
        public index_a: number,
        public index_b: number,
        public is_system_a: boolean,
        public is_system_b: boolean
    ) { }

    static store(a: NodeId, b: NodeId) {
        return new CompactNodeIdPair(
            a.index,
            b.index,
            a.is_system(),
            b.is_system()
        )
    }

    load(): [NodeId, NodeId] {
        const { index_a, index_b, is_system_a, is_system_b } = this;
        const a = is_system_a ? new NodeId.System(index_a) : new NodeId.Set(index_a)
        const b = is_system_b ? new NodeId.System(index_b) : new NodeId.Set(index_b);
        return [a, b]
    }

}