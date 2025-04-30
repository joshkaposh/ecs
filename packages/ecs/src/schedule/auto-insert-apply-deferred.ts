import BTree from "sorted-btree";
import { type Iterator, iter } from "joshkaposh-iterator";
import type { Result, Option } from "joshkaposh-option";
import { DiGraph, NodeId, Incoming, Outgoing } from "./graph";
import { ReportCycles, ScheduleBuildError, ScheduleGraph, SystemNode } from "./schedule";
import { entry } from "../util";
import { ApplyDeferred } from "../system";
import { ScheduleBuildPass } from "./pass";
import { World } from "../world";
import { is_apply_deferred } from "../executor";
import { v4 } from "uuid";

type BTreeSet<T> = BTree<T, undefined>;

export class AutoInsertApplyDeferredPass implements ScheduleBuildPass<typeof IgnoreDeferred> {
    /**
     * Dependency edges that will **not** automatically insert an instance of `ApplyDeferred` on the edge.
     */
    #no_sync_edges: BTreeSet<[NodeId, NodeId]>;
    #auto_sync_node_ids: Map<number, NodeId>;

    EdgeOptions: typeof IgnoreDeferred;

    constructor(no_sync_edges: BTreeSet<[NodeId, NodeId]> = new BTree(), auto_sync_node_ids: Map<number, NodeId> = new Map()) {
        this.#no_sync_edges = no_sync_edges;
        this.#auto_sync_node_ids = auto_sync_node_ids;
        this.EdgeOptions = IgnoreDeferred;
    }

    static readonly type_id = v4() as UUID;

    static valueOf() {
        return AutoInsertApplyDeferredPass.type_id;
    }

    getSyncPoint(graph: ScheduleGraph, distance: number) {
        const sync_point = this.#auto_sync_node_ids.get(distance);

        if (!sync_point) {
            const node_id = this.addAutoSync(graph);
            this.#auto_sync_node_ids.set(distance, node_id);
            return node_id;
        }

        return sync_point;
    }

    /**
     * Add an [`ApplyDeferred`] system with no config
     */
    addAutoSync(graph: ScheduleGraph) {
        const id = new NodeId.System(graph.systems.length);

        graph.systems.push(new SystemNode(new ApplyDeferred().intoSystem()));
        graph.systemConditions.push([]);

        // ignore ambiguities with auto sync points.
        // they aren't under user control, so no one should know or care.
        graph.ambiguous_with_all.add(id.to_primitive());

        return id;
    }

    addDependency(from: NodeId, to: NodeId, options: Option<typeof IgnoreDeferred>) {
        if (options === IgnoreDeferred) {
            this.#no_sync_edges.set([from, to], undefined)
        }
    };

