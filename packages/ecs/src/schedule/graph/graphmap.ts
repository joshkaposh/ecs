// import { IndexMap } from "joshkaposh-index-map";
import { IndexMap } from '../../temp-index-map'
import { iter } from "joshkaposh-iterator";
import { assert } from "joshkaposh-iterator/src/util";
import { swap_remove } from "joshkaposh-graph/src/array-helpers";
import { NodeId } from "./node";
import { new_tarjan_scc } from "./tarjan_scc";
import { debug_assert } from "../../util";

export class Graph<const DIRECTED extends boolean, S extends (value: any) => number | string = (value: any) => number | string> {
    #DIRECTED: DIRECTED;
    #nodes: IndexMap<NodeId, CompactNodeIdAndDirection[], S>;
    #edges: Set<CompactNodeIdPairPrimitive>
    constructor(
        DIRECTED: DIRECTED = true as DIRECTED,
        nodes: IndexMap<NodeId, CompactNodeIdAndDirection[], S> = IndexMap.withHasher((function hash_node_id(n) { n.to_primitive() }) as S),
        edges: Set<CompactNodeIdPairPrimitive> = new Set()
    ) {
        this.#nodes = nodes
        this.#edges = edges;
        this.#DIRECTED = DIRECTED;
    }

    static with_capacity<const DIRECTED extends boolean>(nodes: number, _edges: number, directed: DIRECTED): Graph<DIRECTED> {
        return new Graph(directed, IndexMap.withCapacityAndHasher(nodes, (n) => n.to_primitive()));
    }

    static default<const DIRECTED extends boolean>(DIRECTED: DIRECTED) {
        return Graph.with_capacity<DIRECTED>(0, 0, DIRECTED);
    }

