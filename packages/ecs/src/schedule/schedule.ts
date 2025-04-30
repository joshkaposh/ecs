import { Iterator, iter } from "joshkaposh-iterator";
import { ErrorExt, type Option, type Result } from 'joshkaposh-option'
import { FixedBitSet } from "fixed-bit-set";
import BTree from "sorted-btree";
import { defineResource } from "define";
import type { System } from "../system/system";
import { World } from "../world";
import { insert_set, debug_assert } from "../util";
import { Component, Components, Resource, Tick, type ComponentId } from '../component'
import { ExecutorKind, is_apply_deferred, SystemExecutor, SystemSchedule } from "../executor";
import { DiGraph, UnGraph, Outgoing, Incoming, GraphInfo, DependencyKind, check_graph, index, Ambiguity } from './graph'
import { ScheduleConfigs, ScheduleConfig, Schedulable, IntoScheduleConfig, SystemConfig } from "./config";
import { NodeId, NodeIdString } from "./graph/node";
import { CheckGraphResults, simple_cycles_in_component } from "./graph";
import { SingleThreadedExecutor } from "../executor/single-threaded";
import { AnonymousSet, InternedSystemSet, IntoSystemSet, SystemSet } from "./set";
import { Condition } from "./condition";
import { ScheduleBuildPassObj } from "./pass";
import { $is_system } from "../system";
import { StorageType } from "../storage";
import { AutoInsertApplyDeferredPass } from "./auto-insert-apply-deferred";

type BTreeSet<T> = BTree<T, undefined>;
type ScheduleSystem = System<any, any>;

