import { Iterator, drain, iter } from "joshkaposh-iterator";
import { Heap } from "joshkaposh-heap";
import { ErrorExt, type Option, type Result, is_some } from 'joshkaposh-option'
import { v4 } from "uuid";
import BTree from "sorted-btree";
import { ApplyDeferred, type System } from "../system/system";
import { World } from "../world";
import { insert_set, writeln } from "../util";
import { Component, Components, Resource, Tick, type ComponentId } from '../component'
import { ExecutorKind, is_apply_deferred, SystemExecutor, SystemSchedule } from "../executor";
import { DiGraph, UnGraph, Outgoing, Incoming, GraphInfo, DependencyKind, check_graph, index, Graph, Ambiguity } from './graph'
import { Configs, IntoSystemConfigs, IntoSystemSetConfigs, NodeConfig, NodeConfigs, SystemConfig, SystemConfigs, SystemSetConfig } from "./config";
import { FixedBitSet } from "fixed-bit-set";
import { NodeId } from "./graph/node";
import { CheckGraphResults, simple_cycles_in_component } from "./graph";
import { SingleThreadedExecutor } from "../executor/single-threaded";
import { AnonymousSet, InternedSystemSet, IntoSystemSet, SystemSet, set } from "./set";
import { Condition } from "./condition";
import { assert, TODO } from "joshkaposh-iterator/src/util";
import { ScheduleBuildPassObj } from "./pass";

type BTreeSet<T> = BTree<T, undefined>;

type ScheduleSystem = System<any, any>;

function make_executor(kind: ExecutorKind): SystemExecutor {
    switch (kind) {
        case 0:
            return SingleThreadedExecutor.default()
        default:
            throw new Error(`ExecutorKind ${kind} is not a valid Executor. Valid Executors are ${[...Object.values(ExecutorKind)]}`)
    }

}

export type ScheduleLabel = string;
export type InternedScheduleLabel = string;

export type ScheduleId = number;

export class Schedules {
    #schedules: Map<ScheduleLabel, Schedule>;
    ignored_scheduling_ambiguities: BTreeSet<ComponentId>;
    static readonly type_id: UUID = v4() as UUID;
    static readonly storage_type = 1;
    static from_world = (world: World) => new Schedules();

    constructor(schedules: Map<ScheduleLabel, Schedule> = new Map(), ignored_scheduling_ambiguities: BTreeSet<ComponentId> = new BTree()) {
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
        this.ignored_scheduling_ambiguities.set(world.register_component(component), undefined);
    }

    allow_ambiguous_resource(resource: Resource, world: World) {
        this.ignored_scheduling_ambiguities.set(world.register_resource(resource), undefined);
    }

    iter_ignored_ambiguities() {
        return iter(this.ignored_scheduling_ambiguities.keys());
    }

    print_ignored_ambiguities(components: Components) {
        let message = 'System order ambiguities caused by conflicts on the following types are ignored: \n';
        for (const id of this.iter_ignored_ambiguities()) {
            message += `${components.get_name(id)} \n`
        }
        console.log(message);
    }

    add_systems<M extends ReturnType<typeof set> | System<any, any>>(schedule: ScheduleLabel, systems: M) {
        this.entry(schedule).add_systems(systems as any)
        return this;

    }

    configure_sets<M>(schedule: ScheduleLabel, sets: IntoSystemSetConfigs<M>) {
        this.entry(schedule).configure_sets(sets);
        return this;
    }

