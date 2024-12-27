import { Iterator, drain, iter } from "joshkaposh-iterator";
import { TODO } from "joshkaposh-iterator/src/util";
import { Heap } from "joshkaposh-heap";
import { ErrorExt, type Option, type Result, is_some } from 'joshkaposh-option'
import { type Condition, type System } from "../system/system";
import { World } from "../world";
import { unit, writeln } from "../../util";
import { Component, Components, Resource, Tick, type ComponentId } from '../component'
import { ExecutorKind, is_apply_deferred, SystemExecutor, SystemSchedule } from "../executor";
import { DiGraph, UnGraph, Outgoing, Incoming, GraphInfo, DependencyKind, check_graph, index, Graph } from './graph'
import { IntoSystemConfigs, IntoSytemSetConfigs, NodeConfig, NodeConfigs, SystemConfig, SystemSet, SystemSetConfig } from "./config";
import { define_resource } from "../define";
import { StorageType } from "../storage";
import { IntoSystemTrait, ScheduleSystem } from "../system";
import { FixedBitSet } from "fixed-bit-set";
import { NodeId } from "./graph/node";
import { CheckGraphResults, simple_cycles_in_component } from "./graph";
import { SingleThreadedExecutor } from "../executor/single-threaded";
// * --- TEMP Variables and Types ---

// * ECS Types
// type CheckGraphResults<T> = any; //* Maybe not ECS ?

// @ts-expect-error
type IntoSystemSet<T> = {
    into_system_set(): SystemSet;
};
type InternedSystemSet = SystemSet;

function make_executor(kind: ExecutorKind): SystemExecutor {
    switch (kind) {
        case 0:
            return SingleThreadedExecutor.default()
        default:
            throw new Error(`ExecutorKind ${kind} is not a valid Executor. Valid Executors are ${[...Object.values(ExecutorKind)]}`)
            break;
    }

}

export type ScheduleLabel = string;
export type InternedScheduleLabel = string;

export type ScheduleId = number;

export class Schedules {
    #schedules: Map<ScheduleLabel, Schedule>;
    ignored_scheduling_ambiguities: Heap<ComponentId>;
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => Schedules;

    constructor(schedules: Map<ScheduleLabel, Schedule> = new Map(), ignored_scheduling_ambiguities: Heap<ComponentId> = Heap.Min()) {
        this.#schedules = schedules;
        this.ignored_scheduling_ambiguities = ignored_scheduling_ambiguities;
    }

    /**
     * @description
     * Inserts a labeled schedule into the map.
     * 
     * If the map already had an entry for `label`, `schedule` is inserted,
     * and the old schedule is returned. Otherwise, `undefined` is returned.
     * 
     */
    insert(schedule: Schedule): Option<Schedule> {
        const old = this.#schedules.get(schedule.label());
        this.#schedules.set(schedule.label(), schedule);
        return old;
    }

    remove(label: ScheduleLabel): Option<Schedule> {
        const old = this.#schedules.get(label);
        this.#schedules.delete(label)
        return old;
    }

    remove_entry(label: ScheduleLabel): Option<[InternedScheduleLabel, Schedule]> {
        const old = this.remove(label);
        if (old) {
            // return [label.intern(), old]
            return [label, old]
        }
        return
    }

    contains(label: ScheduleLabel): boolean {
        return this.#schedules.has(label);
    }

    /**
     * Returns a reference to the schedule associated with the `label`, if it exists.
     */
    get(label: ScheduleLabel): Option<Schedule> {
        return this.#schedules.get(label)
    }

    entry(label: ScheduleLabel): Schedule {
        let schedule = this.#schedules.get(label);
        if (!schedule) {
            schedule = new Schedule(label)
            this.#schedules.set(label, schedule);
        }
        return schedule
    }

    iter() {
        return this.#schedules.entries();
    }

    check_change_ticks(change_tick: Tick) {
        for (const schedule of this.#schedules.values()) {
            schedule.check_change_ticks(change_tick)
        }
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        for (const schedule of this.#schedules.values()) {
            schedule.set_build_settings(schedule_build_settings.clone());
        }
    }

    allow_ambiguous_component(component: Component, world: World) {
        this.ignored_scheduling_ambiguities.push(world.register_component(component))
    }

    allow_ambiguous_resource(resource: Resource, world: World) {
        this.ignored_scheduling_ambiguities.push(world.register_resource(resource))
    }

    iter_ignored_ambiguities() {
        return this.ignored_scheduling_ambiguities.iter();
    }

    print_ignored_ambiguities(components: Components) {
        let message = 'System order ambiguities caused by conflicts on the following types are ignored: \n';
        for (const id of this.iter_ignored_ambiguities()) {
            message += `${components.get_name(id)} \n`
        }
        console.log(message);
    }

    add_systems<M>(schedule: ScheduleLabel, systems: IntoSytemSetConfigs<M>) {
        this.entry(schedule).add_systems(systems)
        return this;

    }

    configure_sets<M>(schedule: ScheduleLabel, sets: IntoSytemSetConfigs<M>) {
        this.entry(schedule).configure_sets(sets);
        return this;
    }

    ignore_ambiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(schedule: ScheduleLabel, a: S1, b: S2) {
        this.entry(schedule).ignore_ambiguity(a, b);
        return this;
    }
};
define_resource(Schedules);


const DefaultSchedule = 'DefaultSchedule'
export class Schedule {
    #label: ScheduleLabel;
    #graph: ScheduleGraph;
    #executable: SystemSchedule;
    #executor: SystemExecutor;
    #executor_initialized: boolean;
    constructor(label: ScheduleLabel) {
        this.#label = label;
        this.#graph = new ScheduleGraph();
        this.#executable = SystemSchedule.default();
        this.#executor = make_executor(ExecutorKind.SingleThreaded);
        this.#executor_initialized = false;
    }

    static default() {
        return new Schedule(DefaultSchedule);
    }

    label(): ScheduleLabel {
        return this.#label
    }

    add_systems<M>(systems: IntoSystemConfigs<M>) {
        // TODO: need `M` type
        this.#graph.process_configs(systems.into_configs(), false)
        return this;

    }