    clone() {
        const edges = new Set(Array.from(this.#edges));
        return new Graph(this.#DIRECTED, this.#nodes.clone(), edges)
    }

    clone_from(src: Graph<DIRECTED, S>) {
        this.#nodes.cloneFrom(src.#nodes);
        this.#edges = new Set(Array.from(src.#edges));
    }

    edge_key(a: NodeId, b: NodeId) {
        const [a_, b_] = this.#DIRECTED || a <= b ? [a, b] : [b, a];
        return CompactNodeIdPair.store(a_, b_);
    }

    node_count() {
        return this.#nodes.size;
    }

    add_node(n: NodeId) {
        if (!this.#nodes.has(n)) {
            this.#nodes.set(n, []);
        }
    }

    remove_node(n: NodeId) {
        const links_ = this.#nodes.swapRemove(n);
        if (!links_) {
            return
        }

        const links = iter(links_).map(l => l.load());

        for (const [succ, dir] of links) {
            const edge = dir.value === Outgoing.value ?
                this.edge_key(n, succ) :
                this.edge_key(succ, n);

            this.remove_single_edge(succ, n, dir.opposite());
            this.#edges.delete(edge.to_primitive());
        }
    }

    contains_node(n: NodeId) {
        return this.#nodes.has(n);
    }

    add_edge(a: NodeId, b: NodeId) {
        const key = this.edge_key(a, b);
        const key_primitive = key.to_primitive();
        const is_new_edge = !this.#edges.has(key_primitive)
        this.#edges.add(key_primitive);

        if (is_new_edge) {
            // insert into adjacency list if new edge
            let list = this.#nodes.get(a);
            if (!list) {
                list = []
                this.#nodes.set(a, list)
            }
            list.push(CompactNodeIdAndDirection.store(b, Outgoing))

            if (!a.eq(b)) {
                // self loops dont have the Incoming entry
                let list = this.#nodes.get(b);

                if (!list) {
                    list = []
                    this.#nodes.set(b, list)
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

        let index;
        const DIRECTED = this.#DIRECTED
        for (let i = 0; i < sus.length; i++) {
            const [node, direction] = sus[i].load();
            if (
                (DIRECTED && node.eq(b) && direction.value === dir.value)
                || (!DIRECTED && node.eq(b))
            ) {
                index = i;
                break;
            }
        }

        if (index == null) {
            return false
        }

        swap_remove(sus, index);
        return true;
    }

    remove_edge(a: NodeId, b: NodeId) {
        const exist1 = this.remove_single_edge(a, b, Outgoing);
        const exist2 = a.index !== b.index ? this.remove_single_edge(b, a, Incoming) : exist1;
        const weight = this.edge_key(a, b);
        this.#edges.delete(weight.to_primitive())

        debug_assert(exist1 === exist2, `${exist1} must equal ${exist2}`);
        return exist1;
    }

    contains_edge(a: NodeId, b: NodeId) {
        return this.#edges.has(this.edge_key(a, b).to_primitive())
    }

    nodes() {
        return this.#nodes.keys()
    }

    neighbors(a: NodeId) {
        const neighbors = this.#nodes.get(a) ?? [];
        const array = [];
        for (let i = neighbors.length - 1; i >= 0; i--) {
            const [n, dir] = neighbors[i].load();
            if (!this.#DIRECTED || dir.value === Outgoing.value) {
                array.push(n);
            }
        }
        return array;
    }

    iter_neighbors(a: NodeId) {
        const neighbors = this.#nodes.get(a) ?? [];
        return iter(neighbors).filter_map(c => {
            const [n, dir] = c.load();
            if (!this.#DIRECTED || dir.value === Outgoing.value) {
                return n;
            }
            return;
        })
    }

    inner_nodes() {
        return this.#nodes;
    }

    inner_edges() {
        return this.#edges;
    }

    neighbors_directed(a: NodeId, dir: Direction) {
        const neighbors = this.#nodes.get(a) ?? [];
        // console.log(`neighbors_directed: ${a}`, neighbors);

        const array = [];
        for (let i = neighbors?.length - 1; i >= 0; i--) {
            const [n, d] = neighbors[i].load();
            if (!this.#DIRECTED || d.value === dir.value || n.eq(a)) {
                array.push(n);
            }
        }
        return array;
    }

    iter_neigbors_directed(a: NodeId, dir: Direction) {
        const neighbors = this.#nodes.get(a) ?? [];
        return iter(neighbors).filter_map(c => {
            const [n, d] = c.load();
            if (!this.#DIRECTED || d.value === dir.value || n.eq(a)) {
                return n;
            }
            return;
        })
    }

    edges(a: NodeId) {
        return this.neighbors(a)
            .map(b => {
                // debug_assert(this.#edges.has(this.edge_key(a, b)))
                return [a, b] as [NodeId, NodeId];
            })
    }

    /**
     * @returns an iterator of target nodes with an edge starting from `a` and their respective edge weights
     */
    edges_directed(a: NodeId, dir: Direction) {
        return this.iter_neigbors_directed(a, dir)
            .map(b => {
                const [a1, b1] = dir.value === Incoming.value ? [b, a] : [a, b];
                assert(this.#edges.has(this.edge_key(a1, b1).to_primitive()));
                return [a, b] as [NodeId, NodeId];
            }).collect()
    }

    all_edges() {
        return iter(this.#edges).map(e => CompactNodeIdPair.from_primitive(e).load())
    }

    to_index(ix: NodeId) {
        return this.#nodes.indexOf(ix)!;
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
}

export const Outgoing = Direction.Outgoing()
export const Incoming = Direction.Incoming()


class CompactNodeIdAndDirection {
    index: number;
    is_system: boolean;
    direction: Direction;
    constructor(
        index: number,
        is_system: boolean,
        direction: Direction
    ) {
        this.index = index;
        this.is_system = is_system;
        this.direction = direction;
    }

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

type CompactNodeIdPairPrimitive = `${number}:${boolean}, ${number}:${boolean}`;
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

    to_primitive(): CompactNodeIdPairPrimitive {
        return `${this.index_a}:${this.is_system_a}, ${this.index_b}:${this.is_system_b}`
    }

    static from_primitive(p: CompactNodeIdPairPrimitive) {
        const [lhs, rhs] = p.split(', ');
        const [ia, isa] = lhs.split(':')
        const [ib, isb] = rhs.split(':')

        return new CompactNodeIdPair(Number(ia), Number(ib), Boolean(isa), Boolean(isb))
    }

    [Symbol.toPrimitive]() {
        return this.to_primitive()
    }

    [Symbol.iterator]() {
        return this.load()[Symbol.iterator]();
    }

}