function make_executor(kind: ExecutorKind): SystemExecutor {
    switch (kind) {
        case 0:
            return new SingleThreadedExecutor()
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
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => InstanceType<typeof Schedules>;

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
        const old = this.#schedules.get(schedule.label);
        this.#schedules.set(schedule.label, schedule);
        return old;
    }

    remove(label: ScheduleLabel): Option<Schedule> {
        const old = this.#schedules.get(label);
        this.#schedules.delete(label)
        return old;
    }

    removeEntry(label: ScheduleLabel): Option<[InternedScheduleLabel, Schedule]> {
        const old = this.remove(label);
        if (old) {
            return [label, old]
        }
        return
    }

    has(label: ScheduleLabel): boolean {
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

    checkChangeTicks(change_tick: Tick) {
        for (const schedule of this.#schedules.values()) {
            schedule.checkChangeTicks(change_tick)
        }
    }

    configureSchedules(schedule_build_settings: ScheduleBuildSettings) {
        for (const schedule of this.#schedules.values()) {
            schedule.build_settings = schedule_build_settings.clone();
        }
    }

    allowAmbiguousComponent(component: Component, world: World) {
        this.ignored_scheduling_ambiguities.set(world.registerComponent(component), undefined);
    }

    allowAmbiguousResource(resource: Resource, world: World) {
        this.ignored_scheduling_ambiguities.set(world.registerResource(resource), undefined);
    }

    iterIgnoredAmbiguities() {
        return iter(this.ignored_scheduling_ambiguities.keys());
    }

    printIgnoredAmbiguities(components: Components) {
        let message = 'System order ambiguities caused by conflicts on the following types are ignored: \n';
        for (const id of this.iterIgnoredAmbiguities()) {
            message += `${components.getName(id)} \n`
        }
        console.log(message);
    }

    addSystems<M extends IntoScheduleConfig<Schedulable>>(schedule: ScheduleLabel, systems: M) {
        this.entry(schedule).addSystems(systems)
        return this;

    }

    configureSets(schedule: ScheduleLabel, sets: ScheduleConfigs) {
        this.entry(schedule).configureSets(sets);
        return this;
    }

    ignoreAmbiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(schedule: ScheduleLabel, a: S1, b: S2) {
        this.entry(schedule).ignoreAmbiguity(a, b);
        return this;
    }
};
defineResource(Schedules);

const DefaultSchedule = 'DefaultSchedule'
export class Schedule {
    #label: ScheduleLabel;
    #graph: ScheduleGraph;
    #executable: SystemSchedule;
    #executor: SystemExecutor;
    #executor_initialized: boolean;
    constructor(label: ScheduleLabel = DefaultSchedule) {
        this.#label = label;
        this.#graph = new ScheduleGraph();
        this.#executable = new SystemSchedule();
        this.#executor = make_executor(ExecutorKind.SingleThreaded);
        this.#executor_initialized = false;
    }

    get label(): ScheduleLabel {
        return this.#label
    }

    get graph(): ScheduleGraph {
        return this.#graph
    }

    get executable() {
        return this.#executable
    }

    addSystems<M extends IntoScheduleConfig<any>>(systems: M) {
        this.#graph.processConfigs(systems.intoConfig(), false)
        return this;
    }

    ignoreAmbiguity<M1, M2, S1 extends IntoSystemSet<M1>, S2 extends IntoSystemSet<M2>>(a: S1, b: S2) {
        a = a.intoSystemSet() as unknown as S1;
        b = b.intoSystemSet() as unknown as S2;
        const a_id = this.#graph.systemSetIds.get(a as unknown as SystemSet)
        if (!a_id) {
            throw new Error(`Could not mark system as ambiguous, ${a} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        const b_id = this.#graph.systemSetIds.get(b as unknown as SystemSet)
        if (!b_id) {
            throw new Error(`Could not mark system as ambiguous, ${b} was not found in the schedule.
                    Did you try to call \`ambiguous_with\` before adding the system to the world?`
            )
        }
        this.#graph.ambiguousWith.add_edge(a_id, b_id)
    }

    configureSets<M extends Schedulable<SystemSet, Chain>>(sets: IntoScheduleConfig<M>) {
        this.#graph.configureSets(sets);
        return this
    }

    set build_settings(settings: ScheduleBuildSettings) {
        this.#graph.settings = settings
    }

    get build_settings() {
        return this.#graph.settings.clone();
    }

    get executor_kind(): ExecutorKind {
        return this.#executor.kind();
    }

    set_executor_kind(executor: ExecutorKind) {
        if (executor !== this.#executor.kind()) {
            this.#executor = make_executor(executor);
            this.#executor_initialized = false;
        }
        return this;
    }

    setApplyFinalDeferred(apply_final_deferred: boolean) {
        this.#executor.setApplyFinalDeferred(apply_final_deferred)
        return this;
    }

    run(world: World) {
        world.checkChangeTicks();
        const err = this.initialize(world)
        if (err) throw new Error(`Error when initializing schedule ${this.#label}: ${err}`)


        this.#executor.run(this.#executable, world, undefined);
    }

    initialize(world: World) {
        if (this.#graph.__changed) {
            this.#graph.initialize(world);
            const ignored_ambiguities = world.getResourceOrInit(Schedules).v.ignored_scheduling_ambiguities.clone();
            const err = this.#graph.updateSchedule(
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

            // console.log('Schedule Build: ', this.label);
            // try {
            // console.log('systems order: ', this.#executable.__systems.map((s, i) => ({ name: s.name, conditions: this.#executable.__system_conditions[i].map(c => c.name) })));
            // } catch (error) {
            // console.error(error);
            // }


        }

        return;
    }

    /**
     * Iterates the change ticks of all systems in the schedule and clamps any older than `MAX_CHANGE_AGE`.
     * This prevents overflow and thus prevents false positives.
     */
    checkChangeTicks(change_tick: Tick) {
        const { __systems, __system_conditions, __set_conditions } = this.#executable;
        for (let i = 0; i < __systems.length; i++) {
            if (!is_apply_deferred(__systems[i])) {
                __systems[i].checkChangeTick(change_tick)
            }
        }

        for (let i = 0; i < __system_conditions.length; i++) {
            const conditions = __system_conditions[i];
            for (let j = 0; j < conditions.length; j++) {
                conditions[j].checkChangeTick(change_tick);
            }
        }


        for (let i = 0; i < __set_conditions.length; i++) {
            const conditions = __set_conditions[i];
            for (let j = 0; j < conditions.length; j++) {
                conditions[j].checkChangeTick(change_tick);
            }
        }

    }

    applyDeferred(world: World) {
        for (const system of this.#executable.__systems) {
            system.applyDeferred(world);
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

interface Dag {
    graph: DiGraph;
    topsort: NodeId[];
}

export class SystemSetNode {
    inner: InternedSystemSet;

    constructor(set: InternedSystemSet) {
        this.inner = set;
    }

    get name(): string {
        return `${this.inner}`;
    }

    get isSystemType(): boolean {
        return this.inner.systemType != null;
    }

    get isAnonymous(): boolean {
        return this.inner.isAnonymous;
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
    #systems: SystemNode[];
    /** Map of systems to system ids */
    #system_ids: Map<System<any, any>, NodeId>;
    /** List of conditions for each system, in the same order as systems */
    #system_conditions: Array<Condition<any, any>>[];
    /** List of system sets in the schedule */
    #system_sets: SystemSetNode[];
    /** List of conditions for each system set, in the same order as system sets */
    #system_set_conditions: Array<Condition<any, any>>[];
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
    ambiguous_with_all: Set<NodeIdString>;
    #conflicting_systems: [NodeId, NodeId, ComponentId[]][]
    #anonymous_sets: number;
    __changed: boolean;
    #settings!: ScheduleBuildSettings;

    #passes: BTree<UUID, ScheduleBuildPassObj>;

    constructor(
        systems: SystemNode[] = [],
        system_conditions: Array<Condition<any, any>>[] = [],
        system_ids: Map<System<any, any>, NodeId> = new Map(),
        system_sets: Array<SystemSetNode> = [],
        system_set_conditions: Array<Array<Condition<any, any>>> = [],
        system_set_ids: Map<InternedSystemSet, NodeId> = new Map(),
        uninit: Array<[NodeId, number]> = [],
        hierarchy: Dag = { topsort: [], graph: DiGraph() },
        dependency: Dag = { topsort: [], graph: DiGraph() },
        ambiguous_with: UnGraph = UnGraph(),
        ambiguous_with_all: Set<NodeIdString> = new Set(),
        conflicting_systems: Array<[NodeId, NodeId, ComponentId[]]> = [],
        anonymous_sets = 0,
        changed = false,
        settings: ScheduleBuildSettings = ScheduleBuildSettings.default(),
        passes: BTree<any, ScheduleBuildPassObj> = new BTree()
    ) {
        this.#systems = systems;
        this.#system_conditions = system_conditions;
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
        this.#passes = passes;
        this.settings = settings;
    }

    get systems() {
        return this.#systems
    }

    get systemConditions() {
        return this.#system_conditions;
    }

    get settings(): ScheduleBuildSettings {
        return this.#settings;
    }

    set settings(new_settings: ScheduleBuildSettings) {
        this.#settings = new_settings

        if (new_settings.auto_insert_apply_deferred) {
            this.#passes.set(AutoInsertApplyDeferredPass.type_id, new AutoInsertApplyDeferredPass())
        } else {
            this.#passes.delete(AutoInsertApplyDeferredPass.type_id)
        }

    }

    get systemSetIds(): Map<SystemSet, NodeId> {
        return this.#system_set_ids;
    }

    get ambiguousWith(): UnGraph {
        return this.#ambiguous_with;
    }

    addBuildPass(type_id: UUID, pass: ScheduleBuildPassObj) {
        this.#passes.set(type_id, pass);
    }

    removeBuildPass(type_id: UUID) {
        this.#passes.delete(type_id);
    }

    hasSet(set: SystemSet) {
        return this.#system_set_ids.has(set);
    }

    getSystemAt(id: NodeId): Option<ScheduleSystem> {
        return !id.is_system() ? undefined : this.#systems[id.index].inner;
    }

    systemAt(id: NodeId): ScheduleSystem {
        const system = this.getSystemAt(id);
        if (!system) throw new Error(`System with id ${id} does not exist in this Schedule`)
        return system
    }

    getSetAt(id: NodeId): Option<SystemSet> {
        return !id.is_set() ? undefined : this.#system_sets[id.index].inner;
    }

    setAt(id: NodeId): SystemSet {
        const set = this.getSetAt(id);
        if (!set) {
            throw new Error(`Set with id ${id} does not exist in this Schedule`)
        }
        return set
    }

    getSetConditionsAt(id: NodeId): Option<Condition<any>[]> {
        return !id.is_set() ? undefined : this.#system_set_conditions[id.index];
    }

    setConditionsAt(id: NodeId) {
        const conditions = this.getSetConditionsAt(id);
        if (!conditions) {
            throw new Error(`Set with id ${id} does not exist in this Schedule`)
        }
        return conditions;
    }

    systemsIter(): Iterator<[NodeId, System<any, any>, Condition<any, any>[]]> {
        return iter(this.#systems)
            .zip(this.#system_conditions)
            .enumerate()
            .filter_map(([i, [system_node, condition]]) => {
                const system = system_node.inner
                return !system ? null : [new NodeId.System(i), system, condition] as [NodeId, System<any, any>, Condition<any, any>[]]
            })
    }

    systemSetsIter(): Iterator<[NodeId, SystemSet, Condition<any, any>[]]> {
        return iter(this.#system_set_ids.values()).map((node_id) => {
            const index = node_id.index;
            const set = this.#system_sets[index].inner;
            const conditions = this.#system_set_conditions[index]
            return [node_id, set, conditions];
        })
    }

    get hierarchy(): Dag {
        return this.#hierarchy;
    }

    get dependency(): Dag {
        return this.#dependency;
    }

    conflictingSystems(): [NodeId, NodeId, ComponentId[]][] {
        return this.#conflicting_systems
    }

    createAnonymousSet() {
        const id = this.#anonymous_sets;
        this.#anonymous_sets += 1;
        return new AnonymousSet(id);
    }

    applyCollectiveConditions(configs: readonly ScheduleConfigs[], collective_conditions: Condition<any, any>[]) {
        if (collective_conditions.length !== 0) {
            const [config] = configs;
            if (config) {
                for (const condition of collective_conditions) {
                    // @ts-expect-error
                    config.runIfDyn(condition);
                }
            } else {
                const set = this.createAnonymousSet();
                for (const config of configs) {
                    // @ts-expect-error
                    config.inSetInner(set);
                }

                debug_assert(set.systemType == null, 'Configuring system type sets is not allowed');

                const set_config = set.intoConfig();
                // TODO: maybe needs ScheduleConfig instead of Configs
                // const set_config = new ScheduleConfigs.ScheduleConfig(set, {
                //     hierarchy: [],
                //     ambiguous_with: [],
                //     dependencies: [],
                // }, [])
                set_config.collective_conditions.push(...collective_conditions);
                this.configureSetInner(set_config as any);
            }
        }
    }

    processConfig<T extends ScheduleConfig<Schedulable>>(
        config: T,
        collect_nodes: boolean
    ): ProcessConfigsResult {
        const nodes: NodeId[] = [];
        const cfg = config.processConfig(this);
        if (!(cfg instanceof NodeId)) {
            throw new Error(cfg as any);
        }
        if (collect_nodes) {
            nodes.push(cfg);
        }

        return {
            densely_chained: true,
            nodes
        }
    }

    processConfigs(_configs: ScheduleConfigs, collect_nodes: boolean): ProcessConfigsResult {
        if (_configs instanceof ScheduleConfig) {
            return this.processConfig(_configs, collect_nodes);
        } else {
            const { configs, collective_conditions, chained } = _configs;
            this.applyCollectiveConditions(configs, collective_conditions);
            const is_chained = chained instanceof Map;
            let densely_chained = is_chained || configs.length === 1;
            const nodes: any[] = [];

            if (configs.length === 0) {
                return {
                    nodes: [],
                    densely_chained
                }
            }
            const first = configs[0];

            let previous_result = this.processConfigs(first, collect_nodes || is_chained);

            densely_chained = densely_chained && previous_result.densely_chained;

            for (let j = 1; j < configs.length; j++) {
                const current = configs[j];
                const current_result = this.processConfigs(current, collect_nodes || is_chained);
                densely_chained = densely_chained && current_result.densely_chained;

                if (chained instanceof Map) {
                    const chain_options = chained;
                    const current_nodes = current_result.densely_chained ? current_result.nodes.slice(0, 1) : current_result.nodes;
                    const previous_nodes = previous_result.densely_chained ? previous_result.nodes.slice(previous_result.nodes.length - 1) : previous_result.nodes;

                    for (let i = 0; i < previous_nodes.length; i++) {
                        const previous_node = previous_nodes[i];
                        for (let j = 0; j < current_nodes.length; j++) {
                            const current_node = current_nodes[j];
                            this.#dependency.graph.add_edge(previous_node, current_node);
                            this.#passes.forEachPair((_, pass) => pass.addDependency(
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

            return {
                densely_chained: Boolean(densely_chained),
                nodes
            }
        }
    }

    configureSets<M extends Schedulable>(sets: IntoScheduleConfig<M>) {
        this.processConfigs(sets.intoConfig(), false);
    }

    addSystemInner(config: ScheduleConfig<Schedulable>): Result<NodeId, ScheduleBuildError> {
        const id = new NodeId.System(this.#systems.length);
        const err = this.#updateGraphs(id, config.graph_info);
        if (err) return err;

        this.#uninit.push([id, 0]);
        this.#systems[id.index] = new SystemNode(config.node as any);
        this.#system_conditions[id.index] = config.conditions;
        this.#system_ids.set(config.node as any, id);
        return id;
    }

    configureSetInner(set_: SystemConfig): Result<NodeId, ScheduleBuildError> {
        const { node: set, graph_info, conditions } = set_;

        const id = this.#system_set_ids.get(set as any) ?? this.#addSet(set as any);

        // graph updates are immediate
        const err = this.#updateGraphs(id, graph_info);
        if (err) return err

        const system_set_conditions = this.#system_set_conditions[id.index];
        this.#uninit[id.index] = [id, system_set_conditions.length];
        system_set_conditions.push(...conditions);
        return id;
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
                this.#systems[id.index].inner!.initialize(world);
                const conditions = this.#system_conditions[id_index];
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
    buildSchedule(
        world: World,
        schedule_label: ScheduleLabel,
        ignored_ambiguities: BTreeSet<ComponentId>,
    ) {
        let err;
        err = this.topsortGraph(this.#hierarchy.graph, ReportCycles.Hierarchy);
        if (!Array.isArray(err)) return err;
        this.#hierarchy.topsort = err;

        const hier_results = check_graph(this.#hierarchy.graph, this.#hierarchy.topsort)
        err = this.optionallyCheckHierarchyConflicts(hier_results.transitive_edges, schedule_label);
        if (err) return err;

        // remove redundant edges
        this.#hierarchy.graph = hier_results.transitive_reduction;

        // check dependencies for cycles
        err = this.topsortGraph(this.#dependency.graph, ReportCycles.Dependency);
        if (!Array.isArray(err)) return err

        this.#dependency.topsort = err;
        // check for systems or system sets depending on sets they belong to
        const dep_results = check_graph(this.#dependency.graph, this.#dependency.topsort)
        err = this.#checkForCrossDependencies(dep_results, hier_results.connected)
        if (err) return err;

        // map all system sets to their systems
        // go in reverse topological order (bottom-up) for efficiency
        const [set_systems, set_system_bitsets] = this.#mapSetsToSystems(this.#hierarchy.topsort, this.#hierarchy.graph);

        err = this.#checkOrderButIntersect(dep_results.connected, set_system_bitsets);
        if (err) return err
        err = this.#checkSystemTypeSetAmbiguity(set_systems);
        if (err) return err;

        const dependency_flattened = this.#getDependencyFlattened(set_systems);

        const passes = this.#passes;
        this.#passes = new BTree();
        const result = passes.forEachPair((_, pass) => {
            const result = pass.build(world, this, dependency_flattened);
            return result ? { break: result } : undefined;
        })
        if (typeof result !== 'number') {
            return result
        }

        const topsort = this.topsortGraph(dependency_flattened, ReportCycles.Dependency);

        if (!Array.isArray(topsort)) return topsort;

        const dependency_flattened_dag: Dag = {
            graph: dependency_flattened,
            topsort
        }

        const flat_results = check_graph(dependency_flattened_dag.graph, dependency_flattened_dag.topsort);

        // remove redundant edges
        dependency_flattened_dag.graph = flat_results.transitive_reduction;

        // flatten: combine `in_set` with `ambiguous_with` information
        const ambiguous_with_flattened = this.#getAmbiguousWithFlattened(set_systems);

        // check for conflicts
        const conflicting_systems = this.#getConflictingSystems(
            flat_results.disconnected,
            ambiguous_with_flattened,
            ignored_ambiguities
        )

        err = this.#optionallyCheckConflicts(conflicting_systems, world.components, schedule_label);
        if (err) return err;

        this.#conflicting_systems = conflicting_systems;
        const sched = this.#buildScheduleInner(dependency_flattened_dag, hier_results.reachable);
        // console.log('BuildSchedule: ', sched.__systems, sched.__system_ids);

        return sched;
    }

    #addSet(set: InternedSystemSet): NodeId {
        const id = new NodeId.Set(this.#system_sets.length);
        this.#system_sets.push(new SystemSetNode(set));
        this.#system_set_conditions.push([]);
        this.#system_set_ids.set(set, id);
        return id;
    }

    #checkHierarchySet(id: NodeId, set: SystemSet): Result<undefined, ScheduleBuildError> {
        // @ts-expect-error
        if (set[$is_system]) {
            // @ts-expect-error
            set = set.intoSystemSet();
        }

        const set_id = this.#system_set_ids.get(set);
        if (set_id) {
            if (id.eq(set_id)) {
                return ScheduleBuildError.HierarchyLoop(this.nodeName(id))
            }
        } else {
            this.#addSet(set);
        }

        return

    }

    #checkHierarchySets(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        const { hierarchy } = graph_info
        for (let i = 0; i < hierarchy.length; i++) {
            const set = hierarchy[i];
            const err = this.#checkHierarchySet(id, set);
            if (err) return err;
        }
        return
    }

    /**
     * Checks that no system set is dependent on itself.
     * Add all the sets from the `GraphInfo`'s dependencies to the graph.
     */
    #checkEdges(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        const { dependencies } = graph_info;
        for (let i = 0; i < dependencies.length; i++) {
            const { set } = dependencies[i];
            const set_id = this.#system_set_ids.get(set);
            if (set_id) {
                if (id.eq(set_id)) {
                    return ScheduleBuildError.DependencyLoop(this.nodeName(id))
                }
            } else {
                this.#addSet(set);
            }
        }

        // const ambiguous_with = graph_info.ambiguous_with;
        // if (Array.isArray(ambiguous_with)) {
        //     for (let i = 0; i < ambiguous_with.length; i++) {
        //         const set = ambiguous_with[i];
        //         if (!this.system_set_ids.has(set)) {
        //             this.#addSet(set);
        //         }
        //     }
        // }

        return
    }

    /**
     * Update the internal graphs (hierarchy, dependency, ambiguity) by adding a single GraphInfo
     */
    #updateGraphs(id: NodeId, graph_info: GraphInfo): Result<undefined, ScheduleBuildError> {
        let err;
        err = this.#checkHierarchySets(id, graph_info);
        if (err) return err
        err = this.#checkEdges(id, graph_info);
        if (err) return err
        this.__changed = true;

        const { hierarchy: sets, dependencies, ambiguous_with } = graph_info;
        this.#hierarchy.graph.add_node(id);
        this.#dependency.graph.add_node(id);

        for (let i = 0; i < sets.length; i++) {
            const set = this.#system_set_ids.get(sets[i])!;
            this.#hierarchy.graph.add_edge(set, id);
            // ensure set also appears in dependency graph
            this.#dependency.graph.add_node(set);
        }

        for (let i = 0; i < dependencies.length; i++) {
            const d = dependencies[i];
            const { kind, options } = d;
            const set = this.#system_set_ids.get(d.set);
            if (!set) {
                throw new Error('Set must exist at this point.')
            }
            const [lhs, rhs]: [NodeId, NodeId] = DependencyKind.Before === kind ? [id, set] : [set, id];
            this.#dependency.graph.add_edge(lhs, rhs);
            this.#passes.forEachPair((_, pass) => pass.addDependency(lhs, rhs, options))

            // ensure set also appears in hierarchy graph
            this.#hierarchy.graph.add_node(set);
        }

        switch (ambiguous_with) {
            case Ambiguity.Check:
                break;
            case Ambiguity.IgnoreAll:
                this.ambiguous_with_all.add(id.to_primitive())
                break;
            default:
                for (let i = 0; i < ambiguous_with.length; i++) {
                    const set = this.#system_set_ids.get(ambiguous_with[i])!;
                    this.#ambiguous_with.add_edge(id, set);
                }
                break;
        }

        return
    }

    /**
     * Return a map from system set `NodeId` to a list of system `NodeId`s that are included in the set.
     * Also return a map from system set `NodeId` to a `FixedBitSet` of system `NodeId`s that are included in the set,
     * where the bitset order is the same as this.systems
     */
    #mapSetsToSystems(hierarchy_topsort: NodeId[], hierarchy_graph: DiGraph): [Map<string, NodeId[]>, Map<string, FixedBitSet>] {
        const set_systems: Map<string, NodeId[]> = new Map();
        const set_system_bitsets: Map<string, FixedBitSet> = new Map();

        const system_length = this.#systems.length;

        for (let i = hierarchy_topsort.length - 1; i >= 0; i--) {
            const id = hierarchy_topsort[i];
            if (id.is_system()) continue;

            const systems = [];
            const system_bitset = FixedBitSet.with_capacity(system_length);

            const hierarchy = hierarchy_graph.neighbors_directed(id, Outgoing);

            for (let i = 0; i < hierarchy.length; i++) {
                const child = hierarchy[i];
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

        // console.log('MapSetsToSystems: ', Array.from(set_systems.entries()));


        return [set_systems, set_system_bitsets];
    }

    #getDependencyFlattened(set_systems: Map<string, NodeId[]>): DiGraph {
        // flatten: combine `in_set` with `before` and `after` information
        // have to do it like this to preserve transitivity
        const dependency_flattened = this.#dependency.graph.clone();
        const temp: [NodeId, NodeId][] = [];

        for (const [set, systems] of set_systems) {
            const set_id = NodeId.to_node_id(set);
            this.#passes.forEachPair((_, pass) => pass.collapseSet(set_id, systems, dependency_flattened, temp))

            if (systems.length === 0) {
                // collapse dependencies for empty sets
                for (const a of dependency_flattened.neighbors_directed(set_id, Incoming)) {
                    for (const b of dependency_flattened.neighbors_directed(set_id, Outgoing)) {
                        temp.push([a, b]);
                    }
                }
            } else {
                for (const a of dependency_flattened.neighbors_directed(set_id, Incoming)) {
                    for (const sys of systems) {
                        temp.push([a, sys])
                    }
                }

                for (const b of dependency_flattened.neighbors_directed(set_id, Outgoing)) {
                    for (const sys of systems) {
                        temp.push([sys, b])
                    }
                }
            }

            dependency_flattened.remove_node(set_id);
            for (let i = 0; i < temp.length; i++) {
                const [a, b] = temp[i];
                dependency_flattened.add_edge(a, b);
            }
            temp.length = 0;
        }

        return dependency_flattened;
    }

    #getAmbiguousWithFlattened(set_systems: Map<string, NodeId[]>): UnGraph {
        const ambiguous_with_flattened = UnGraph();
        for (const [lhs, rhs] of this.#ambiguous_with.all_edges()) {
            const l = lhs instanceof NodeId.System, r = rhs instanceof NodeId.System;

            if (l && r) {
                ambiguous_with_flattened.add_edge(lhs, rhs);
            } else if (!l && r) {
                for (const lhs_ of set_systems.get(lhs.to_primitive()) ?? []) {
                    ambiguous_with_flattened.add_edge(lhs_, rhs);
                }
            } else if (l && !r) {
                for (const rhs_ of set_systems.get(rhs.to_primitive()) ?? []) {
                    ambiguous_with_flattened.add_edge(lhs, rhs_);
                }
            } else {
                for (const lhs_ of set_systems.get(lhs.to_primitive()) ?? []) {
                    for (const rhs_ of set_systems.get(rhs.to_primitive()) ?? []) {
                        ambiguous_with_flattened.add_edge(lhs_, rhs_)
                    }
                }
            }
        }
        return ambiguous_with_flattened;
    }

    #getConflictingSystems(
        flat_results_disconnected: Array<[NodeId, NodeId]>,
        ambiguous_with_flattened: UnGraph,
        ignored_ambiguities: BTreeSet<ComponentId>
    ): Array<[NodeId, NodeId, ComponentId[]]> {
        const conflicting_systems: any[] = [];
        for (const [a, b] of flat_results_disconnected) {
            if (ambiguous_with_flattened.contains_edge(a, b)
                || this.ambiguous_with_all.has(a.to_primitive())
                || this.ambiguous_with_all.has(b.to_primitive())
            ) {
                continue
            }

            const system_a = this.#systems[a.index].get()!
            const system_b = this.#systems[b.index].get()!
            if (system_a.is_exclusive || system_b.is_exclusive) {
                conflicting_systems.push([a, b, []])
            } else {
                const access_a = system_a.componentAccess();
                const access_b = system_b.componentAccess();

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

    #buildScheduleInner(
        dependency_flattened_dag: Dag,
        hier_results_reachable: FixedBitSet
    ) {
        const cache = dependency_flattened_dag.topsort
        const dg_system_ids = cache.filter(id => id.is_system());
        // const dg_system_ids = Array.from({ length: cache.length }, (_, i) => cache[i])
        // console.log('DgSystemIds', dg_system_ids);

        const dg_system_idx_map = new Map(iter(dg_system_ids)
            .enumerate()
            .map(([i, id]) => [id.to_primitive(), i])
            .collect() as [string, number][]);

        const hg_systems = iter(this.#hierarchy.topsort)
            .enumerate()
            .filter(([_, id]) => id.is_system())
            .collect()

        const [hg_set_with_conditions_idxs, hg_set_ids] = iter(this.#hierarchy.topsort)
            .enumerate()
            .filter(([_, id]) => id.is_set() && this.#system_set_conditions[id.index].length > 0)
            .unzip();
        const sys_count = this.#systems.length;
        const set_with_conditions_count = hg_set_ids.length;
        const hg_node_count = this.#hierarchy.graph.node_count();

        const system_dependencies = [];
        const system_dependents = [];

        for (let i = 0; i < dg_system_ids.length; i++) {
            const sys_id = dg_system_ids[i];
            const num_dependencies = dependency_flattened_dag
                .graph
                .neighbors_directed(sys_id, Incoming)
                .length;

            const dependents = dependency_flattened_dag
                .graph
                .neighbors_directed(sys_id, Outgoing)
                .map(dep_id => dg_system_idx_map.get(dep_id.to_primitive())!)

            system_dependencies.push(num_dependencies);
            system_dependents.push(dependents);
        }

        const systems_in_sets_with_conditions = Array.from({ length: set_with_conditions_count }, () => FixedBitSet.with_capacity(sys_count));
        for (let i = 0; i < hg_set_with_conditions_idxs.length; i++) {
            const row = hg_set_with_conditions_idxs[i];
            const bitset = systems_in_sets_with_conditions[i];
            for (let j = 0; j < hg_systems.length; j++) {
                const [col, sys_id] = hg_systems[j]
                const idx = dg_system_idx_map.get(sys_id.to_primitive())!;
                const is_descendant = hier_results_reachable.contains(index(row, col, hg_node_count));
                bitset.set(idx, is_descendant);
            }
        }

        const sets_with_conditions_of_systems = Array.from({ length: sys_count }, () => FixedBitSet.with_capacity(set_with_conditions_count));
        for (let i = 0; i < hg_systems.length; i++) {
            const [col, sys_id] = hg_systems[i];
            const ix = dg_system_idx_map.get(sys_id.to_primitive())!;
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
            [],
            // new Array(sys_count),
            [],
            // new Array(sys_count),
            [],
            // new Array(set_with_conditions_count),
            dg_system_ids,
            hg_set_ids,
            system_dependencies,
            system_dependents,
            sets_with_conditions_of_systems,
            systems_in_sets_with_conditions
        )
    }

    updateSchedule(
        world: World,
        schedule: SystemSchedule,
        ignored_ambiguities: BTreeSet<ComponentId>,
        schedule_label: InternedScheduleLabel
    ) {

        if (this.#uninit.length !== 0) return ScheduleBuildError.Uninitialized()
        // move systems out of old schedule

        for (let i = 0; i < schedule.__system_ids.length; i++) {
            const index = schedule.__system_ids[i].index;
            this.#systems[index].inner = schedule.__systems[i];
            this.#system_conditions[index] = schedule.__system_conditions[i];
        }

        schedule.__system_ids.length = 0;
        schedule.__systems.length = 0;
        schedule.__system_conditions.length = 0;

        for (let i = 0; i < schedule.__set_ids.length; i++) {
            this.#system_set_conditions[schedule.__set_ids[i].index] = schedule.__set_conditions[i];
        }
        schedule.__set_ids.length = 0;
        schedule.__set_conditions.length = 0;

        const err_or_sched = this.buildSchedule(world, schedule_label, ignored_ambiguities);
        if (!(err_or_sched instanceof SystemSchedule)) {
            return err_or_sched;
        }

        // console.log('ErrOrSched', err_or_sched.__system_ids);

        schedule.cloneFrom(err_or_sched);
        // move systems into new schedule
        const system_ids = schedule.__system_ids;
        // console.log('updateSchedule systems length:', system_ids, system_ids.length, schedule.__systems.length);

        for (let i = 0; i < system_ids.length; i++) {
            const id = system_ids[i];
            const system = this.#systems[id.index].inner!;
            this.#systems[id.index].inner = null;
            const conditions = this.#system_conditions[id.index];
            this.#system_conditions[id.index] = [];
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

    /**
     * Tries to topologically sort `graph`.
     * @returns an array of `NodeId`s in topological order if no cycles were found, otherwise returns an error that contains an array of SCCs that contain cycles (also in a topological order).
     */
    topsortGraph(graph: DiGraph, report: ReportCycles): Result<NodeId[], ScheduleBuildError> {
        const top_sorted_nodes: NodeId[] = [];
        const sccs_with_cycles = [];

        for (const scc of graph.iter_sccs()) {
            top_sorted_nodes.push(...scc);
            // if scc length > 1 then i must contain at least one cycle.
            if (scc.length > 1) {
                sccs_with_cycles.push(scc)
            }
        }

        if (sccs_with_cycles.length === 0) {
            return top_sorted_nodes.reverse();
        } else {
            const cycles: [NodeId, NodeId][] = [];
            for (const scc of sccs_with_cycles) {
                cycles.push(simple_cycles_in_component(graph, scc) as unknown as [NodeId, NodeId])
            }

            const err = report === ReportCycles.Hierarchy ? ScheduleBuildError.HierarchyCycle(
                this.getHierarchyCyclesErrorMessage(cycles)
            ) :
                ScheduleBuildError.DependencyCycle(
                    this.getDependencyCyclesErrorMessage(cycles)
                )

            return err;
        }

    }

    optionallyCheckHierarchyConflicts(transitive_edges: Array<[NodeId, NodeId]>, schedule_label: InternedScheduleLabel): Result<undefined, ScheduleBuildError> {
        if (this.#settings.hierarchy_detection === LogLevel.Ignore || transitive_edges.length === 0) {
            return
        }

        const message = this.getHierarchyCyclesErrorMessage(transitive_edges);

        if (this.settings.hierarchy_detection === LogLevel.Warn) {
            console.warn(`Schedule ${schedule_label} has redundant edges:\n${message}`)
            return;
        } else {
            // LogLevel.Error
            return ScheduleBuildError.HierarchyRedundancy(message);
        }
    }

    nodeKind(id: NodeId): 'set' | 'system' {
        return id.is_system() ? 'system' : 'set';
    }

    nodeName(id: NodeId): string {
        return this.#nodeNameInner(id, this.settings.report_sets)
    }

    #nodeNameInner(id: NodeId, report_sets: boolean): string {
        let name;

        if (id.is_system()) {
            const name_ = this.#systems[id.index].inner!.name;

            if (report_sets) {
                const sets = this.namesOfSetsContainingNode(id);
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

            if (set.isAnonymous) {
                name = this.anonymousSetName(id);
            } else {
                name = set.name;
            }

            if (set.inner.systemType) {
                const start = `${name}`.search('name:');
                name = name.slice(start);
                const end = name.indexOf('\n') - 1;
                name = name.slice(6, end)
            }

        }

        return name;
    }

    anonymousSetName(id: NodeId) {
        return `${this.#hierarchy.graph
            .edges_directed(id, Outgoing)
            .map(([_, member_id]) => this.#nodeNameInner(member_id, false))
            .reduce(([a, b]) => `${a}, ${b}`), ''}`
    }

    getHierarchyCyclesErrorMessage(
        transitive_edges: Array<[NodeId, NodeId]>,
    ): string {
        let message = "hierarchy contains redundant edge(s):\n";

        for (const [parent, child] of transitive_edges) {
            message += `\n -- ${this.nodeKind(child)} \`${this.nodeName(child)}\` cannot be child of set ${this.nodeName(parent)}`;
        }

        return message
    }

    getDependencyCyclesErrorMessage(cycles: Array<NodeId[]>) {
        let message = `schedule has ${cycles.length} before/after cycles:\n`
        for (const [i, cycle] of iter(cycles).enumerate()) {
            const names = iter(cycle).map(id => [this.nodeKind(id), this.nodeName(id)] as const);
            const [first_kind, first_name] = names.next().value;
            message += `\ncycle ${i + 1}: ${first_kind} ${first_name} must run before itself`;
            message += `\n${first_kind} ${first_name}`;

            for (const [kind, name] of names.chain(iter.once([first_kind, first_name]) as any)) {
                message += `\n... which must run before ${kind} ${name}`;
            }
            message = `\n${message}`
        }
        return message;
    }

    #checkForCrossDependencies(
        dep_results: CheckGraphResults,
        hier_results_connected: CheckGraphResults['connected']
    ): Result<undefined, ScheduleBuildError> {
        for (const str of dep_results.connected) {

            if (hier_results_connected.has(str)) {
                const [astr, bstr] = str.split('-');
                const a = NodeId.to_node_id(astr);
                const b = NodeId.to_node_id(bstr);
                const name_a = this.nodeName(a);
                const name_b = this.nodeName(b);
                return ScheduleBuildError.CrossDependency(name_a, name_b);
            }
        }

        return
    }

    #checkOrderButIntersect(
        dep_results_connected: CheckGraphResults['connected'],
        set_system_bitsets: Map<string, FixedBitSet>
    ): Result<undefined, ScheduleBuildError> {
        // check that there is no ordering between system sets that intersect
        for (const str of dep_results_connected) {
            const [astr, bstr] = str.split('-');
            const a = NodeId.to_node_id(astr);
            const b = NodeId.to_node_id(bstr);

            if (!(a.is_set() && b.is_set())) {
                continue
            }

            const a_systems = set_system_bitsets.get(a.to_primitive())!;
            const b_systems = set_system_bitsets.get(b.to_primitive())!;

            if (!a_systems.is_disjoint(b_systems)) {
                return ScheduleBuildError.SetsHaveOrderButIntersect(
                    this.nodeName(a),
                    this.nodeName(b)
                )
            }
        }
        return
    }

    #checkSystemTypeSetAmbiguity(set_systems: Map<string, NodeId[]>): Result<undefined, ScheduleBuildError> {
        for (const [str, systems] of set_systems) {
            const id = NodeId.to_node_id(str)
            const set = this.#system_sets[id.index];
            if (set.isSystemType) {
                const instances = systems.length;
                const ambiguous_with = this.#ambiguous_with.edges(id);
                const before = this.#dependency.graph.edges_directed(id, Incoming);
                const after = this.#dependency.graph.edges_directed(id, Outgoing);
                const relations = before.length + after.length + ambiguous_with.length;
                if (instances > 1 && relations > 0) {
                    return ScheduleBuildError.SystemTypeSetAmbiguity(this.nodeName(id))
                }
            }
        }
        return
    }

    /**
     * This is skipped if settings.ambiguity_detection === LogLevel.Ignore
     */
    #optionallyCheckConflicts(
        conflicts: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components,
        schedule_label: InternedScheduleLabel
    ): Result<undefined, ScheduleBuildError> {
        if (this.#settings.ambiguity_detection === LogLevel.Ignore || conflicts.length === 0) {
            return
        }

        let message = this.getConflictsErrorMessage(conflicts, components);

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

    getConflictsErrorMessage(
        ambiguities: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components
    ): string {
        const n_ambiguities = ambiguities.length;

        let message = `${n_ambiguities} pairs of systems with conflicting data access have indeterminate execution order. Consider adding \`before\`, \`after\`, or \`ambiguous_with\` relationships between these: \n`;

        for (const [name_a, name_b, conflicts] of this.conflictsToString(ambiguities, components)) {
            message += `\n-- ${name_a} and ${name_b}`;
            if (conflicts.length !== 0) {
                message += `\n conflict on: ${conflicts}`;
            } else {
                message += `\n    conflict on: world`;
            }
        }
        return message
    }

    conflictsToString(
        ambiguities: Array<[NodeId, NodeId, ComponentId[]]>,
        components: Components
    ): Iterator<[string, string, string[]]> {
        return iter(ambiguities).map(([sys_a, sys_b, conflicts]) => {
            const name_a = this.nodeName(sys_a);
            const name_b = this.nodeName(sys_b);
            const conflict_names = conflicts.map(id => components.getName(id)!);
            return [name_a, name_b, conflict_names] as const;
        })
    }

    traverseSetsContainingNode(id: NodeId, fn: (node_id: NodeId) => boolean) {
        for (const [set_id] of this.#hierarchy.graph.edges_directed(id, Incoming)) {
            if (fn(set_id)) {
                this.traverseSetsContainingNode(set_id, fn);
            }
        }
    }

    namesOfSetsContainingNode(id: NodeId): string[] {
        const sets = new Set<NodeId>();
        this.traverseSetsContainingNode(id, set_id => {
            return !this.#system_sets[set_id.index].isSystemType && insert_set(sets, set_id)
        })

        return iter(sets)
            .map(set_id => this.nodeName(set_id))
            .collect()
            .sort();
    }
}

type ProcessConfigsResult = {
    /**
     * All nodes contained inside this `processConfigs` call's `NodeConfigs` hierarchy
     * if `ancestor_chained` is true
     */
    nodes: NodeId[];
    // True if and only if all nodes are "densely chained", meaning that all nested nodes
    // are linearly chained (as if `after` system order had been applied between each node)
    // in the order they are defined
    densely_chained: boolean;
}

export interface ProcessScheduleConfig {
    processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId
}

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

    CrossDependency(a: string, b: string) {
        return new ErrorExt({ a, b, type: 'CrossDependency' } as const, `${a} and ${b} have both \`in_set\` and \`before\`-\`after\` relationships (these might be transitive). This combination is unsolvable as a system cannot run before or after a set it belongs to`)
    },

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