    ignore_ambiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(schedule: ScheduleLabel, a: S1, b: S2) {
        this.entry(schedule).ignore_ambiguity(a, b);
        return this;
    }
};

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

    add_systems<M extends (any | ReturnType<typeof set> | SystemConfigs)>(systems: M) {
        // @ts-expect-error
        const configs = systems.into_configs()
        this.#graph.process_configs(configs, configs, false)
        return this;
    }

    ignore_ambiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(a: S1, b: S2) {
        a = a.into_system_set() as unknown as S1;
        b = b.into_system_set() as unknown as S2;
        const a_id = this.#graph.system_set_ids.get(a as unknown as SystemSet)
        if (!a_id) {
            throw new Error(`Could not mark system as ambiguous, ${a} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        const b_id = this.#graph.system_set_ids.get(b as unknown as SystemSet)
        if (!b_id) {
            throw new Error(`Could not mark system as ambiguous, ${b} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        this.#graph.ambiguous_with.add_edge(a_id, b_id)
    }

    configure_sets<M>(sets: IntoSystemSetConfigs<M>) {
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

    initialize(world: World) {
        if (this.#graph.__changed) {
            this.#graph.initialize(world);
            const ignored_ambiguities = world.get_resource_or_init(Schedules).ignored_scheduling_ambiguities.clone();
            const err = this.#graph.update_schedule(
                world,
                this.#executable,
                ignored_ambiguities,
                this.#label
            );
            if (err) return err;
            this.#graph.__changed = false;
            this.#executor_initialized = false;
        }


        if (!this.#executor_initialized) {
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
        const { __systems, __system_conditions, __set_conditions } = this.#executable;
        for (let i = 0; i < __systems.length; i++) {
            if (!is_apply_deferred(__systems[i])) {
                __systems[i].check_change_tick(change_tick)
            }
        }

        for (let i = 0; i < __system_conditions.length; i++) {
            const conditions = __system_conditions[i];
            for (let j = 0; j < conditions.length; j++) {
                conditions[j].check_change_tick(change_tick);
            }
        }


        for (let i = 0; i < __set_conditions.length; i++) {
            const conditions = __set_conditions[i];
            for (let j = 0; j < conditions.length; j++) {
                conditions[j].check_change_tick(change_tick);
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

    // systems_len() {
    //     return !this.#executor_initialized ? this.#graph : this.#executable.__systems.length
    // }

};

export type Chain = 0 | Map<any, any>;
export const Chain = {
    /**
     * Systems are independent. Nodes are allowed to run in any order.
     */
    Unchained: 0,
    /**
     * Systems are chained. before -> after ordering constraints will be added between the successive elements.
     */
    Chained(map: Map<any, any>) { return map }
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
        return `${this.inner}`;
    }

    is_system_type(): boolean {
        return !!this.inner.system_type();
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

function ShortName(system_string: string) {
    const name_start = system_string.indexOf('name: ');
    const name_end = system_string.indexOf(',', name_start);
    const name = system_string.slice(name_start + 6, name_end);
    return name;
}

export class ScheduleGraph {
    /** List of systems in the schedule */
    systems: SystemNode[];

    #system_ids: Map<System<any, any>, NodeId>;
    /** List of conditions for each system, in the same order as systems */
    system_conditions: Array<Condition<any>>[];
    /** List of system sets in the schedule */
    #system_sets: SystemSetNode[];
    /** List of conditions for each system set, in the same order as system sets */
    #system_set_conditions: Array<Condition<any>>[];
    /** Map from system set to node id */
    #system_set_ids: Map<InternedSystemSet, NodeId>;
    /** Systems that have not been initialized yet. For system sets, we store the index of the first uninitialized condition 
     * (all the conditions after the index still need to be initialized) */
    #uninit: [NodeId, number][];
    /** Directed Acyclic Graph of the hierarchy (which systems/sets are children of which sets) */
    #hierarchy: Dag;
    /** Directed Acyclic Graph of the dependency (which systems/sets have to run before which other systems/sets) */
    #dependency: Dag;
    #ambiguous_with: UnGraph;
    /** Nodes that are allowed to have ambiguous ordering relationship with any other systems. */
    ambiguous_with_all: Set<NodeId>;
    #conflicting_systems: [NodeId, NodeId, ComponentId[]][]
    #anonymous_sets: number;
    __changed: boolean;
    #settings: ScheduleBuildSettings;

    #passes: BTree<any, ScheduleBuildPassObj>;

    constructor(
        systems: SystemNode[] = [],
        system_conditions: Array<Condition<any>>[] = [],
        system_ids: Map<System<any, any>, NodeId> = new Map(),
        system_sets: Array<SystemSetNode> = [],
        system_set_conditions: Array<Array<Condition<any>>> = [],
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
        passes: BTree<any, ScheduleBuildPassObj> = new BTree()
    ) {
        this.systems = systems;
        this.system_conditions = system_conditions;
        this.#system_ids = system_ids;
        this.#system_sets = system_sets
        this.#system_set_conditions = system_set_conditions
        this.#system_set_ids = system_set_ids;
        this.#uninit = uninit;

        this.#hierarchy = hierarchy;
        this.#dependency = dependency;
        this.#ambiguous_with = ambiguous_with;
        this.ambiguous_with_all = ambiguous_with_all;
        this.#conflicting_systems = conflicting_systems
        this.#anonymous_sets = anonymous_sets;
        this.__changed = changed;
        this.#settings = settings;
        this.#passes = passes;
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
        return this.systems[id.index]?.inner;
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
        return this.#system_sets[id.index]?.inner

    }

    set_at(id: NodeId): SystemSet {
        const set = this.get_set_at(id);
        if (!set) {
            throw new Error(`Set with id ${id} does not exist in this Schedule`)
        }
        return set
    }

    systems_iter(): Iterator<[NodeId, System<any, any>, Condition<any>[]]> {
        return iter(this.systems)
            .zip(this.system_conditions)
            .enumerate()
            .filter_map(([i, [system_node, condition]]) => {
                const system = system_node.inner
                return !system ? null : [new NodeId.System(i), system, condition] as [NodeId, System<any, any>, Condition<any>[]]
            })
    }

    system_sets_iter(): Iterator<[NodeId, SystemSet, Condition<any>[]]> {
        return iter(this.#system_set_ids.values()).map((node_id) => {
            const index = node_id.index;
            const set = this.#system_sets[index].inner;
            const conditions = this.#system_set_conditions[index]
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

    create_anonymous_set() {
        const id = this.#anonymous_sets;
        this.#anonymous_sets += 1;
        return new AnonymousSet(id);
    }

    apply_collective_conditions<T extends ProcessNodeConfig>(configs: readonly NodeConfigs<T>[], collective_conditions: Condition<any>[]) {
        if (collective_conditions.length !== 0) {
            const [config] = configs;
            if (config) {
                for (const condition of collective_conditions) {
                    config.run_if_dyn(condition);
                }
            } else {
                const set = this.create_anonymous_set();
                for (const config of configs) {
                    config.in_set_inner(set);
                }

                assert(!(!!set.system_type()), 'Configuring system type sets is not allowed');

                const set_config = new NodeConfigs.NodeConfig(set, {
                    hierarchy: [] as any,
                    ambiguous_with: [],
                    dependencies: [],

                }, [])
                set_config.conditions.push(...collective_conditions);
                this.configure_set_inner(set_config);
            }
        }
    }

    process_config<T extends ProcessNodeConfig>(type: T, config: NodeConfig<T>, collect_nodes: boolean): ProcessConfigsResult {
        const nodes: NodeId[] = [];
        // if (collect_nodes) {
        nodes.push(type.process_config(this, config));
        // }

        return {
            densely_chained: true,
            nodes
        }
    }

    process_configs<T extends ProcessNodeConfig>(type: T, _configs: NodeConfigs<T>, collect_nodes: boolean): ProcessConfigsResult {
        if (_configs instanceof NodeConfig) {

            return this.process_config(type, _configs, collect_nodes);
        } else if (_configs instanceof Configs) {
            const { configs, collective_conditions, chained } = _configs;
            console.log('INITIAL', _configs);

            this.apply_collective_conditions(configs, collective_conditions);
            const is_chained = chained instanceof Map;
            console.log('DenselyChained initial and actual', is_chained, chained);


            let densely_chained = is_chained || configs.length === 1;
            // console.log('Process configs initial chained', is_chained, densely_chained);
            const nodes: any[] = [];

            if (configs.length === 0) {
                return {
                    nodes: [],
                    densely_chained
                }
            }
            const first = configs[0];

            let previous_result = this.process_configs(first as any, first, collect_nodes || is_chained);

            densely_chained = densely_chained && previous_result.densely_chained;

            for (let j = 1; j < configs.length; j++) {
                const current = configs[j];
                const current_result = this.process_configs(current as any, current, collect_nodes || is_chained);
                densely_chained = densely_chained && current_result.densely_chained;

                if (chained instanceof Map) {
                    const chain_options = chained;
                    const current_nodes = current_result.densely_chained ? current_result.nodes.slice(0, 1) : current_result.nodes;
                    const previous_nodes = previous_result.densely_chained ? previous_result.nodes.slice(previous_result.nodes.length - 1) : previous_result.nodes;

                    for (let i = 0; i < previous_nodes.length; i++) {
                        const previous_node = previous_nodes[i];
                        for (let j = 0; j < current_nodes.length; j++) {
                            const current_node = current_nodes[j];
                            this.#dependency.graph().add_edge(previous_node, current_node);

                            this.#passes.forEachPair((pass) => pass.add_dependency(
                                previous_node,
                                current_node,
                                chain_options));
                        }
                    }


                }

                if (collect_nodes) {
                    nodes.push(...previous_result.nodes);
                }

                previous_result = current_result;
            }

            if (collect_nodes) {
                nodes.push(...previous_result.nodes)
            }


            /**
             * Densely chained if
             * chained and all configs in the chain are densely chained, or
             * unchained with a single densely chained config
             */

            console.log('ProcessConfigs densely_chained', densely_chained);

            return {
                densely_chained: Boolean(densely_chained),
                nodes
            }
        }
        throw new Error(`${_configs} is neither a NodeConfig<ProcessNodeConfig> or Configs<ProcessNodeConfig>`)
    }

    configure_sets<M>(sets: IntoSystemSetConfigs<M>) {
        this.process_configs(
            sets as any,
            sets.into_configs(),
            false
        );
    }

    add_system_inner(config: SystemConfig): Result<NodeId, ScheduleBuildError> {
        const id = new NodeId.System(this.systems.length);
        const err = this.update_graphs(id, config.graph_info);
        if (err) return err;

        this.#uninit.push([id, 0]);
        this.systems[id.index] = new SystemNode(config.node);
        this.system_conditions[id.index] = config.conditions;
        this.#system_ids.set(config.node as any, id);
        return id;
    }

    configure_set_inner(set_: SystemSetConfig): Result<NodeId, ScheduleBuildError> {
        const { node: set, graph_info, conditions } = set_;

        const id = this.#system_set_ids.get(set) ?? this.#add_set(set);

        const err = this.update_graphs(id, graph_info);
        if (err) return err

        const system_set_conditions = this.#system_set_conditions[id.index];
        this.#uninit[id.index] = [id, system_set_conditions.length];
        system_set_conditions.push(...conditions);
        return id;
    }

    #add_set(set: InternedSystemSet): NodeId {
        const id = this.#system_ids.get(set as any)!;
        this.#system_sets.push(new SystemSetNode(set));
        this.#system_set_conditions.push([]);
        this.#system_set_ids.set(set, id);
        return id;
    }

    #check_hierarchy_sets(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        const { hierarchy } = graph_info
        for (let i = 0; i < hierarchy.length; i++) {
            const set = hierarchy[i];
            const err = this.#check_hierarchy_set(id, set);
            if (err) return err;
        }
        return
    }

    #check_hierarchy_set(id: NodeId, set: SystemSet): Result<undefined, ScheduleBuildError> {
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

    /**
     * Checks that no system set is dependent on itself.
     * Add all the sets from the `GraphInfo`'s dependencies to the graph.
     */
    check_edges(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        const { dependencies } = graph_info;
        for (let i = 0; i < dependencies.length; i++) {
            const { set } = dependencies[i];
            const set_id = this.#system_set_ids.get(set);
            // console.log('ScheduleGraph check_edges() set_id and set', id, set_id, set)
            if (set_id) {
                if (id.eq(set_id)) {
                    return ScheduleBuildError.DependencyLoop(this.get_node_name(id))
                }
            } else {
                this.#add_set(set);
            }
        }

        // const ambiguous_with = graph_info.ambiguous_with;
        // if (Array.isArray(ambiguous_with)) {
        //     for (let i = 0; i < ambiguous_with.length; i++) {
        //         const set = ambiguous_with[i];
        //         if (!this.system_set_ids.has(set)) {
        //             // console.log('ScheduleGraph check_edges() ADDING SET TO AMBIGUOUS_WITH', set)
        //             this.#add_set(set);
        //         }
        //     }
        // }

        return
    }

    /**
     * Update the internal graphs (hierarchy, dependency, ambiguity) by adding a single GraphInfo
     */
    update_graphs(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        let err;
        err = this.#check_hierarchy_sets(id, graph_info);
        if (err) return err
        err = this.check_edges(id, graph_info);
        if (err) return err
        this.__changed = true;

        const { hierarchy: sets, dependencies, ambiguous_with } = graph_info;
        this.#hierarchy.graph().add_node(id);
        this.#dependency.graph().add_node(id);

        for (let i = 0; i < sets.length; i++) {
            const set = this.#system_set_ids.get(sets[i])!;
            this.#hierarchy.graph().add_edge(set, id);
            // ensure set also appears in dependency graph
            this.#dependency.graph().add_node(set);
        }

        for (let i = 0; i < dependencies.length; i++) {
            const d = dependencies[i];
            const { kind, options } = d;
            const set = this.#system_set_ids.get(d.set);
            if (!set) {
                throw new Error('Set must exist at this point.')
            }
            const [lhs, rhs]: [NodeId, NodeId] = DependencyKind.Before === kind ? [id, set] : [set, id];
            this.#dependency.graph().add_edge(lhs, rhs);
            this.#passes.forEachPair((_, pass) => pass.add_dependency(lhs, rhs, options))

            // ensure set also appears in hierarchy graph
            this.#hierarchy.graph().add_node(set);
        }

        switch (ambiguous_with) {
            case Ambiguity.Check:
                break;
            case Ambiguity.IgnoreAll:
                this.ambiguous_with_all.add(id)
                break;
            default:
                for (let i = 0; i < ambiguous_with.length; i++) {
                    const set = this.system_set_ids.get(ambiguous_with[i])!;
                    this.ambiguous_with.add_edge(id, set);
                }
                break;
        }

        return
    }

    /**
     * Initializes any newly added systems and conditions by calling System.initialize()
     */
    initialize(world: World) {
        const uninit = this.#uninit;
        for (let index = 0; index < uninit.length; index++) {
            const [id, i] = uninit[index];
            const id_index = id.index;
            if (id instanceof NodeId.System) {
                this.systems[id.index].inner!.initialize(world);
                const conditions = this.system_conditions[id_index];
                for (let j = 0; j < conditions.length; j++) {
                    conditions[j].initialize(world);
                }
            } else {
                const set_conditions = this.#system_set_conditions[id_index];
                for (let j = i; j < set_conditions.length; j++) {
                    set_conditions[j].initialize(world)
                }
            }
        }
        this.#uninit.length = 0;
    }

    /**
     * Build a SystemSchedule optimized for scheduler access from the ScheduleGraph.
     * 
     * Also checks for:
     * - dependency or hierarchy cycles
     * - system access conflicts and reports ambiguities
     */
    build_schedule(
        world: World,
        schedule_label: ScheduleLabel,
        ignored_ambiguities: BTreeSet<ComponentId>,
    ) {
        const toph = this.topsort_graph(this.#hierarchy.graph(), ReportCycles.Hierarchy);
        if (!Array.isArray(toph)) return toph;
        this.#hierarchy.set_topsort(toph);
        // console.log('BuildSchedule hierarchy graph topsort', toph);
        const hier_results = check_graph(this.#hierarchy.graph(), this.#hierarchy.cached_topsort())
        let err;
        err = this.optionally_check_hierarchy_conflicts(hier_results.transitive_edges, schedule_label);
        if (err) return err;

        // remove redundant edges
        this.#hierarchy.set_graph(hier_results.transitive_reduction);

        // check dependencies for cycles
        const topd = this.topsort_graph(this.#dependency.graph(), ReportCycles.Dependency);
        if (!Array.isArray(topd)) return topd
        this.#dependency.set_topsort(topd);
        console.log('BuildSchedule dependency graph topsort', topd);

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

        const passes = this.#passes;
        this.#passes = new BTree();
        passes.forEachPair((_, pass) => {
            pass.build(world, this, dependency_flattened)
        })
        // if (this.#settings.auto_insert_apply_deferred) {
        //     const err_or_graph = this.auto_insert_apply_deferred(dependency_flattened);
        //     if (!(err_or_graph instanceof Graph)) return err_or_graph
        //     dependency_flattened = err_or_graph;
        // }


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

        // err = this.optionally_check_conflicts(conflicting_systems, components, schedule_label);
        // if (err) return err;

        this.#conflicting_systems = conflicting_systems;
        const sched = this.build_schedule_inner(dependency_flattened_dag, hier_results.reachable);
        return sched;
    }

    /**
     * modify the graph to have sync nodes for and dependents after a system with deferred system params
     */
    auto_insert_apply_deferred(dependency_flattened: DiGraph) {
        const sync_point_graph = dependency_flattened.clone();

        // const topo = this.topsort_graph(dependency_flattened, ReportCycles.Dependency);
        // if (!Array.isArray(topo)) return topo;

        // const distances = new Map<number, Option<number>>();

        // for (const node of topo) {
        //     const add_sync_after = this.#systems[node.index].get()?.has_deferred();

        //     for (const target of dependency_flattened.neighbors_directed(node, Outgoing)) {
        //         const add_sync_on_edge = add_sync_after
        //             && !is_apply_deferred(this.#systems[target.index].get()!)
        //             && !this.#no_sync_edges.contains(`${node.to_primitive()}//${target.to_primitive()}`);

        //         const weight = add_sync_on_edge ? 1 : 0;

        //         const distance = Math.max(distances.get(target.index) ?? 0, (distances.get(node.index) ?? 0) + weight)
        //         distances.set(target.index, distance);

        //         if (add_sync_on_edge) {
        //             const sync_point = this.get_sync_point(distances.get(target.index)!);
        //             sync_point_graph.add_edge(node, sync_point);
        //             sync_point_graph.add_edge(sync_point, target);

        //             // edge is now redundant
        //             sync_point_graph.remove_edge(node, target);
        //         }
        //     }
        // }
        return sync_point_graph;
    }

    /**
     * add a `ApplyDeferred` system with no config
     */
    add_auto_sync(): NodeId {
        // const id = new NodeId.System(this.#systems.length);

        // this.#systems.push(new SystemNode(ApplyDeferred.into_system()))

        // this.#system_conditions.push([]);

        // this.#ambiguous_with_all.add(id);
        // return id;
        return TODO('ScheduleGraph.add_autp_sync()')

    }

    /**
     * Returns the NodeId of the cached auto sync point. Will create a new one if needed.
     */
    get_sync_point(distance: number): NodeId {
        return TODO('ScheduleGraph.get_sync_point()')
        // const id = this.#auto_sync_node_ids.get(distance);
        // if (id) {
        //     return id;
        // } else {
        //     const node_id = this.add_auto_sync();
        //     this.#auto_sync_node_ids.set(distance, node_id);
        //     return node_id;
        // }
    }

    /**
     * Return a map from system set `NodeId` to a list of system `NodeId`s that are included in the set.
     * Also return a map from system set `NodeId` to a `FixedBitSet` of system `NodeId`s that are included in the set,
     * where the bitset order is the same as this.systems
     */
    map_sets_to_systems(hierarchy_topsort: NodeId[], hierarchy_graph: DiGraph): [Map<string, NodeId[]>, Map<string, FixedBitSet>] {
        const set_systems: Map<string, NodeId[]> = new Map();
        const set_system_bitsets: Map<string, FixedBitSet> = new Map();


        const system_length = this.systems.length;

        for (const id of hierarchy_topsort.toReversed()) {
            if (id.is_system()) continue;

            const systems = [];
            const system_bitset = FixedBitSet.with_capacity(system_length);

            for (const child of hierarchy_graph.neighbors_directed(id, Outgoing)) {
                if (child.is_system()) {
                    systems.push(child);
                    system_bitset.insert(child.index);
                } else {
                    const child_primitive = child.to_primitive();
                    const child_systems = set_systems.get(child_primitive)!;
                    const child_system_bitset = set_system_bitsets.get(child_primitive)!;
                    systems.push(...child_systems);
                    system_bitset.union_with(child_system_bitset);
                }
            }
            const id_primitive = id.to_primitive();
            set_systems.set(id_primitive, systems);
            set_system_bitsets.set(id_primitive, system_bitset);
        }

        return [set_systems, set_system_bitsets];
    }

    get_dependency_flattened(set_systems: Map<string, NodeId[]>): DiGraph {
        // flatten: combine `in_set` with `before` and `after` information
        // have to do it like this to preserve transitivity
        const dependency_flattened = this.#dependency.graph().clone();
        const temp: [NodeId, NodeId][] = [];
        for (const [set_, systems] of set_systems) {

            const set = NodeId.to_node_id(set_);
            if (systems.length === 0) {
                for (const a of dependency_flattened.neighbors_directed(set, Incoming)) {
                    const a_primitive = a.to_primitive();
                    for (const b of dependency_flattened.neighbors_directed(set, Outgoing)) {
                        const b_primitive = b.to_primitive();
                        const set_primitive = set.to_primitive();

                        // if (this.#no_sync_edges.contains(`${a_primitive}//${set_primitive}`)
                        //     && this.#no_sync_edges.contains(`${set_primitive}// ${b_primitive}]`)
                        // ) {
                        //     this.#no_sync_edges.push(`${a_primitive}//${b_primitive}`)
                        // }
                        temp.push([a, b])
                    }
                }

            } else {
                for (const a of dependency_flattened.neighbors_directed(set, Incoming)) {
                    const a_primitive = a.to_primitive();
                    for (let i = 0; i < systems.length; i++) {
                        const sys = systems[i];
                        // if (this.#no_sync_edges.contains(`${a_primitive}//${set.to_primitive()}`)) {
                        //     this.#no_sync_edges.push(`${a_primitive}//${sys.to_primitive()}`)
                        // }

                        temp.push([a, sys])
                    }
                }

                for (const b of dependency_flattened.neighbors_directed(set, Outgoing)) {
                    const b_primitive = b.to_primitive();
                    for (let i = 0; i < systems.length; i++) {
                        const sys = systems[i];
                        // if (this.#no_sync_edges.contains(`${set.to_primitive()}//${b_primitive}`)) {
                        //     this.#no_sync_edges.push(`${sys.to_primitive()}//${b_primitive}`)
                        // }
                        temp.push([sys, b])
                    }
                }
            }

            dependency_flattened.remove_node(set);

            for (let i = 0; i < temp.length; i++) {
                const [a, b] = temp[i];
                dependency_flattened.add_edge(a, b);
            }

            temp.length = 0;
        }

        return dependency_flattened;
    }

    get_ambiguous_with_flattened(set_systems: Map<string, NodeId[]>): UnGraph {
        const ambiguous_with_flattened = UnGraph();
        for (const [lhs, rhs] of this.#ambiguous_with.all_edges()) {
            const lhs_str = lhs.to_primitive();
            const rhs_str = rhs.to_primitive();

            const l = lhs instanceof NodeId.System, r = rhs instanceof NodeId.System;

            if (l && r) {
                ambiguous_with_flattened.add_edge(lhs, rhs);
            } else if (!l && r) {
                const set_systems_lhs = set_systems.get(lhs_str) ?? [];
                for (let i = 0; i < set_systems_lhs.length; i++) {
                    ambiguous_with_flattened.add_edge(set_systems_lhs[i], rhs);
                }
            } else if (l && !r) {
                const set_systems_rhs = set_systems.get(rhs_str) ?? [];
                for (let i = 0; i < set_systems_rhs.length; i++) {
                    ambiguous_with_flattened.add_edge(lhs, set_systems_rhs[i])
                }
            } else {
                const set_systems_lhs = set_systems.get(lhs_str) ?? [];
                for (let i = 0; i < set_systems_lhs.length; i++) {
                    const _lhs = set_systems_lhs[i];
                    const set_systems_rhs = set_systems.get(rhs_str) ?? [];
                    for (let j = 0; j < set_systems_rhs.length; j++) {
                        const _rhs = set_systems_rhs[j];
                        ambiguous_with_flattened.add_edge(_lhs, _rhs)
                    }
                }
            }
        }
        return ambiguous_with_flattened;
    }

    get_conflicting_systems(
        flat_results_disconnected: Array<[NodeId, NodeId]>,
        ambiguous_with_flattened: UnGraph,
        ignored_ambiguities: BTreeSet<ComponentId>
    ): Array<[NodeId, NodeId, ComponentId[]]> {
        const conflicting_systems: any[] = [];
        for (const [a, b] of flat_results_disconnected) {
            if (ambiguous_with_flattened.contains_edge(a, b)
                || this.ambiguous_with_all.has(a)
                || this.ambiguous_with_all.has(b)
            ) {
                continue
            }

            const system_a = this.systems[a.index].get()!
            const system_b = this.systems[b.index].get()!
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
                            .filter(id => !ignored_ambiguities.has(id))
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
    ) {
        const dg_system_ids = [...dependency_flattened_dag.cached_topsort()]
        const dg_system_idx_map = iter(dg_system_ids)
            .enumerate()
            .map(([i, id]) => [id, i])
            .collect(Map) as Map<NodeId, number>;

        const hg_systems = iter(this.#hierarchy.cached_topsort())
            .enumerate()
            .filter(([_, id]) => id.is_system())
            .collect()

        const [hg_set_with_conditions_idxs, hg_set_ids] = iter(this.#hierarchy.cached_topsort())
            .enumerate()
            .filter(([_, id]) => {
                return id.is_set() && this.#system_set_conditions[id.index].length !== 0;
            })
            .unzip();
        const sys_count = this.systems.length;
        const set_with_conditions_count = hg_set_ids.length;
        const hg_node_count = this.#hierarchy.graph().node_count();

        const system_dependencies = [];
        const system_dependents = [];

        for (let i = 0; i < dg_system_ids.length; i++) {
            const sys_id = dg_system_ids[i];
            const num_dependencies = dependency_flattened_dag
                .graph()
                .neighbors_directed(sys_id, Incoming)
                .count()

            const dependents = dependency_flattened_dag
                .graph()
                .neighbors_directed(sys_id, Outgoing)
                .map(dep_id => dg_system_idx_map.get(dep_id)!)
                .collect();

            system_dependencies.push(num_dependencies);
            system_dependents.push(dependents);
        }

        const systems_in_sets_with_conditions = Array.from({ length: set_with_conditions_count }, () => FixedBitSet.with_capacity(sys_count));
        for (let i = 0; i < hg_set_with_conditions_idxs.length; i++) {
            const row = hg_set_with_conditions_idxs[i];
            const bitset = systems_in_sets_with_conditions[i];
            for (let j = 0; j < hg_systems.length; j++) {
                const [col, sys_id] = hg_systems[j]
                const idx = dg_system_idx_map.get(sys_id)!;
                const is_descendant = hier_results_reachable.contains(index(row, col, hg_node_count));
                bitset.set(idx, is_descendant);
            }
        }

        const sets_with_conditions_of_systems = Array.from({ length: sys_count }, () => FixedBitSet.with_capacity(set_with_conditions_count));
        for (let i = 0; i < hg_systems.length; i++) {
            const [col, sys_id] = hg_systems[i];
            const ix = dg_system_idx_map.get(sys_id)!;
            const bitset = sets_with_conditions_of_systems[ix];
            const it = iter(hg_set_with_conditions_idxs)
                .enumerate()
                .take_while(([_, row]) => row < col)
            for (const [idx, row] of it) {
                const is_ancestor = hier_results_reachable.contains(index(row, col, hg_node_count));
                bitset.set(idx, is_ancestor);
            }
        }

        return new SystemSchedule(
            [],// new Array(sys_count),
            [],// new Array(sys_count),
            [],// new Array(set_with_conditions_count),
            dg_system_ids,
            hg_set_ids,
            system_dependencies,
            system_dependents,
            sets_with_conditions_of_systems,
            systems_in_sets_with_conditions
        )
    }

    update_schedule(
        world: World,
        schedule: SystemSchedule,
        ignored_ambiguities: BTreeSet<ComponentId>,
        schedule_label: InternedScheduleLabel
    ) {

        if (this.#uninit.length !== 0) return ScheduleBuildError.Uninitialized()
        // move systems out of old schedule

        const id_with_system_and_conditions = drain(schedule.__system_ids)
            .zip(drain(schedule.__systems))
            .zip(drain(schedule.__system_conditions))
        for (const [[id, system], conditions] of id_with_system_and_conditions) {
            this.systems[id.index].inner = system;
            this.system_conditions[id.index] = conditions;
        }

        const drain_set_conditions = drain(schedule.__set_ids)
            .zip(drain(schedule.__set_conditions))
        for (const [id, conditions] of drain_set_conditions) {
            this.#system_set_conditions[id.index] = conditions;
        }

        const err_or_sched = this.build_schedule(world, schedule_label, ignored_ambiguities);
        if (!(err_or_sched instanceof SystemSchedule)) {
            return err_or_sched;
        }

        // err_or_sched.__system_ids = (err_or_sched.__system_ids.filter(id => id.is_system()))
        schedule.copy_from(err_or_sched);

        // move systems into new schedule
        const system_ids = schedule.__system_ids;
        // console.log('SystemSchedule system_ids', system_ids);
        for (let i = 0; i < system_ids.length; i++) {
            const id = system_ids[i];
            // TODO: remove
            if (id.is_set()) {
                continue
            }
            const system = this.systems[id.index].inner!;
            this.systems[id.index].inner = null;
            const conditions = this.system_conditions[id.index];
            this.system_conditions[id.index] = [];
            // console.log('PUSHING INTO SYSTEMSCHEDULE', id, system.name());
            schedule.__systems.push(system);
            schedule.__system_conditions[id.index] = conditions;
        }

        const set_ids = schedule.__set_ids;
        for (let i = 0; i < set_ids.length; i++) {
            const id = set_ids[i];
            const conditions = this.#system_set_conditions[id.index];
            this.#system_set_conditions[id.index] = [];
            schedule.__set_conditions.push(conditions);
        }

        return
    }


    topsort_graph(graph: DiGraph, report: ReportCycles): Result<NodeId[], ScheduleBuildError> {
        const top_sorted_nodes: NodeId[] = [];
        const sccs_with_cycles = [];

        for (const scc of graph.iter_sccs()) {
            top_sorted_nodes.push(...scc);
            if (scc.length > 1) {
                sccs_with_cycles.push(scc)
            }
        }

        if (sccs_with_cycles.length === 0) {
            // TODO: may need to reverse
            return top_sorted_nodes.reverse()
        } else {
            const cycles = [];
            for (const scc of sccs_with_cycles) {
                cycles.push(simple_cycles_in_component(graph, scc))
            }

            const err = report === ReportCycles.Hierarchy ? ScheduleBuildError.HierarchyCycle(
                // @ts-expect-error
                this.get_hierarchy_cycles_error_message(cycles)
            ) :
                ScheduleBuildError.DependencyCycle(
                    // @ts-expect-error
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

    get_node_kind(id: NodeId): 'set' | 'system' {
        return id.is_system() ? 'system' : 'set';
    }

    get_node_name(id: NodeId): string {
        return this.get_node_name_inner(id, this.settings.report_sets)
    }

    get_node_name_inner(id: NodeId, report_sets: boolean): string {
        let name;
        console.log('GET_NODE_NAME', id, id.is_system());

        if (id.is_system()) {
            const name_ = this.systems[id.index].inner!.name();
            if (report_sets) {
                const sets = this.names_of_sets_containing_node(id);
                if (sets.length === 0) {
                    name = name_
                } else if (sets.length === 1) {
                    return name = `${name_} in set [${sets[0]}]`
                } else {
                    return name = `${name_} in sets [${sets.join(', ')}]`
                }
            } else {
                name = name_;
            }
        } else {
            const set = this.#system_sets[id.index];
            console.log('GET_NODE_NAME_INNER', set.name(), set.is_anonymous());

            if (set.is_anonymous()) {
                name = this.anonymous_set_name(id);
            } else {
                name = set.name();
            }
        }

        if (this.settings.use_shortnames) {
            return ShortName(name);
        } else {
            return name;
        }
    }

    anonymous_set_name(id: NodeId) {
        return `${this.#hierarchy.graph()
            .edges_directed(id, Outgoing)
            .map(([_, member_id]) => this.get_node_name_inner(member_id, false))
            .fold('', ([a, b]) => `${a}, ${b}`)}`
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
        // for (const [i, cycle] of iter(cycles).enumerate()) {
        //     const names = iter(cycle).map(id => [this.get_node_kind(id), this.get_node_name(id)] as const);
        //     const [first_kind, first_name] = names.next().value;
        //     message += writeln(`cycle ${i + 1}: ${first_kind} ${first_name} must run before itself`)
        //     message += writeln(`${first_kind} ${first_name}`)

        //     for (const [kind, name] of names.chain(iter.once([first_kind, first_name]) as any)) {
        //         message += writeln(`... which must run before ${kind} ${name}`)
        //     }
        //     message = writeln(message)
        // }
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
        set_system_bitsets: Map<string, FixedBitSet>
    ): Result<undefined, ScheduleBuildError> {
        for (const [a, b] of dep_results_connected) {
            if (!(a.is_set() && b.is_set())) {
                continue
            }

            const a_systems = set_system_bitsets.get(a.to_primitive())!;
            const b_systems = set_system_bitsets.get(b.to_primitive())!;

            if (!a_systems.is_disjoint(b_systems)) {
                return ScheduleBuildError.SetsHaveOrderButIntersect(
                    this.get_node_name(a),
                    this.get_node_name(b)
                )
            }
        }
        return
    }

    check_system_type_ambiguity(set_systems: Map<string, NodeId[]>) {
        for (const [id_str, systems] of set_systems) {
            const id = NodeId.to_node_id(id_str)
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

    check_system_type_set_ambiguity(set_systems: Map<string, NodeId[]>): Result<undefined, ScheduleBuildError> {
        for (const [str, systems] of set_systems) {
            const id = NodeId.to_node_id(str)
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

        const ty = this.#settings.ambiguity_detection as Loglevel;
        if (ty === LogLevel.Ignore) {
            return
        } else if (ty === LogLevel.Warn) {
            console.warn(`Schedule ${schedule_label}`);
            return;
        } else {
            // ty === LogLevel.Error
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

    traverse_sets_containing_node(id: NodeId, fn: (node_id: NodeId) => boolean) {
        for (const [set_id] of this.#hierarchy.graph().edges_directed(id, Incoming)) {
            if (fn(set_id)) {
                this.traverse_sets_containing_node(set_id, fn);
            }
        }
    }

    names_of_sets_containing_node(id: NodeId): string[] {
        const sets = new Set<NodeId>();
        this.traverse_sets_containing_node(id, set_id => {
            return !this.#system_sets[set_id.index].is_system_type() && insert_set(sets, set_id)
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

export type ScheduleBuildError = {
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
        return new ScheduleBuildSettings(
            LogLevel.Ignore,
            LogLevel.Warn,
            true,
            true,
            true
        )
    }
};

export type ScheduleNotInitialized = typeof ScheduleNotInitialized;
export const ScheduleNotInitialized = new ErrorExt(undefined, 'executable schedule has not been built')