import type { Option, Result } from "joshkaposh-option";
import { type DiGraph, NodeId } from "./graph";
import type { Iterator } from "joshkaposh-iterator";
import { ScheduleBuildError, ScheduleGraph } from './schedule'
import { World } from "../world";

export interface ScheduleBuildPass<EdgeOptions = any> {
    edge_options: EdgeOptions;
    /**
     * Called when a dependency between sets or systems was explicitly added to the graph.
     */
    add_dependency(from: NodeId, to: NodeId, options: Option<EdgeOptions>): void;

    /**
     * Called while flattening the dependency graph. For each set, this method is called
     * with the systems associated with the set as well as the reference to the current graph.
     * Instead of modifying the graph directly, this method should return an iterator of edges to add to the graph.
     */
    collapse_set(set: NodeId, systems: NodeId[], dependency_flattened: DiGraph): Iterator<[NodeId, NodeId]>;

    /**
     * The implementation will be able to modify the ScheduleGraph here.
     */
    build(world: World, graph: ScheduleGraph, dependency_flattened: DiGraph): Result<undefined, ScheduleBuildError>
}

export interface ScheduleBuildPassObj {
    build(
        world: World,
        graph: ScheduleGraph,
        dependency_flattened: DiGraph
    ): Result<undefined, ScheduleBuildError>;

    collapse_set(
        set: NodeId,
        systems: NodeId[],
        dependency_flattened: DiGraph,
        dependencies_to_add: [NodeId, NodeId][]
    ): void;

    add_dependency(
        from: NodeId, to: NodeId, all_options: Map<any, any>
    ): void;
}

export function schedule_build_pass_obj<T extends ScheduleBuildPass>(type: T): ScheduleBuildPassObj {
    return {
        build(world, graph, dependency_flattened) {
            return type.build(world, graph, dependency_flattened)
        },

        collapse_set(set, systems, dependency_flattened, dependencies_to_add) {
            const iter = type.collapse_set(set, systems, dependency_flattened)
            dependencies_to_add.push(...iter);
        },

        add_dependency(from, to, all_options) {
            const option = all_options.get(type.edge_options);
            type.add_dependency(from, to, option);
        },
    }
}