    ignore_ambiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(a: S1, b: S2) {
        a = a.into_system_set();
        b = b.into_system_set();
        const a_id = this.#graph.system_set_ids.get(a)
        if (!a_id) {
            throw new Error(`Could not mark system as ambiguous, ${a} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        const b_id = this.#graph.system_set_ids.get(b)
        if (!b_id) {
            throw new Error(`Could not mark system as ambiguous, ${b} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        this.#graph.ambiguous_with.add_edge(a_id, b_id)
    }

    configure_sets<M>(sets: IntoSytemSetConfigs<M>) {
        this.#graph.configure_sets(sets);
        return this
    }

    set_build_settings(settings: ScheduleBuildSettings) {
        this.#graph.settings = settings
    }

    get_build_settings() {
        return this.#graph.settings.clone();
    }

    get_executor_kind(): ExecutorKind {
        return this.#executor.kind();
    }

    set_executor_kind(executor: ExecutorKind) {
        if (executor !== this.#executor.kind()) {
            this.#executor = make_executor(executor);
            this.#executor_initialized = false;
        }
        return this;
    }

    set_apply_final_deferred(apply_final_deferred: boolean) {
        this.#executor.set_apply_final_deferred(apply_final_deferred)
        return this;
    }

    run(world: World) {
        world.check_change_ticks();
        const err = this.initialize(world)
        if (err) throw new Error(`Error when initializing schedule ${this.#label}: ${err}`)

        this.#executor.run(this.#executable, world, undefined);
    }

    run_disjoint(world: World) {
        world.check_change_ticks();
        if (this.#graph.__changed) {
            console.log('RUN DISJOINT GRAPH CHANGED');

            this.#graph.initialize(world);
            const ignored_ambiguities = world.get_resource_or_init(Schedules).ignored_scheduling_ambiguities.clone();
            // const err = this.#graph.update_schedule(
            //     this.#executable,
            //     world.components(),
            //     ignored_ambiguities,
            //     this.#label
            // );
            // if (err) return err;
            // this.#graph.__changed = false;
            this.#executor_initialized = false;
        }


        if (!this.#executor_initialized) {
            console.log('RUN DISJOINT INITIALIZING EXECUTOR');

            // TODO: executor does not initialize properly
            // this.#executor.init(this.#executable);
            // this.#executor_initialized = true;
        }

        // this.#executor.run(this.#executable, world, undefined);

        return;

    }

    initialize(world: World): Result<undefined, ScheduleBuildError> {
        if (this.#graph.__changed) {
            this.#graph.initialize(world);
            const ignored_ambiguities = world.get_resource_or_init(Schedules).ignored_scheduling_ambiguities.clone();
            const err = this.#graph.update_schedule(
                this.#executable,
                world.components(),
                ignored_ambiguities,
                this.#label
            );
            if (err) return err;
            this.#graph.__changed = false;
            this.#executor_initialized = false;

        }


        if (!this.#executor_initialized) {
            // TODO: executor does not initialize properly
            this.#executor.init(this.#executable);
            this.#executor_initialized = true;
        }

        return;


    }

    graph(): ScheduleGraph {
        return this.#graph
    }

    executable() {
        return this.#executable
    }

    /**
     * Iterates the change ticks of all systems in the schedule and clamps any older than `MAX_CHANGE_AGE`.
     * This prevents overflow and thus prevents false positives.
     */
    check_change_ticks(change_tick: Tick) {
        for (const system of this.#executable.__systems) {
            if (!is_apply_deferred(system)) {
                system.check_change_tick(change_tick)
            }
        }

        for (const conditions of this.#executable.__system_conditions) {
            for (const system of conditions) {
                system.check_change_tick(change_tick);
            }
        }

        for (const conditions of this.#executable.__set_conditions) {
            for (const system of conditions) {
                system.check_change_tick(change_tick);
            }
        }
    }

    apply_deferred(world: World) {
        for (const system of this.#executable.__systems) {
            system.apply_deferred(world);
        }
    }

    systems(): Result<Iterator<[NodeId, ScheduleSystem]>, ScheduleNotInitialized> {
        if (!this.#executor_initialized) {
            return ScheduleNotInitialized;
        }

        return iter(this.#executable.__system_ids).zip(this.#executable.__systems);
    }

    systems_len() {
        return !this.#executor_initialized ? this.#graph.system_len() : this.#executable.__systems.length
    }

};

export type Chain = 0 | 1 | 2;
export const Chain = {
    /**
     * Run nodes in order. If there are deferred parameters in preceding systems
     * `ApplyDeferred` will be added on the edge
     */
    Yes: 0,
    /**
     * Run nodes in order. This will not add `AoplyDeferred between nodes.`
     */
    YesIgnoreDeferred: 1,
    /**
     * Nodes are allowed to run in any order
     */
    No: 2
} as const;

class Dag {
    #graph: DiGraph;
    #topsort: NodeId[];

    constructor(graph: DiGraph = DiGraph(), topsort: NodeId[] = []) {
        this.#graph = graph;
        this.#topsort = topsort;
    }

    set_topsort(new_topsort: NodeId[]) {
        this.#topsort = new_topsort;
    }

    graph(): DiGraph {
        return this.#graph;
    }

    set_graph(new_graph: DiGraph) {
        this.#graph = new_graph;
    }

    cached_topsort(): NodeId[] {
        return this.#topsort;
    }
}

export class SystemSetNode {
    inner: InternedSystemSet;

    constructor(set: InternedSystemSet) {
        this.inner = set;
    }

    name(): string {
        return `${this.inner}`
    }

    is_system_type(): boolean {
        return is_some(this.inner.is_system_type());

    }

    is_anonymous(): boolean {
        return this.inner.is_anonymous();
    }
}

export class SystemNode {
    inner: Option<ScheduleSystem>
    constructor(system: ScheduleSystem) {
        this.inner = system;
    }

    get(): Option<ScheduleSystem> {
        return this.inner
    }
};

export class ScheduleGraph {
    #systems: SystemNode[];
    #system_conditions: Array<Condition>[];
    #system_sets: SystemSetNode[];
    #system_set_conditions: Array<Condition>[];
    #system_set_ids: Map<InternedSystemSet, NodeId>;
    #uninit: [NodeId, number][];
    #hierarchy: Dag;
    #dependency: Dag;
    #ambiguous_with: UnGraph;
    #ambiguous_with_all: Set<NodeId>;
    #conflicting_systems: [NodeId, NodeId, ComponentId[]][]
    #anonymous_sets: number;
    __changed: boolean;
    #settings: ScheduleBuildSettings;
    // Dependency edges that will NOT automatically insert an instance of `apply_deferred on the edge.`
    #no_sync_edges: Heap<[NodeId, NodeId]>;
    #auto_sync_node_ids: Map<number, NodeId>;

    constructor(
        systems: SystemNode[] = [],
        system_conditions: Array<Condition>[] = [],
        system_sets: Array<SystemSetNode> = [],
        system_set_conditions: Array<Array<Condition>> = [],
        system_set_ids: Map<InternedSystemSet, NodeId> = new Map(),
        uninit: Array<[NodeId, number]> = [],
        hierarchy: Dag = new Dag(),
        dependency: Dag = new Dag(),
        ambiguous_with: UnGraph = UnGraph(),
        ambiguous_with_all: Set<NodeId> = new Set(),
        conflicting_systems: Array<[NodeId, NodeId, ComponentId[]]> = [],
        anonymous_sets = 0,
        changed = false,
        settings: ScheduleBuildSettings = ScheduleBuildSettings.default(),
        no_sync_edges: Heap<[NodeId, NodeId]> = Heap.Min(),
        auto_sync_node_ids: Map<number, NodeId> = new Map()
    ) {
        this.#systems = systems
        this.#system_conditions = system_conditions
        this.#system_sets = system_sets
        this.#system_set_conditions = system_set_conditions
        this.#system_set_ids = system_set_ids;
        this.#uninit = uninit;

        this.#hierarchy = hierarchy;
        this.#dependency = dependency;
        this.#ambiguous_with = ambiguous_with;
        this.#ambiguous_with_all = ambiguous_with_all;
        this.#conflicting_systems = conflicting_systems
        this.#anonymous_sets = anonymous_sets;
        this.__changed = changed;
        this.#settings = settings;
        this.#no_sync_edges = no_sync_edges;
        this.#auto_sync_node_ids = auto_sync_node_ids;
    }

    get settings(): ScheduleBuildSettings {
        return this.#settings;
    }

    set settings(new_settings: ScheduleBuildSettings) {
        this.#settings = new_settings
    }

    get system_set_ids(): Map<SystemSet, NodeId> {
        return this.#system_set_ids;
    }

    get ambiguous_with(): UnGraph {
        return this.#ambiguous_with;
    }

    contains_set(set: SystemSet) {
        return this.#system_set_ids.has(set);
    }

    get_system_at(id: NodeId): Option<ScheduleSystem> {
        if (!id.is_system()) {
            return;
        }
        const system = this.#systems[id.index];
        return system?.inner;
    }

    system_at(id: NodeId): ScheduleSystem {
        const system = this.get_system_at(id);
        if (!system) throw new Error(`System with id ${id} does not exist in this Schedule`)
        return system
    }

    get_set_at(id: NodeId): Option<SystemSet> {
        if (!id.is_set()) {
            return;
        }
        const set = this.#system_sets[id.index];
        return set?.inner

    }

    set_at(id: NodeId): SystemSet {
        const set = this.get_set_at(id);
        if (!set) {
            throw new Error(`Set with id ${id} does not exist in this Schedule`)
        }
        return set
    }

    systems(): Iterator<[NodeId, System<any, any>, Condition[]]> {
        return iter(this.#systems)
            .zip(this.#system_conditions)
            .enumerate()
            .filter_map(([i, [system_node, condition]]) => {
                const system = system_node.inner
                return !system ? null : [new NodeId.System(i), system, condition] as [NodeId, System<any, any>, Condition[]]
            })

    }

    system_sets(): Iterator<[NodeId, SystemSet, Condition[]]> {
        return iter(this.#system_set_ids.values()).map((node_id) => {
            const set_node = this.#system_sets[node_id.index];
            const set = set_node.inner;
            const conditions = this.#system_set_conditions[node_id.index]
            return [node_id, set, conditions];

        })
    }

    hierarchy(): Dag {
        return this.#hierarchy;
    }

    dependency(): Dag {
        return this.#dependency;
    }

    conflicting_systems(): [NodeId, NodeId, ComponentId[]][] {
        return this.#conflicting_systems
    }

    process_config<T extends ProcessNodeConfig>(config: NodeConfig<T>, collect_nodes: boolean): ProcessConfigsResult {
        let nodes: NodeId[];

        // if (collect_nodes) {
        nodes = [config.process_config(this, config)];
        // } else {
        //     nodes = [];
        // }
        return {
            densely_chained: true,
            nodes
        }


    }

    apply_collective_conditions<T extends ProcessNodeConfig>(configs: NodeConfigs<T>[], collective_conditions: Condition[]) {
        if (collective_conditions.length !== 0) {
            const [config] = configs;
            if (config) {
                for (const condition of collective_conditions) {
                    config.run_if(condition);
                }
            } else {
                const set = this.create_anonymous_set();
                for (const config of configs) {
                    config.in_set_inner(set.intern())
                }
                const set_config = new SystemSetConfig(set.intern());
                set_config.conditions.push(...collective_conditions);
                this.#configure_set_inner(set_config);
            }
        }
    }

    process_configs<T extends ProcessNodeConfig>(configs: NodeConfigs<T>, collect_nodes: boolean): ProcessConfigsResult {
        if (configs instanceof NodeConfig) {
            return this.process_config(configs, collect_nodes);
        } else {
            const { configs: _configs, collective_conditions, chained: _chained } = configs;
            this.apply_collective_conditions(_configs, collective_conditions as any);

            const ignored_deferred = _chained === Chain.YesIgnoreDeferred;
            const chained = _chained === Chain.Yes || _chained === Chain.YesIgnoreDeferred;
            /**
             * Densely chained if
             * chained and all configs in the chain are densely chained, or
             * unchained with a single densely chained config
             */
            let densely_chained = chained || _configs.length === 1;
            const configs_iter = iter(_configs);
            const nodes = [];

            const _first = configs_iter.next();
            if (_first.done) {
                return {
                    densely_chained,
                    nodes: []
                }
            }
            const first = _first.value;

            let previous_result = this.process_configs(first, collect_nodes || chained);
            // @ts-expect-error
            densely_chained &= previous_result.densely_chained;

            for (const current of configs_iter) {
                const current_result = this.process_configs(current, collect_nodes || chained);
                // @ts-expect-error
                densely_chained &= current_result.densely_chained;

                if (chained) {
                    // if the current result is densely chained, we only need to chain the first node
                    const current_nodes = (current_result.densely_chained ?
                        current_result.nodes[0] :
                        current_result.nodes) as NodeId[]

                    // if the previous result was densely chained, we only need to chain the last node
                    const previous_nodes = (previous_result.densely_chained ?
                        previous_result.nodes[previous_result.nodes.length - 1] :
                        previous_result.nodes) as NodeId[]

                    for (const previous_node of previous_nodes) {
                        for (const current_node of current_nodes) {
                            this.#dependency.graph().add_edge(previous_node, current_node);

                            if (ignored_deferred) {
                                this.#no_sync_edges.push([previous_node, current_node]);
                            }
                        }
                    }
                }

                if (collect_nodes) {
                    nodes.push(...previous_result.nodes)
                }

                previous_result = current_result;
            }

            if (collect_nodes) {
                nodes.push(...previous_result.nodes)
            }

            return {
                densely_chained: Boolean(densely_chained),
                nodes
            }
        }
    }

    configure_sets<M>(sets: IntoSytemSetConfigs<M>) {
        this.process_configs(
            sets.into_configs(),
            false
        );
    }

    add_system_inner(config: SystemConfig): Result<NodeId, ScheduleBuildError> {
        const id = new NodeId.System(this.#systems.length);

        const err = this.update_graphs(id, config.graph_info);
        if (err) return err;

        this.#uninit.push([id, 0]);
        this.#systems.push(new SystemNode(config.node));
        this.#system_conditions.push(config.conditions);
        return id;
    }

    #configure_set_inner(set: SystemSetConfig): Result<NodeId, ScheduleBuildError> {
        const { node, graph_info, conditions } = set;

        const id = this.#system_set_ids.get(set) ?? this.#add_set(set);

        const err = this.update_graphs(id, graph_info);
        if (err) return err

        const system_set_conditions = this.#system_set_conditions[id.index];
        this.#uninit.push([id, system_set_conditions.length])
        system_set_conditions.push(...conditions as any[]);

        return id;
    }

    #add_set(set: InternedSystemSet) {
        console.log('adding set to schedule graph', set);

        const id = new NodeId.Set(this.#system_sets.length);
        this.#system_sets.push(new SystemSetNode(set));
        this.#system_set_conditions.push([]);
        this.#system_set_ids.set(set, id);
        return id;
    }

    #check_hierarchy_sets(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        // @ts-expect-error
        for (const set of graph_info.hierarchy) {
            const err = this.#check_hierarchy_set(id, set);
            if (err) return err;
        }
        return
    }

    /**
     * Checks that no system set is dependent on itself.
     * Add all the sets from the `GraphInfo`'s dependencies to the graph.
     */
    check_edges(id: NodeId, graph_info: GraphInfo) {
        for (const { set } of graph_info.dependencies) {
            const set_id = this.#system_set_ids.get(set);

            if (set_id) {
                if (id === set_id) {
                    return ScheduleBuildError.DependencyLoop(this.get_node_name(id))
                }
            } else {
                this.#add_set(set);
            }
        }

        // TODO
        // if let Ambiguity::IgnoreWithSet(ambiguous_with) = &graph_info.ambiguous_with {
        //     for set in ambiguous_with {
        //         if !self.system_set_ids.contains_key(set) {
        //             self.add_set(*set);
        //         }
        //     }
        // }

        return
    }

    update_graphs(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        let err;
        err = this.#check_hierarchy_sets(id, graph_info);
        if (err) return err
        err = this.check_edges(id, graph_info);
        if (err) return err

        this.__changed = true;


        const { hierarchy: sets, dependencies, ambiguous_with } = graph_info;

        for (const set of iter(sets).map(set => this.#system_set_ids.get(set)!)) {
            this.#hierarchy.graph().add_edge(set, id);
            this.#dependency.graph().add_node(set);
        }



        for (const [kind, set] of iter(dependencies).map(({ kind, set }) => [kind, this.#system_set_ids.get(set)!] as const)) {
            let tup;
            if (kind === DependencyKind.Before) {
                tup = [id, set]
            } else if (kind === DependencyKind.BeforeNoSync) {
                this.#no_sync_edges.push([id, set]);
                tup = [id, set]
            } else if (kind === DependencyKind.After) {
                tup = [set, id]
            } else {
                // kind = DependencyKind.AfterNoSync
                this.#no_sync_edges.push([set, id])
                tup = [set, id];
            }
            const [lhs, rhs] = tup

            this.#dependency.graph().add_edge(lhs, rhs);
            this.#hierarchy.graph().add_node(set);
        }

        // TODO: 
        // match ambiguous_with {
        //     Ambiguity::Check => (),
        //     Ambiguity::IgnoreWithSet(ambiguous_with) => {
        //         for set in ambiguous_with
        //             .into_iter()
        //             .map(|set| self.system_set_ids[&set])
        //         {
        //             self.ambiguous_with.add_edge(id, set);
        //         }
        //     }
        //     Ambiguity::IgnoreAll => {
        //         self.ambiguous_with_all.insert(id);
        //     }
        // }
        return
    }

    initialize(world: World) {
        console.log('ScheduleGraph initialize', this.#uninit);

        for (const [id, i] of drain(this.#uninit)) {
            if (id instanceof NodeId.System) {
                this.#systems[id.index].get()!.initialize(world);
                for (const condition of this.#system_conditions[id.index]) {
                    condition.initialize(world);
                }
            } else {
                for (const condition of iter(this.#system_set_conditions[id.index]).skip(i)) {
                    condition.initialize(world)
                }
            }

        }
    }

    build_schedule(components: Components, schedule_label: ScheduleLabel, ignored_ambiguities: Heap<ComponentId>): Result<SystemSchedule, ScheduleBuildError> {
        // check hierarchy for cycles
        const toph = this.topsort_graph(this.#hierarchy.graph(), ReportCycles.Hierarchy);
        if (!Array.isArray(toph)) return toph;
        this.#hierarchy.set_topsort(toph)
        const hier_results = check_graph(this.#hierarchy.graph(), this.#hierarchy.cached_topsort())
        let err = this.optionally_check_hierarchy_conflicts(hier_results.transitive_edges, schedule_label);
        if (err) return err;

        // remove redundant edges
        this.#hierarchy.set_graph(hier_results.transitive_reduction);

        // check dependencies for cycles
        const topd = this.topsort_graph(this.#dependency.graph(), ReportCycles.Dependency);
        if (!Array.isArray(topd)) return topd
        this.#dependency.set_topsort(topd)

        // check for systems or system sets depending on sets they belong to
        const dep_results = check_graph(this.#dependency.graph(), this.#dependency.cached_topsort())
        err = this.check_for_cross_dependencies(dep_results, hier_results.connected)
        if (err) return err;

        // map all system sets to their systems
        // go in reverse topological order (bottom-up) for efficiency
        const [set_systems, set_system_bitsets] = this.map_sets_to_systems(this.#hierarchy.cached_topsort(), this.#hierarchy.graph())
        err = this.check_order_but_intersect(dep_results.connected, set_system_bitsets);
        if (err) return err
        err = this.check_system_type_set_ambiguity(set_systems)
        if (err) return err;

        let dependency_flattened = this.get_dependency_flattened(set_systems);
        if (this.#settings.auto_insert_apply_deferred) {
            const err_or_graph = this.auto_insert_apply_deferred(dependency_flattened);
            if (!(err_or_graph instanceof Graph)) return err_or_graph
            dependency_flattened = err_or_graph;
        }

        // topsort
        const topsort = this.topsort_graph(dependency_flattened, ReportCycles.Dependency);
        if (!Array.isArray(topsort)) return topsort
        const dependency_flattened_dag = new Dag(dependency_flattened, topsort)

        const flat_results = check_graph(dependency_flattened_dag.graph(), dependency_flattened_dag.cached_topsort());

        // remove redundant edges
        dependency_flattened_dag.set_graph(flat_results.transitive_reduction);

        // flatten: combine `in_set` with `ambiguous_with` information
        const ambiguous_with_flattened = this.get_ambiguous_with_flattened(set_systems);

        // check for conflicts
        const conflicting_systems = this.get_conflicting_systems(
            flat_results.disconnected,
            ambiguous_with_flattened,
            ignored_ambiguities
        )

        err = this.optionally_check_conflicts(conflicting_systems, components, schedule_label);
        if (err) return err;

        this.#conflicting_systems = conflicting_systems;
        const sched = this.build_schedule_inner(dependency_flattened_dag, hier_results.reachable);
        console.log('build_schedule LEN', sched.__systems.length);
        return sched
    }

    /**
     * modify the graph to have sync nodes for and dependents after a system with deferred system params
     */
    auto_insert_apply_deferred(dependency_flattened: DiGraph) {
        const sync_point_graph = dependency_flattened.clone();
        const topo = this.topsort_graph(dependency_flattened, ReportCycles.Dependency);
        if (!Array.isArray(topo)) return topo;

        const distances = new Map<number, Option<number>>();
        for (const node of topo) {
            const add_sync_after = this.#systems[node.index].get()!.has_deferred();

            for (const target of dependency_flattened.neighbors_directed(node, Outgoing)) {
                const add_sync_on_edge = add_sync_after
                    && !is_apply_deferred(this.#systems[target.index].get()!)
                    && !this.#no_sync_edges.contains([node, target]);

                const weight = add_sync_on_edge ? 1 : 0;

                const distance = Math.max(distances.get(target.index) ?? 0, (distances.get(node.index) ?? 0) + weight)
                distances.set(target.index, distance);

                if (add_sync_on_edge) {
                    const sync_point = this.get_sync_point(distances.get(target.index)!);
                    sync_point_graph.add_edge(node, sync_point);
                    sync_point_graph.add_edge(sync_point, target);

                    // edge is now redundant
                    sync_point_graph.remove_edge(node, target);
                }
            }
        }
        return sync_point_graph;
    }

    /**
     * add a `ApplyDeferred` system with no config
     */
    add_auto_sync() {
        const id = new NodeId.System(this.#systems.length);
        this.#systems.push(new SystemNode(ScheduleSystem.Infallible(
            IntoSystemTrait.into_system(ApplyDeferred)
        )))

        this.#system_conditions.push([]);

        this.#ambiguous_with_all.add(id);
        return id;
    }

    get_sync_point(distance: number): NodeId {
        if (this.#auto_sync_node_ids.has(distance)) {
            return this.#auto_sync_node_ids.get(distance)!
        } else {
            const node_id = this.add_auto_sync();
            this.#auto_sync_node_ids.set(distance, node_id);
            return node_id;
        }
    }

    map_sets_to_systems(hierarchy_topsort: NodeId[], hierarchy_graph: DiGraph): [Map<NodeId, NodeId[]>, Map<NodeId, FixedBitSet>] {
        const set_systems = new Map();
        const set_system_bitsets = new Map();

        for (const id of iter(hierarchy_topsort).rev()) {
            if (id.is_system()) continue;

            const systems = [];
            const system_bitset = FixedBitSet.with_capacity(this.#systems.length);

            for (const child of hierarchy_graph.neighbors_directed(id, Outgoing)) {
                if (child.is_system()) {
                    systems.push(child);
                    system_bitset.insert(child.index);
                } else {
                    const child_systems = set_systems.get(child)!;
                    const child_system_bitset = set_system_bitsets.get(child)!;
                    systems.push(...child_systems);
                    system_bitset.union_with(child_system_bitset);
                }

            }
            set_systems.set(id, systems);
            set_system_bitsets.set(id, system_bitset);

        }
        return [set_systems, set_system_bitsets];

    }

    get_dependency_flattened(set_systems: Map<NodeId, NodeId[]>): DiGraph {
        // flatten: combine `in_set` with `before` and `after` information
        // have to do it like this to preserve transitivity

        const dependency_flattened = this.#dependency.graph().clone();
        const temp: [NodeId, NodeId][] = [];
        for (const [set, systems] of set_systems) {
            if (systems.length === 0) {
                for (const a of dependency_flattened.neighbors_directed(set, Incoming)) {
                    for (const b of dependency_flattened.neighbors_directed(set, Outgoing)) {
                        if (this.#no_sync_edges.contains([a, set])
                            && this.#no_sync_edges.contains([set, b])
                        ) {
                            this.#no_sync_edges.push([a, b])
                        }
                        temp.push([a, b])
                    }
                }

            } else {
                for (const a of dependency_flattened.neighbors_directed(set, Incoming)) {
                    for (const sys of systems) {
                        if (this.#no_sync_edges.contains([a, set])) {
                            this.#no_sync_edges.push([a, sys])
                        }
                        temp.push([a, sys])
                    }
                }

                for (const b of dependency_flattened.neighbors_directed(set, Outgoing)) {
                    for (const sys of systems) {
                        if (this.#no_sync_edges.contains([set, b])) {
                            this.#no_sync_edges.push([sys, b])
                        }
                        temp.push([sys, b])
                    }
                }

            }

            dependency_flattened.remove_node(set);

            for (const [a, b] of temp) {
                dependency_flattened.add_edge(a, b);

            }

        }

        return dependency_flattened;
    }

    get_ambiguous_with_flattened(set_systems: Map<NodeId, NodeId[]>): UnGraph {
        const ambiguous_with_flattened = UnGraph();
        for (const [lhs, rhs] of this.#ambiguous_with.all_edges()) {
            const l = lhs instanceof NodeId.System, r = rhs instanceof NodeId.System;

            if (l && r) {
                ambiguous_with_flattened.add_edge(lhs, rhs);
            } else if (!l && r) {
                for (const lhs_ of set_systems.get(lhs) ?? []) {
                    ambiguous_with_flattened.add_edge(lhs_, rhs);

                }
            } else if (l && !r) {
                for (const rhs_ of set_systems.get(rhs) ?? []) {
                    ambiguous_with_flattened.add_edge(lhs, rhs_)
                }
            } else {
                for (const lhs_ of set_systems.get(lhs) ?? []) {
                    for (const rhs_ of set_systems.get(rhs) ?? []) {
                        ambiguous_with_flattened.add_edge(lhs_, rhs_)
                    }
                }
            }
        }
        return ambiguous_with_flattened;
    }

    get_conflicting_systems(
        flat_results_disconnected: Array<[NodeId, NodeId]>,
        ambiguous_with_flattened: UnGraph,
        ignored_ambiguities: Heap<ComponentId>
    ): Array<[NodeId, NodeId, ComponentId[]]> {
        const conflicting_systems: any[] = [];
        for (const [a, b] of flat_results_disconnected) {
            if (ambiguous_with_flattened.contains_edge(a, b)
                || this.#ambiguous_with_all.has(a)
                || this.#ambiguous_with_all.has(b)
            ) {
                continue
            }

            const system_a = this.#systems[a.index].get()!
            const system_b = this.#systems[b.index].get()!
            if (system_a.is_exclusive() || system_b.is_exclusive()) {
                conflicting_systems.push([a, b, []])
            } else {
                const access_a = system_a.component_access();
                const access_b = system_b.component_access();

                if (!access_a.is_compatible(access_b)) {
                    const conflicts = access_a.get_conflicts(access_b)
                    if (conflicts.type() === 1) {
                        const conflicts_ = conflicts
                            .ones()!
                            .filter(id => !ignored_ambiguities.contains(id))
                            .collect();
                        if (conflicts_.length !== 0) {
                            conflicting_systems.push([a, b, conflicts_])
                        }
                    } else {
                        conflicting_systems.push([a, b, []])
                    }
                }
            }

        }

        return conflicting_systems;
    }

    build_schedule_inner(
        dependency_flattened_dag: Dag,
        hier_results_reachable: FixedBitSet
    ): SystemSchedule {
        const dg_system_ids = structuredClone(dependency_flattened_dag.cached_topsort());
        const dg_system_idx_map = iter(dg_system_ids)
            .enumerate()
            .map(([i, id]) => [id.to_primitive(), i])
            .collect(Map) as Map<string, number>;

        const hg_systems = iter(this.#hierarchy.cached_topsort())
            .enumerate()
            .filter(([_i, id]) => id.is_system())
            .collect();

        console.log('build_schedule_inner', hg_systems);

        const [hg_set_with_conditions_idxs, hg_set_ids] = iter(this.#hierarchy.cached_topsort())
            .enumerate()
            /**
             * ignore system sets that have no conditions
             * ignore sytem type sets (already covered, they don't have conditions)
             */
            .filter(([_i, id]) => id.is_set() && !(this.#system_set_conditions[id.index].length === 0))
            .unzip();

        const sys_count = this.#systems.length;
        const set_with_conditions_count = hg_set_ids.length;
        const hg_node_count = this.#hierarchy.graph().node_count();

        console.log('BUILD SCHEDULE COUNT', sys_count);
        const sched = new SystemSchedule(
            Array.from({ length: sys_count }, (_, i) => this.#systems[i].get()!),
            new Array(sys_count),
            new Array(set_with_conditions_count),
            Array.from({ length: sys_count }, (_, i) => new NodeId.System(i)),
            [],
            // dg_system_ids,
            [],
            [],
            [],
            [],
        )
        console.log('SCHED LEN', sched.__systems.length, sched.__system_ids.length);
        return sched

        // const [hg_set_with_conditions_idxs, hg_set_ids] = iter(this.#hierarchy.cached_topsort())
        //     .enumerate()
        //     /**
        //      * ignore system sets that have no conditions
        //      * ignore sytem type sets (already covered, they don't have conditions)
        //      */
        //     .filter(([_i, id]) => id.is_set() && !(this.#system_set_conditions[id.index].length === 0))
        //     .unzip();

        // console.log('hg_set_with_conditions_idxs, hg_set_ids', hg_set_with_conditions_idxs, hg_set_ids);


        // const sys_count = this.#systems.length;
        // const set_with_conditions_count = hg_set_ids.length;
        // const hg_node_count = this.#hierarchy.graph().node_count();

        // // get the number of dependencies and the immediate dependents of each system
        // // (needed by multi_threaded executor to run systems in the correct order)
        // const system_dependencies: any[] = [];
        // const system_dependents: any[] = [];
        // for (const sys_id of dg_system_ids) {
        //     const num_dependencies = dependency_flattened_dag
        //         .graph()
        //         .neighbors_directed(sys_id, Incoming)
        //         .count();

        //     const dependents = dependency_flattened_dag
        //         .graph()
        //         .neighbors_directed(sys_id, Outgoing)
        //         .map(dep_id => dg_system_idx_map.get(dep_id.to_primitive())!)
        //         .collect();

        //     system_dependencies.push(num_dependencies);
        //     system_dependents.push(dependents);
        // }

        // // get the rows and columns of the hierarchy graph's reachability matrix
        // // (needed so we can evaluate conditions in the correct order)
        // const systems_in_sets_with_conditions = Array.from({ length: set_with_conditions_count }, () => FixedBitSet.with_capacity(sys_count))
        // console.log('systems_in_sets_with_conditions', systems_in_sets_with_conditions);

        // for (const [i, row] of iter(hg_set_with_conditions_idxs).enumerate()) {
        //     const bitset = systems_in_sets_with_conditions[i];
        //     for (const [col, sys_id] of hg_systems) {
        //         const idx = dg_system_idx_map.get(sys_id.to_primitive()) as number;
        //         const is_descendant = hier_results_reachable.contains(index(row, col, hg_node_count))
        //         bitset.set(idx, is_descendant)
        //     }
        // }

        // const sets_with_conditions_of_systems = Array.from({ length: sys_count }, () => FixedBitSet.with_capacity(set_with_conditions_count))
        // for (const [col, sys_id] of hg_systems) {

        //     const i = dg_system_idx_map.get(sys_id.to_primitive()) as number;
        //     const bitset = sets_with_conditions_of_systems[i];
        //     console.log('build_schedule_inner hg systems', col, sys_id, i, bitset);

        //     for (const [idx, row] of iter(hg_set_with_conditions_idxs)
        //         .enumerate()
        //         .take_while(([_idx, row]) => row < col)
        //     ) {
        //         const is_ancestor = hier_results_reachable.contains(index(row, col, hg_node_count))
        //         bitset.set(idx, is_ancestor);
        //     }

        // }

        // return new SystemSchedule(
        //     new Array(sys_count),
        //     new Array(sys_count),
        //     new Array(set_with_conditions_count),
        //     dg_system_ids,
        //     hg_set_ids,
        //     system_dependencies,
        //     system_dependents,
        //     sets_with_conditions_of_systems,
        //     systems_in_sets_with_conditions,
        // )

    }

    /**
     * Updates the `SystemSchedule` from the `ScheduleGraph`
     */
    update_schedule(
        schedule: SystemSchedule,
        components: Components,
        ignored_ambiguities: Heap<ComponentId>,
        schedule_label: InternedScheduleLabel
    ): Result<undefined, ScheduleBuildError> {
        if (this.#uninit.length !== 0) return ScheduleBuildError.Uninitialized()

        console.log('UPDATE SCHEDULE', schedule);

        for (const [[id, system], conditions] of drain(schedule.__system_ids)
            .zip(drain(schedule.__systems))
            .zip(drain(schedule.__system_conditions))
        ) {
            console.log('update_schedule', id, system, conditions);

            // @ts-expect-error
            this.#systems[id.index].inner = system;
            this.#system_conditions[id.index] = conditions;
        }

        for (const [id, conditions] of drain(schedule.__set_ids).zip(drain(schedule.__set_conditions))) {
            this.#system_set_conditions[id.index] = conditions;
        }

        const err_or_sched = this.build_schedule(components, schedule_label, ignored_ambiguities);

        if (!(err_or_sched instanceof SystemSchedule)) return err_or_sched;
        console.log('SCHED LEN', err_or_sched.__systems.length, err_or_sched.__system_ids.length);
        // schedule = err_or_sched;
        schedule.transfer(err_or_sched);

        // TODO: copy new schedule into old schedule

        // move systems into new schedule
        for (let i = 0; i < schedule.__system_ids.length; i++) {
            const id = schedule.__system_ids[i];
            const system = this.#systems[id.index].inner!;
            const conditions = this.#system_conditions[id.index];
            schedule.__systems[id.index] = system;
            schedule.__system_conditions[id.index] = conditions
        }

        for (let i = 0; i < schedule.__set_ids.length; i++) {
            const id = schedule.__set_ids[i];
            const conditions = this.#system_set_conditions[id.index];
            // TODO: let conditions = core::mem::take(&mut self.system_set_conditions[id.index()])
            schedule.__set_conditions[id.index] = conditions;
        }

        return


    }

    #check_hierarchy_set(id: NodeId, set: SystemSet) {
        const set_id = this.#system_set_ids.get(set);
        if (set_id) {
            if (id.eq(set_id)) {
                return ScheduleBuildError.HierarchyLoop(this.get_node_name(id))
            }
        } else {
            this.#add_set(set);
        }

        return

    }

    topsort_graph(graph: DiGraph, report: ReportCycles): Result<NodeId[], ScheduleBuildError> {
        const top_sorted_nodes = [];
        const sccs_with_cycles = [];
        console.log('topsort_graph', graph.nodes().collect());


        for (const scc of graph.iter_sccs()) {
            top_sorted_nodes.push(...scc);
            if (scc.length > 1) {
                sccs_with_cycles.push(scc)
            }

        }

        if (sccs_with_cycles.length === 0) {
            top_sorted_nodes.reverse();
            return top_sorted_nodes as any
        } else {
            const cycles = [];
            for (const scc of sccs_with_cycles) {
                cycles.push(simple_cycles_in_component(graph, scc))
            }

            const err = report === ReportCycles.Hierarchy ? ScheduleBuildError.HierarchyCycle(
                this.get_hierarchy_cycles_error_message(cycles)
            ) :
                ScheduleBuildError.DependencyCycle(
                    this.get_dependency_cycles_error_message(cycles)
                )
            return err;
        }

    }

    optionally_check_hierarchy_conflicts(transitive_edges: Array<[NodeId, NodeId]>, schedule_label: InternedScheduleLabel): Result<undefined, ScheduleBuildError> {
        if (this.#settings.hierarchy_detection === LogLevel.Ignore || transitive_edges.length === 0) {
            return
        }

        // let message = self.get_hierarchy_conflicts_error_message(transitive_edges);
        // match self.settings.hierarchy_detection {
        //     LogLevel::Ignore => unreachable!(),
        //     LogLevel::Warn => {
        //         error!(
        //             "Schedule {schedule_label:?} has redundant edges:\n {}",
        //             message
        //         );
        //         Ok(())
        //     }
        //     LogLevel::Error => Err(ScheduleBuildError::HierarchyRedundancy(message)),
        // }
    }

    get_node_kind(id: NodeId): any { }

    get_node_name(id: NodeId): string {
        return this.get_node_name_inner(id)
    }

    get_node_name_inner(id: NodeId): string {
        return ''
    }

    get_hierarchy_conflicts_error_message(
        transitive_edges: Array<[NodeId, NodeId]>,
    ): string {
        let message = "hierarchy contains redundant edge(s):\n";

        for (const [parent, child] of transitive_edges) {
            message += writeln(` -- ${this.get_node_kind(child)} \`${this.get_node_name(child)}\` cannot be child of set ${this.get_node_name(parent)}`)
        }

        return message
    }

    get_dependency_conflicts_error_message(cycles: Array<NodeId[]>) {
        let message = `schedule has ${cycles.length} before/after cycles:\n`
        for (const [i, cycle] of iter(cycles).enumerate()) {
            const names = iter(cycle).map(id => [this.get_node_kind(id), this.get_node_name(id)] as const)
            const [first_kind, first_name] = names.next().value
            message += writeln(`cycle ${i + 1}: ${first_kind} ${first_name} must run before itself`)
            message += writeln(`${first_kind} ${first_name}`)

            for (const [kind, name] of names.chain(iter.once([first_kind, first_name]))) {
                message += writeln(`... which must run before ${kind} ${name}`)
            }
            message = writeln(message)
        }
        return message;
    }

    check_for_cross_dependencies(
        dep_results: CheckGraphResults,
        hier_results_connected: Set<[NodeId, NodeId]>
    ): Result<undefined, ScheduleBuildError> {
        for (const [a, b] of dep_results.connected) {
            if (hier_results_connected.has([a, b]) || hier_results_connected.has([b, a])) {
                const name_a = this.get_node_name(a)
                const name_b = this.get_node_name(b)
                return ScheduleBuildError.CrossDependency(name_a, name_b)
            }
        }
        return
    }

    check_order_but_intersect(
        dep_results_connected: Set<[NodeId, NodeId]>,
        set_system_bitsets: Map<NodeId, FixedBitSet>
    ): Result<undefined, ScheduleBuildError> {
        for (const [a, b] of dep_results_connected) {
            if (!(a.is_set() && b.is_set())) {
                continue
            }

            const a_systems = set_system_bitsets.get(a)!;
            const b_systems = set_system_bitsets.get(b)!;

            if (!a_systems.is_disjoint(b_systems)) {
                return ScheduleBuildError.SetsHaveOrderButIntersect(
                    this.get_node_name(a),
                    this.get_node_name(b)
                )
            }
        }
        return
    }

    check_system_type_ambiguity(set_systems: Map<NodeId, NodeId[]>) {
        for (const [id, systems] of set_systems) {
            const set = this.#system_sets[id.index];
            if (set.is_system_type()) {
                const instances = systems.length;
                const ambiguous_with = this.#ambiguous_with.edges(id.index);
                const before = this.#dependency.graph().edges_directed(id, Incoming);
                const after = this.#dependency.graph().edges_directed(id, Outgoing);
                const relations = before.count() + after.count() + ambiguous_with.count();
                if (instances > 1 && relations > 0) {
                    return ScheduleBuildError.SystemTypeSetAmbiguity(this.get_node_name(id))
                }
            }
        }
        return
    }

    check_system_type_set_ambiguity(set_systems: Map<NodeId, NodeId[]>): Result<undefined, ScheduleBuildError> {
        for (const [id, systems] of set_systems) {
            const set = this.#system_sets[id.index];
            if (set.is_system_type()) {
                const instances = systems.length;
                const ambiguous_with = this.#ambiguous_with.edges(id);
                const before = this.#dependency.graph().edges_directed(id, Incoming);
                const after = this.#dependency.graph().edges_directed(id, Outgoing);
                const relations = before.count() + after.count() + ambiguous_with.count();
                if (instances > 1 && relations > 0) {
                    return ScheduleBuildError.SystemTypeSetAmbiguity(this.get_node_name(id))
                }
            }
        }
        return
    }

    optionally_check_conflicts(
        conflicts: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components,
        schedule_label: InternedScheduleLabel
    ): Result<undefined, ScheduleBuildError> {
        if (this.#settings.ambiguity_detection === LogLevel.Ignore || conflicts.length === 0) {
            return
        }

        let message = this.get_conflicts_error_message(conflicts, components);

        const ty = this.#settings.ambiguity_detection
        if (ty === LogLevel.Ignore) {
            return
        } else if (ty === LogLevel.Warn) {
            console.warn(`Schedule ${schedule_label}`);
            return;
        } else if (ty === LogLevel.Error) {
            return ScheduleBuildError.Ambiguity(message);
        }
    }

    get_conflicts_error_message(
        ambiguities: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components
    ): string {
        const n_ambiguities = ambiguities.length;

        let message = `${n_ambiguities} pairs of systems with conflicting data access have indeterminate execution order. Consider adding \`before\`, \`after\`, or \`ambiguous_with\` relationships between these: \n`;

        for (const [name_a, name_b, conflicts] of this.conflicts_to_string(ambiguities, components)) {
            message += writeln(`-- ${name_a} and ${name_b}`)
            if (conflicts.length !== 0) {
                message += writeln(` conflict on: ${conflicts}`)
            } else {
                message += writeln(`    conflict on: world`)
            }
        }
        return message
    }

    conflicts_to_string(
        ambiguities: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components
    ): Iterator<[string, string, string[]]> {
        return iter(ambiguities).map(([sys_a, sys_b, conflicts]) => {
            const name_a = this.get_node_name(sys_a);
            const name_b = this.get_node_name(sys_b);
            const conflict_names = conflicts.map(id => components.get_name(id)!);
            return [name_a, name_b, conflict_names] as const;
        })
    }

    traverse_sets_containig_node(id: NodeId, fn: (node_id: NodeId) => boolean) {
        for (const [set_id] of this.#hierarchy.graph().edges_directed(id.index, Incoming)) {
            if (fn(set_id)) this.traverse_sets_containig_node(set_id, fn);
        }
    }

    names_of_sets_containg_node(id: NodeId): string[] {
        const sets = new Set<NodeId>();
        this.traverse_sets_containig_node(id, set_id => {
            const has = sets.has(set_id);
            sets.add(set_id);
            return !this.#system_sets[set_id.index].is_system_type() && has
        })
        const sets_ = iter(sets)
            .map(set_id => this.get_node_name(set_id))
            .collect();

        sets_.sort()
        return sets_;
    }
}

type ProcessConfigsResult = {
    /**
     * All nodes contained inside this `process_configs` call's `NodeConfigs` hierarchy
     * if `ancestor_chained` is true
     */
    nodes: NodeId[];
    // True if and only if all nodes are "densely chained", meaning that all nested nodes
    // are linearly chained (as if `after` system order had been applied between each node)
    // in the order they are defined
    densely_chained: boolean;
}

export interface ProcessNodeConfig {
    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>): NodeId
}

// TODO: implement
// impl ProcessNodeConfig for ScheduleSystem {
//     fn process_config(schedule_graph: &mut ScheduleGraph, config: NodeConfig<Self>) -> NodeId {
//         schedule_graph.add_system_inner(config).unwrap()
//     }
// }

// impl ProcessNodeConfig for InternedSystemSet {
//     fn process_config(schedule_graph: &mut ScheduleGraph, config: NodeConfig<Self>) -> NodeId {
//         schedule_graph.configure_set_inner(config).unwrap()
//     }
// }

export type ReportCycles = 0 | 1;
export const ReportCycles = {
    Hierarchy: 0,
    Dependency: 1
} as const;
type ScheduleBuildError = {
    [K in keyof typeof ScheduleBuildError]: ReturnType<typeof ScheduleBuildError[K]>
}[keyof typeof ScheduleBuildError]
export const ScheduleBuildError = {
    HierarchyLoop(str: string) { return new ErrorExt({ str, type: 'HierarchyLoop' } as const, `System set ${str} contains itself`) },

    HierarchyCycle(str: string) { return new ErrorExt({ str, type: 'HierarchyCycle' } as const, `System set hierachy contains cycle(s).\n${str}`) },

    HierarchyRedundancy(str: string) { return new ErrorExt({ str, type: 'HierarchyRedundancy' } as const, `System set hierachy contains redundant edges. \n${str}`) },

    DependencyLoop(str: string) { return new ErrorExt({ str, type: 'DependencyLoop' } as const, `System set ${str} contains itself`) },

    DependencyCycle(str: string) { return new ErrorExt({ str, type: 'DependencyCycle' } as const, `System dependencies contain cycle(s).\n${str}`) },

    CrossDependency(a: string, b: string) { return new ErrorExt({ a, b, type: 'CrossDependency' } as const, `${a} and ${b} have both \`in_set\` and \`before\`-\`after\` relationships (these might be transitive). This combination is unsolvable as a system cannot run before or after a set it belongs to`) },

    SetsHaveOrderButIntersect(a: string, b: string) { return new ErrorExt({ a, b, type: 'SetsHaveOrderButIntersect' } as const, `${a} and ${b} have a \`before\`-\`after\` relationship (which may be transitive) but share systems. `) },

    SystemTypeSetAmbiguity(str: string) { return new ErrorExt({ str, type: 'SystemTypeSetAmbiguity' }, `Tried to order against ${str} in a schedule that has more than one ${str} instance. ${str} is a \`SystemTypeSet\` and cannot be used for ordering if ambiguous. Use a different set without this restriction`) },
    Ambiguity(str: string) { return new ErrorExt({ str, type: 'Ambiguity' } as const, `Systems with conflicting access have indeterminate run order.\n${str}`) },
    Uninitialized() { return new ErrorExt({ type: 'Uninitialized' } as const, 'Systems in schedule have not been initialized') }
} as const;

export type Loglevel = 0 | 1 | 2;
export const LogLevel = {
    Ignore: 0,
    Warn: 1,
    Error: 2
} as const


export class ScheduleBuildSettings {
    constructor(
        public ambiguity_detection: Loglevel,
        public hierarchy_detection: Loglevel,
        public auto_insert_apply_deferred: boolean,
        public use_shortnames: boolean,
        public report_sets: boolean
    ) { }

    clone() {
        return new ScheduleBuildSettings(this.ambiguity_detection, this.hierarchy_detection, this.auto_insert_apply_deferred, this.use_shortnames, this.report_sets)
    }

    static default(): ScheduleBuildSettings {
        return new ScheduleBuildSettings(LogLevel.Ignore, LogLevel.Warn, true, true, true)
    }
};

export const ScheduleNotInitialized = new ErrorExt(undefined, 'executable schedule has not been built')