    build(_world: World, graph: ScheduleGraph, dependency_flattened: DiGraph): Result<undefined, ScheduleBuildError> {
        const sync_point_graph = dependency_flattened.clone();
        const topo = graph.topsortGraph(dependency_flattened, ReportCycles.Dependency);

        if (!Array.isArray(topo)) {
            return topo
        }

        function set_has_conditions(graph: ScheduleGraph, node: NodeId): boolean {
            return graph.setConditionsAt(node).length !== 0
                || graph
                    .hierarchy
                    .graph
                    .edges_directed(node, Incoming)
                    .some(([parent]) => set_has_conditions(graph, parent))
        }

        function system_has_conditions(graph: ScheduleGraph, node: NodeId) {
            return graph.systemConditions[node.index].length
                && graph
                    .hierarchy
                    .graph
                    .edges_directed(node, Incoming)
                    .some(([parent]) => set_has_conditions(graph, parent))
        }

        const system_has_conditions_cache = new Map<number, boolean>();

        const is_valid_explicit_sync_point = (system: NodeId) => {
            const index = system.index;
            return is_apply_deferred(graph.systems[index].inner!)
                && !entry(system_has_conditions_cache, index, () => system_has_conditions(graph, system))
        }

        /**
         * Calculate the distance for each node.
         * The "distance" is the number of sync points between a node and the beginning of the graph.
         * Also store if a preceding edge would have added a sync point but was ignored to add it at
         * a later edge that is not ignored.
         */
        const distances_and_pending_sync = new Map<number, [number, boolean]>()

        // Keep track of any explicit sync nodes for a specific distance.
        const distance_to_explicit_sync_node = new Map<number, NodeId>();

        // Determine the distance for every node and collect the explicit sync points
        for (let i = 0; i < topo.length; i++) {
            const node = topo[i];

            let [node_distance, node_needs_sync] = distances_and_pending_sync.get(node.index) ?? [0, false];
            // let node_needs_sync = node_dist_and_needs_sync[1];
            if (is_valid_explicit_sync_point(node)) {

                // the distance of this sync point does not change anymore as the iteration order
                // makes sure that this node is no unvisited target of another node.

                // because of this, the sync point can be stored for this distance to be reused as
                // automatically added sync points later

                distance_to_explicit_sync_node.set(node_distance, node);

                // this node just did a sync, so the only reason to do another sync is if one was
                // explicitly added afterwards.
                node_needs_sync = false;
            } else if (!node_needs_sync) {
                // no previous node has postponed sync points to add, so check if the system itself
                // has deferred params that require a sync point to apply them.

                node_needs_sync = graph.systems[node.index].get()!.has_deferred;
            }

            const outgoing = dependency_flattened.neighbors_directed(node, Outgoing);
            for (let j = 0; j < outgoing.length; j++) {
                const target = outgoing[j];
                const target_dist_and_pending = entry(distances_and_pending_sync, target.index, () => [0, false] as [number, boolean])

                let edge_needs_sync = node_needs_sync;

                if (
                    node_needs_sync
                    && !graph.systems[target.index].get()!.is_exclusive
                    && this.#no_sync_edges.has([node, target])
                ) {
                    // the node has deferred params to apply, but this edge is ignoring sync points.

                    // mark the target as `delaying` those commands to a future edge and the current
                    // edge as not needing a sync point.

                    target_dist_and_pending[1] = true;
                    edge_needs_sync = false;
                }

                let weight = 0;

                if (edge_needs_sync || is_valid_explicit_sync_point(target)) {
                    // the target distance grows if a sync point is added between it and the node.

                    // also raises the distance if the target is a sync point itself so it then again
                    // raises the distance of following nodes as that is what the distance is about.
                    weight = 1;
                }

                // the target cannot have fewer sync points in front of it than the preceding node.
                target_dist_and_pending[0] = Math.max((node_distance + weight), target_dist_and_pending[0]);
            }
        }

        // find any edges which have a different number of sync points between them
        // and make sure there is a sync point between them.

        for (let i = 0; i < topo.length; i++) {
            const node = topo[i];
            const [node_distance] = distances_and_pending_sync.get(node.index) ?? [0, false];

            const outgoing = dependency_flattened.neighbors_directed(node, Outgoing);

            for (let j = 0; j < outgoing.length; j++) {
                const target = outgoing[j];
                const [target_distance] = distances_and_pending_sync.get(target.index) ?? [0, false];
                if (
                    node_distance === target_distance
                ) {
                    // these nodes are the same distance, so they don't need an edge between them
                    continue;
                }

                if (is_apply_deferred(graph.systems[target.index].get()!)) {
                    // we don't need to insert a sync point since ApplyDeferred is a sync point already
                    continue;
                }


                const sync_point = distance_to_explicit_sync_node.get(target_distance) ?? this.getSyncPoint(graph, target_distance);

                sync_point_graph.add_edge(node, sync_point);
                sync_point_graph.add_edge(sync_point, target);

                // the edge without the sync point is now redundant.
                sync_point_graph.remove_edge(node, target);
            }
        }

        dependency_flattened.clone_from(sync_point_graph);
        return;
    }


    collapseSet(set: NodeId, systems: NodeId[], dependency_flattened: DiGraph): Iterator<[NodeId, NodeId]> {
        if (systems.length === 0) {
            // collapse dependencies for empty sets
            const incoming = dependency_flattened.neighbors_directed(set, Incoming);

            for (let i = 0; i < incoming.length; i++) {
                const a = incoming[i];
                const outgoing = dependency_flattened.neighbors_directed(set, Outgoing);

                for (let j = 0; j < outgoing.length; j++) {
                    const b = outgoing[j];
                    if (
                        this.#no_sync_edges.has([a, set])
                        && this.#no_sync_edges.has([set, b])
                    ) {
                        this.#no_sync_edges.set([a, b], undefined);
                    }
                }
            }

        } else {
            const incoming = dependency_flattened.neighbors_directed(set, Incoming);
            for (let i = 0; i < incoming.length; i++) {
                const a = incoming[i];
                for (let j = 0; j < systems.length; j++) {
                    const sys = systems[j];
                    if (this.#no_sync_edges.has([a, set])) {
                        this.#no_sync_edges.set([a, sys], undefined)
                    }
                }
            }

            const outgoing = dependency_flattened.neighbors_directed(set, Outgoing);
            for (let i = 0; i < outgoing.length; i++) {
                const b = outgoing[i];
                for (let j = 0; j < systems.length; j++) {
                    const sys = systems[j];
                    if (this.#no_sync_edges.has([set, b])) {
                        this.#no_sync_edges.set([sys, b], undefined)
                    }
                }
            }
        }

        return iter.of();
    }
}

const IgnoreDeferred = {};

