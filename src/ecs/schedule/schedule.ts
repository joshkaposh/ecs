import { Iterator, drain, range, iter, once } from "joshkaposh-iterator";
import { type Option, type Result, is_some, is_none, is_error, ErrorExt, } from 'joshkaposh-option'
import { type Condition, type System } from "../system/system";
import { World } from "../world";
import { Enum, UNIT, Unit, get_short_name, writeln } from "../../util";
import { Component, Components, Resource, type ComponentId } from '../component'
import { TODO, assert } from "joshkaposh-iterator/src/util";
import { ExecutorKind, SystemSchedule } from "./executor";
import { FixedBitSet } from "../../fixed-bit-set";

// * --- TEMP Variables and Types ---
// @ts-expect-error
type BTreeSet<T> = any;
const Incoming = {}
const Outgoing = {}
// @ts-expect-error
type UnGraphMap<N, E> = any;
// @ts-expect-error
type DiGraphMap<N, E> = any;
// @ts-expect-error
type GraphMap<N, E, Ty> = any;
// * ECS Types 
// @ts-expect-error
type CheckGraphResults<T> = any; //* Maybe not ECS ? 
type GraphInfo = any;

type SystemExecutor = any;

type IntoSytemConfigs = any;
type IntoSytemSetConfigs = any;
type SystemConfig = any;
type SystemSetConfig = any;

// @ts-expect-error
type IntoSystemSet<T> = any;
type InternedSystemSet = any;
type SystemSet = any;
type BoxedSystem = any;

type NodeId = any;
// @ts-expect-error
type NodeConfig<T> = any;

function make_executor(kind: ExecutorKind): any {
    return TODO('make_executor()', kind)
}

class SystemSetNode {
    inner: InternedSystemSet;

    constructor(set: InternedSystemSet) {
        this.inner = set;
    }

    name(): string {
        return `${this.inner}`
    }

    is_system_type(): boolean {
        return is_some(this.inner.system_type());
    }

    is_anonymous(): boolean {
        return this.inner.is_anonymous();
    }
}

class SystemNode {
    inner: Option<BoxedSystem>
    constructor(system: BoxedSystem) {
        this.inner = system;
    }

    name(): string {
        return TODO('SystemNode::name()')
    }

    is_exclusive(): boolean {
        TODO('SystemNode::is_exclusive()')
        return true;
    }
};

export type ScheduleLabel = string;
export type ScheduleId = number;

// @ts-expect-error
type NodeConfigs<T extends ProcessNodeConfig> = any;

interface ProcessConfigsResult {
    nodes: NodeId[];
    densely_chained: boolean;
};
// Trait
interface ProcessNodeConfig {
    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>): NodeId
};
// impl ProcessNodeConfig for BoxedSystem {
//     fn process_config(schedule_graph: &mut ScheduleGraph, config: NodeConfig<Self>) -> NodeId {
//         schedule_graph.add_system_inner(config).unwrap()
//     }
// }

// impl ProcessNodeConfig for InternedSystemSet {
//     fn process_config(schedule_graph: &mut ScheduleGraph, config: NodeConfig<Self>) -> NodeId {
//         schedule_graph.configure_set_inner(config).unwrap()
//     }
// }

type ReportCycles = Enum<typeof ReportCycles>;
const ReportCycles = {
    Hierarchy: 0,
    Dependency: 1,
} as const;

export type ScheduleBuildError = Enum<typeof ScheduleBuildError>;
export const ScheduleBuildError = {
    HierarchyLoop(str: string) {
        return new ErrorExt({ str, type: 'HierarchyLoop' } as const, `System set ${str} contains itself`)
    },
    HierarchyCycle(str: string) {
        return new ErrorExt({ str, type: 'HierarchyCycle' } as const, `System set hierarchy contains cycle(s).\n${str}`);
    },
    HierarchyRedundancy(str: string) {
        return new ErrorExt({ str, type: 'HierarchyRedundancy' } as const, `System set hierarchy contains redundant edges. \n ${str}`)
    },
    DependencyLoop(str: string) {
        return new ErrorExt({ str, type: 'DependencyLoop' } as const, `System set ${str} depends on itself`)
    },
    DependencyCycle(str: string) {
        return new ErrorExt({ str, type: 'DependencyCycle' } as const, `System dependencies contain cycle(s).\n${str}`)
    },
    CrossDependency(a: string, b: string) {
        return new ErrorExt({ a, b, type: 'CrossDependency' } as const, `${a} and ${b} have both 'in_set' and 'before'-'after' relationships (these might be transitive). This combination is unsolvable as a system cannot run before or after a set it belongs to.`)
    },
    SetsHaveOrderButIntesect(a: string, b: string) {
        return new ErrorExt({ a, b, type: 'SetsHaveOrderButIntesect' } as const, `${a} and ${b} have a 'before'-'after' relationship (which may be transitive) but share systems.`)
    },
    SystemTypeSetAmbiguity(str: string) {
        return new ErrorExt({ str, type: 'SystemTypeSetAmbiguity' } as const, `Tried to order against '${str}' in a schedule that has more than one '${str}' instance. '${str}' is a 'SystemTypeSet and cannot be used for ordering if ambiguous. Use A different set without this restriction.'`)
    },
    Ambiguity(str: string) {
        return new ErrorExt({ str, type: 'Ambiguity' } as const, `Systems with conflicting access have indeterminate run order.\n${str}`)
    },
    Uninitialized() {
        return new ErrorExt({ type: 'Uninitialized' } as const, 'Systems in schedule have not been initialized.')
    }
} as const;

export class ScheduleNotInitialized extends ErrorExt {
    constructor(options: ErrorOptions) {
        super(undefined, 'executable schedule has not been built', options)
    }
}

export type LogLevel = Enum<typeof LogLevel>;
export const LogLevel = {
    // Occurences are completely ignored.
    Ignore: 0,
    // Occurences are logged only.
    Warn: 1,
    // Occurences are logged and result in errors.
    Error: 2,
} as const

export type Chain = Enum<typeof Chain>;
export const Chain = {
    Yes: 0,
    YesIgnoreDeferred: 1,
    No: 2,
} as const

type DependencyKind = Enum<typeof DependencyKind>;
const DependencyKind = {
    Before: 0,
    After: 1,
    BeforeNoSync: 2,
    AfterNoSync: 3,
} as const

type Ambiguity = Enum<typeof Ambiguity>;
const Ambiguity = {
    IgnoreWithSet: 0,
    IgnoreAll: 1,
} as const

export class Schedule {
    #label: ScheduleLabel;
    #graph: ScheduleGraph
    #executable: SystemSchedule;
    #executor: SystemExecutor;
    #executor_initialized: boolean;
    constructor(label: ScheduleLabel) {
        this.#label = label;
        this.#graph = new ScheduleGraph();
        this.#executable = SystemSchedule.default();
        this.#executor = make_executor(ExecutorKind.SingleThreaded); //TODO ExecutorKind.default()
        this.#executor_initialized = false;
    }

    label(): ScheduleLabel {
        return this.#label
    }

    add_systems(system: IntoSytemConfigs): this {
        let type!: ProcessNodeConfig;
        TODO('Schedule::add_systems');
        this.#graph.process_configs(type, system.into_configs(), false)
        return this;
    }

    ignore_ambiguity(a_into_system_set: IntoSystemSet<any>, b_into_system_set: IntoSystemSet<any>): this {
        const a = a_into_system_set.into_system_set();
        const b = b_into_system_set.into_system_set();

        const a_id = this.#graph.system_set_ids.get(a.intern());
        if (is_none(a_id)) {
            throw new Error(`Could not mark system as ambigious, ${a}, was not found in the schedule. Did you try to call 'ambiguous_with' before adding the system to the world?`)
        }

        const b_id = this.#graph.system_set_ids.get(b.intern());
        if (is_none(b_id)) {
            throw new Error(`Could not mark system as ambigious, ${b}, was not found in the schedule. Did you try to call 'ambiguous_with' before adding the system to the world?`)
        }

        this.#graph.ambiguous_with.add_edge(a_id, b_id, UNIT);
        return this;
    }

    configure_sets(sets: IntoSytemSetConfigs): this {
        let type: any;
        this.#graph.__configure_sets(type, sets);
        return this
    }

    get_build_settings(): ScheduleBuildSettings {
        return this.#graph.settings.clone();
    }

    get_executor_kind(): ExecutorKind {
        return this.#executor.kind();
    }

    set_executor_kind(executor: ExecutorKind): this {
        if (executor !== this.#executor.kind()) {
            this.#executor = make_executor(executor);
            this.#executor_initialized = false
        }
        return this;
    }

    /**
     * @description
     * Set whether the schedule applies deferred system buffers on final time or not. This is a catch-all
     * in case a system uses commands but was not explicitly ordered before an instance of
     * [`apply_deferred`]. By default this
     * setting is true, but may be disabled if needed.
     */
    set_apply_final_deferred(apply_final_deferred: boolean): this {
        this.#executor.set_apply_final_deferred(apply_final_deferred);
        return this;
    }

    run(world: World) {
        this.initialize(world);
        // .unwrap_or_else(|e| panic!("Error when initializing schedule {:?}: {e}", self.label));

        this.#executor.run(this.#executable, world, null);

        // #[cfg(not(feature = "bevy_debug_stepping"))]
        // self.executor.run(&mut self.executable, world, None);

        // #[cfg(feature = "bevy_debug_stepping")]
        // {
        //     let skip_systems = match world.get_resource_mut::<Stepping>() {
        //         None => None,
        //         Some(mut stepping) => stepping.skipped_systems(self),
        //     };

        //     self.executor
        //         .run(&mut self.executable, world, skip_systems.as_ref());
        // }
    }

    initialize(world: World): Result<Unit, ScheduleBuildError> {
        if (this.#graph.__changed) {
            this.#graph.initialize(world);
            // let ignored_ambiguities = world
            // .get_resource_or_insert_with::<Schedules>(Schedules::default)
            // .ignored_scheduling_ambiguities
            // .clone();
            const err = this.#graph.__update_schedule(
                this.#executable,
                world.components(),
                null, // ignored_ambiguities
                this.#label
            );
            if (err !== UNIT) {
                return err;
            }

            this.#graph.__changed = false;
            this.#executor_initialized = false;
        }

        if (!this.#executor_initialized) {
            this.#executor.init(this.#executable);
            this.#executor_initialized = true;
        }

        return UNIT;
    }

    graph(): ScheduleGraph {
        return this.#graph
    }

    __executable(): SystemSchedule {
        return this.#executable;
    }

    /// Directly applies any accumulated [`Deferred`](crate::system::Deferred) system parameters (like [`Commands`](crate::prelude::Commands)) to the `world`.
    ///
    /// Like always, deferred system parameters are applied in the "topological sort order" of the schedule graph.
    /// As a result, buffers from one system are only guaranteed to be applied before those of other systems
    /// if there is an explicit system ordering between the two systems.
    ///
    /// This is used in rendering to extract data from the main world, storing the data in system buffers,
    /// before applying their buffers in a different world.
    apply_deferred(world: World): void {
        for (const system of this.#executable.__systems) {
            system.apply_deferred(world);
        }
    }

    systems(): Result<Iterator<[NodeId, System]>, ScheduleNotInitialized> {
        if (!this.#executor_initialized) {
            return new ErrorExt(ScheduleNotInitialized);
        }

        return iter(this.#executable.__system_ids)
            .zip(this.#executable.__systems);
    }

    systems_len(): number {
        return !this.#executor_initialized ?
            this.#graph.system_len() :
            this.#executable.__systems.length
    }
};

class Dag {
    #graph: DiGraphMap<NodeId, Unit>;
    #topsort: NodeId[];

    constructor() {
        // this.#graph = new DiGraphMap()
        this.#topsort = [];
    }

    set __graph(new_graph: DiGraphMap<NodeId, Unit>) {
        this.#graph = new_graph;
    }

    set __topsort(new_topsort: NodeId[]) {
        this.#topsort = new_topsort;
    }

    graph(): DiGraphMap<NodeId, Unit> {
        return this.#graph;
    }

    cached_topsort(): NodeId[] {
        return this.#topsort;
    }
}

export class ScheduleBuildSettings {
    constructor(
        public ambiguity_detection: LogLevel,
        public hierarchy_detection: LogLevel,
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

export class ScheduleGraph {
    #systems: SystemNode[];
    #system_conditions: Array<Condition>[];
    #system_sets: SystemSetNode[];
    #system_set_conditions: Array<Condition>[];
    #system_set_ids: Map<SystemSet, NodeId>;
    #uninit: [NodeId, number][];
    #hierarchy: Dag;
    #dependency: Dag;
    #ambiguous_with: UnGraphMap<NodeId, Unit>;
    #ambiguous_with_all: Set<NodeId>;
    #conflicting_systems: [NodeId, NodeId, ComponentId[]][]
    #anonymous_sets: number;
    __changed: boolean;
    #settings: ScheduleBuildSettings;
    #no_sync_edges: BTreeSet<[NodeId, NodeId]>;
    // number = u32
    #auto_sync_node_ids: Map<number, NodeId>

    constructor() {
        this.#systems = [];
        this.#system_conditions = [];
        this.#system_sets = [];
        this.#system_set_conditions = [];
        this.#system_set_ids = new Map();
        this.#uninit = [];
        this.#hierarchy = new Dag();
        this.#dependency = new Dag();
        this.#ambiguous_with = undefined;
        this.#ambiguous_with_all = new Set();
        this.#conflicting_systems = [];
        this.#anonymous_sets = 0;
        this.__changed = false;
        this.#settings = ScheduleBuildSettings.default();
        this.#no_sync_edges = undefined //new BTreeSet()
        this.#auto_sync_node_ids = new Map();
    }

    get settings(): ScheduleBuildSettings {
        return this.#settings;
    }

    get system_set_ids(): Map<SystemSet, NodeId> {
        return this.#system_set_ids;
    }

    get ambiguous_with(): UnGraphMap<NodeId, Unit> {
        return this.#ambiguous_with;
    }

    __get_node_name(id: NodeId): string {
        return this.__get_node_name_inner(id, this.#settings.report_sets);
    }

    __get_node_name_inner(id: NodeId, report_sets: boolean): string {
        let name;
        if (id === NodeId.System()) {
            const _name = this.#systems[id.index()].name();
            if (report_sets) {
                const sets = this.__names_of_sets_containing_node(id);
                if (sets.length === 0) {
                    name = _name;
                } else if (sets.length === 1) {
                    name = ` (in set ${sets[0]})`
                } else {
                    name = ` (in sets ${sets.join(', ')})`
                }
            } else {
                name = _name
            }
        } else if (id === NodeId.Set()) {
            const set = this.#system_sets[id.index()];
            if (set.is_anonymous()) {
                name = this.__anonymous_set_name(id)
            } else {
                name = set.name();
            }
        }
        if (this.#settings.use_shortnames) {
            name = get_short_name(name!);
        }

        return name!;
    }

    __anonymous_set_name(id: NodeId): string {
        const str = this.#hierarchy
            .__graph
            .edges_directed(id, Outgoing)
            .map(([_, member_id]: any) => this.__get_node_name_inner(member_id, false))
            .reduce((a: any, b: any) => `${a}, ${b}`)
            ?? '';
        return `(${str})`;
    }

    __get_node_kind(id: NodeId) {
        return NodeId.System(id) ? 'system' : 'system set';
    }

    __optionally_check_hierarchy_conflicts(
        transitive_edges: [NodeId, NodeId][],
        schedule_label: ScheduleLabel,
    ): Result<Unit, ScheduleBuildError> {
        if (this.#settings.hierarchy_detection === LogLevel.Ignore || transitive_edges.length === 0) {
            return UNIT;
        }

        const message = this.__get_hierarchy_conflicts_error_message(transitive_edges)
        const level = this.#settings.hierarchy_detection;
        if (level === LogLevel.Warn) {
            console.error(`Schedule ${schedule_label} has redundant edges:\n${message}`)
            return UNIT
        } else {
            return ScheduleBuildError.HierarchyRedundancy(message) as any;
        }
    }

    __get_hierarchy_conflicts_error_message(transitive_edges: [NodeId, NodeId][]): string {
        let message = 'hierarchy contains redundant edge(s)'
        for (const [parent, child] of transitive_edges) {
            message += writeln(` -- ${this.__get_node_kind(child)} '${this.__get_node_name(child)}' cannot be child of set '${parent}', longer path exists`)
        }
        return message;
    }

    __topsort_graph(graph: DiGraphMap<NodeId, Unit>, report: ReportCycles): Result<NodeId[], ScheduleBuildError> {
        // Tarjan's SCC algorithm returns elements in *reverse* topological order.
        const tarjac_scc = new TarjanScc();
        const top_sorted_nodes: any[] = [];
        const sccs_with_cycles: any[] = [];

        tarjac_scc.run(graph, (scc: any) => {
            // A strongly-connected component is a group of nodes who can all reach each other
            // through one or more paths. If an SCC contains more than one node, there must be
            // at least one cycle within them.
            if (scc.len() > 1) {
                sccs_with_cycles.push(scc.to_array());
            }
            // top_sorted_nodes.extend_from_slice(scc);
            top_sorted_nodes.push(...scc)
        })

        if (sccs_with_cycles.length === 0) {
            top_sorted_nodes.reverse();
            return top_sorted_nodes
        } else {
            const cycles = [];
            for (const scc of sccs_with_cycles) {
                cycles.push(...simple_cycles_in_component(graph, scc));
            }

            const error = report === ReportCycles.Hierarchy ?
                this.__get_hierarchy_cycles_error_message(cycles) :
                this.__get_dependency_cycles_error_message(cycles)

            return ReportCycles.Hierarchy ?
                ScheduleBuildError.HierarchyLoop(error) as any :
                ScheduleBuildError.DependencyLoop(error) as any
        }
    }

    __get_hierarchy_cycles_error_message(cycles: Array<NodeId>[]): string {
        let message = `Schedule has ${cycles.length} in_set cycle(s):\n`;

        for (const [i, cycle] of iter(cycles).enumerate()) {
            const names = iter(cycle).map(id => this.__get_node_name(id));
            const first_name = names.next().value;
            message += writeln(`cycle ${i + 1}: set ${first_name} contains itself`,
            )

            message += writeln(`set '${first_name}'`)
            for (const name of names.chain(once(first_name))) {
                message += writeln(`... which contains set ${name}`)
            }
        }

        return message;
    }

    __get_dependency_cycles_error_message(cycles: Array<NodeId>[]): string {
        let message = `Schedule has ${cycles.length} before/after cycle(s):\n`;

        for (let i = 0; i < cycles.length; i++) {
            const cycle = cycles[i];
            const names = iter(cycles).map(id => [this.__get_node_kind(id), this.__get_node_name(id)]);
            const [first_kind, first_name] = names.next().value;

            message += writeln(`cycle ${i + 1}: ${first_kind} '${first_name}' must run before itself`);
            message += writeln(`${first_kind} ${first_name}`)

            for (const [kind, name] of names.chain(once([first_kind, first_name]))) {
                message += writeln(` ... which must run before ${kind} '${name}'`)
            }
            message += writeln(message)
        }

        return message
    }

    system_len(): number {
        return this.#systems.length;
    }

    get_system_at(id: NodeId): Option<System> {
        if (!id.is_system()) {
            return null;
        }
        const system = this.#systems[id.index()];
        // return system?.inner.as_deref(); // system.inner ???
        return system?.inner; // system.inner ???

    }

    system_at(id: NodeId): System {
        const system = this.get_system_at(id);
        if (!system) {
            throw new Error(`System with id ${id} does not exist in this Schedule`)
        }
        return system
    }

    get_set_at(id: NodeId): Option<SystemSet> {
        if (!id.is_set()) {
            return null;
        }
        const set = this.#system_sets[id.index()];
        return set?.inner
    }

    set_at(id: NodeId): SystemSet {
        const set = this.get_set_at(id);
        if (!set) {
            throw new Error(`Set with id ${id} does not exist in this Schedule`)
        }
        return set
    }

    systems(): Iterator<[NodeId, System, Condition[]]> {
        return iter(this.#systems)
            .zip(this.#system_conditions)
            .enumerate()
            .filter_map(([i, [system_node, condition]]) => {
                const system = system_node.inner.as_deref()//?
                return !system ? null : [NodeId.System(i), system, condition.as_slice()]
            })
    }

    system_sets(): Iterator<[NodeId, SystemSet, Condition[]]> {
        return iter(this.#system_set_ids).map(([_, node_id]) => {
            const set_node = this.#system_sets[node_id.index()];
            const set = set_node.inner;
            const conditions = this.#system_set_conditions[node_id.index()].as_slice();
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

    __get_dependency_flattened(set_systems: Map<NodeId, NodeId[]>): GraphMap<NodeId, Unit, Directed> {
        const dependency_flattened = this.#dependency.__graph.clone();
        const temp = [];
        for (const [set, systems] of set_systems) {
            if (systems.length === 0) {
                // collapse dependencies for empty sets
                for (const a of dependency_flattened.neighbours_directed(set, Incoming)) {
                    for (const b of dependency_flattened.neighbours_directed(set, Outgoing)) {
                        if (this.#no_sync_edges.contains([a, set])
                            && this.#no_sync_edges.contains(set, b)
                        ) {
                            this.#no_sync_edges.insert([a, b])
                        }
                        temp.push([a, b]);
                    }
                }
            } else {
                for (const a of dependency_flattened.neighbours_directed(set, Incoming)) {
                    for (const sys of systems) {
                        if (this.#no_sync_edges.contains([a, set])) {
                            this.#no_sync_edges.insert([a, sys]);
                        }
                        temp.push([a, sys]);
                    }
                }
                for (const b of dependency_flattened.neighbours_directed(set, Outgoing)) {
                    for (const sys of systems) {
                        if (this.#no_sync_edges.contains([set, b])) {
                            this.#no_sync_edges.insert([sys, b]);
                        }
                        temp.push([sys, b]);
                    }
                }
            }

            dependency_flattened.remove_node(set);
            for (const [a, b] of drain(temp, range(0, temp.length))) {
                dependency_flattened.add_edge(a, b, UNIT);
            }
        }
        return dependency_flattened;
    }

    __get_ambiguous_with_flattened(set_systems: Map<NodeId, NodeId[]>): GraphMap<NodeId, Unit, Undirected> {
        const ambiguous_with_flattened = new UnGraphMap();
        for (const [lhs, rhs] of this.#ambiguous_with.all_edges()) {
            // TODO - match
        }
    }

    __get_conflicting_systems(
        flat_results_disconnected: [NodeId, NodeId][],
        ambiguous_with_flattened: GraphMap<NodeId, Unit, Undirected>,
        ignored_ambiguities: BTreeSet<ComponentId>
    ): [NodeId, NodeId, ComponentId[]][] {
        const conflicting_systems: any[] = []
        for (const [a, b] of flat_results_disconnected) {
            if (ambiguous_with_flattened.contains_edge(a, b)
                || this.#ambiguous_with_all.has(a)
                || this.#ambiguous_with_all.has(b)
            ) {
                continue
            }
            const system_a = this.#systems[a.index()];
            const system_b = this.#systems[b.index()];
            if (system_a.is_exclusive() || system_b.is_exclusive()) {
                conflicting_systems.push([a, b, []]);
            } else {
                const access_a = system_a.component_access();
                const access_b = system_b.component_access();
                if (!access_a.is_compatible(access_b)) {
                    const conflicts = access_a.get_conflicts(access_b)
                        .filter((id: any) => !ignored_ambiguities.contains(id))
                        .collect();
                    if (!(conflicts.length === 0)) {
                        conflicting_systems.push([a, b, conflicts])
                    }
                }
            }
        }

        return conflicting_systems;
    }

    process_configs<T extends ProcessNodeConfig>(type: T, configs: NodeConfigs<T>, collect_nodes: boolean): ProcessConfigsResult {
        if (configs === NodeConfigs.NodeConfig) {
            const node_id = type.process_config(this, config);
            if (collect_nodes) {
                return {
                    densely_chained: true,
                    nodes: [node_id]
                } satisfies ProcessConfigsResult
            } else {
                return {
                    densely_chained: true,
                    nodes: []
                } satisfies ProcessConfigsResult
            }
        } else if (configs === NodeConfigs.Configs) {
            const more_than_one_entry = configs.configs.len() > 1;
            if (!configs.collective_conditions.is_empty()) {
                if (more_than_one_entry) {
                    const set = this.__create_anonymous_set();
                    for (const config of configs.configs) {
                        config.in_set_inner(set)
                    }
                    const set_config = new SystemSetConfig(set);
                    set_config.conditions.extend(configs.collective_conditions);
                    this.__configure_set_inner(set_config)//.unwrap()
                } else {
                    for (const condition of configs.collective_conditions) {
                        configs.configs[0].run_if(condition);
                    }
                }
            }
            const config_iter = configs.into_iter();
            const nodes_in_scope: any[] = [];
            let densely_chained = true;
            if (configs.chained === Chain.Yes || configs.chain === Chain.YesIgnoreDeferred) {
                const prev = config_iter.next();
                if (prev.done) {
                    return {
                        nodes: [],
                        densely_chained: true
                    }
                }
                const previous_result = this.process_configs(type, prev.value, true);
                densely_chained = previous_result.densely_chained;

                for (const current of config_iter) {
                    const current_result = this.process_configs(type, current, true);
                    densely_chained = densely_chained && current_result.densely_chained;

                    if (previous_result.densely_chained
                        && current_result.densely_chained) {
                        const last_in_prev = previous_result.nodes[previous_result.nodes.length - 1];
                        const first_in_current = current_result.nodes[0];
                        this.#dependency.graph().add_edge(
                            last_in_prev,
                            first_in_current,
                            UNIT,
                        )

                        if (configs.chained === Chain.YesIgnoreDeferred) {
                            this.#no_sync_edges.insert([last_in_prev, first_in_current]);
                        }
                    } else if (previous_result.densely_chained
                        && !current_result.densely_chained) {
                        const last_in_prev = previous_result.nodes[previous_result.nodes.length - 1];
                        for (const current_node of current_result.nodes) {
                            this.#dependency.graph().add_edge(
                                last_in_prev,
                                current_node,
                                UNIT,
                            )

                            if (configs.chained === Chain.YesIgnoreDeferred) {
                                this.#no_sync_edges.insert([last_in_prev, current_node]);
                            }
                        }
                    } else if (!previous_result.densely_chained
                        && current_result.densely_chained) {
                        const first_in_current = current_result.nodes[0];
                        for (const previous_node of previous_result.nodes) {
                            this.#dependency.graph().add_edge(
                                previous_node,
                                first_in_current,
                                UNIT
                            )

                            if (configs.chained === Chain.YesIgnoreDeferred) {
                                this.#no_sync_edges.insert([previous_node, first_in_current]);
                            }
                        }
                        // false, false
                    } else {
                        for (const previous_node of previous_result.nodes) {
                            for (const current_node of current_result.nodes) {
                                this.#dependency.__graph.add_edge(
                                    previous_node,
                                    current_node,
                                    UNIT,
                                )

                                if (configs.chained === Chain.YesIgnoreDeferred) {
                                    this.#no_sync_edges.insert([previous_node, current_node])
                                }
                            }
                        }
                    }

                }
                // TODO: process_configs() if collect_nodes
                // if (collect_nodes) {
                // nodes_in_scope.push(...previous_result.nodes)
                // }
                // previous_result = current_result;
            } else {
                for (const config of config_iter) {
                    const result = this.process_configs(type, config, collect_nodes);
                    densely_chained = densely_chained && result.densely_chained;
                    if (collect_nodes) {
                        nodes_in_scope.push(...result.nodes)
                        // extend(nodes_in_scope, result.nodes);
                    }
                }

                if (more_than_one_entry) {
                    densely_chained = false
                }
            }
            return {
                nodes: nodes_in_scope,
                densely_chained
            }
        }
    }

    __add_system_inner(config: SystemConfig): Result<NodeId, ScheduleBuildError> {
        const id = NodeId.System(this.#systems.length);

        const r = this.__update_graphs(id, config.graph_info)//?;
        if (r !== UNIT) {
            return r
        }

        this.#uninit.push([id, 0]);

        this.#systems.push(new SystemNode(config.node));
        this.#system_conditions.push(config.conditions);

        return id;
    }

    __configure_sets(type: any, sets: IntoSytemSetConfigs) {
        this.process_configs(type, sets.into_configs(), false);
    }

    __configure_set_inner(set: SystemSetConfig) {
        const { node: set2, graph_info, conditions } = set;
        let id = this.#system_set_ids.get(set2);
        if (!is_some(id)) {
            id = this.__add_set(set2);
        }

        const r = this.__update_graphs(id, graph_info)
        if (r !== UNIT) {
            return r;
        }
        const system_set_conditions = this.#system_set_conditions[id.index()];
        this.#uninit.push([id, system_set_conditions.length]);
        system_set_conditions.push(...conditions);

        return id;
    }

    __add_set(set: SystemSet): NodeId {
        const id = NodeId.Set(this.#system_sets.length);
        this.#system_sets.push(new SystemSetNode(set));
        this.#system_set_conditions.push([]);
        this.#system_set_ids.set(set, id);
        return id
    }

    __check_set(id: NodeId, set: SystemSet): Result<Unit, ScheduleBuildError> {
        const set_id = this.#system_set_ids.get(set);
        if (id === set_id) {
            return new ErrorExt(ScheduleBuildError.HierarchyLoop(this.get_node_name(id)))
        }
        if (!is_some(set_id)) {
            this.__add_set(set);
        }

        return UNIT;
    }

    __create_anonymous_set() {
        const id = this.#anonymous_sets;
        this.#anonymous_sets += 1;
        return new AnonymousSet(id);
    }

    __check_sets(id: NodeId, graph_info: GraphInfo): Result<Unit, ScheduleBuildError> {
        for (const set of graph_info.sets) {
            const r = this.__check_set(id, set);
            if (r !== UNIT) {
                return r;
            }
        }

        return UNIT;
    }

    __check_edges(id: NodeId, graph_info: GraphInfo): Result<Unit, ScheduleBuildError> {
        for (const { set } of graph_info.dependencies) {
            const set_id = this.#system_set_ids.get(set);
            if (set_id === id) {
                return ScheduleBuildError.DependencyLoop(this.__get_node_name(id)) as any;
            }
            if (is_none(set_id)) {
                this.__add_set(set);
            }
        }

        if (Ambiguity.IgnoreWithSet === graph_info.ambiguous_with) {
            for (const set of graph_info.ambiguous_with) {
                if (!this.#system_set_ids.has(set)) {
                    this.__add_set(set)
                }
            }
        }

        return UNIT;
    }

    __check_for_cross_dependencies(dep_results: CheckGraphResults<NodeId>, hier_results_connected: Set<[NodeId, NodeId]>): Result<Unit, ScheduleBuildError> {
        for (const [a, b] of dep_results.connected) {
            if (hier_results_connected.has([a, b]) || hier_results_connected.has([b, a])) {
                const name_a = this.__get_node_name(a);
                const name_b = this.__get_node_name(b);
                return ScheduleBuildError.CrossDependency(name_a, name_b) as any;
            }
        }

        return UNIT;
    }

    __check_order_but_intersect(
        dep_results_connected: Set<[NodeId, NodeId]>,
        set_system_bitsets: Map<NodeId, FixedBitSet>
    ): Result<Unit, ScheduleBuildError> {
        // check that there is no ordering between system sets that intersect
        for (const [a, b] of dep_results_connected) {
            if (!(a.is_set() && b.is_set())) {
                continue
            }
            const a_systems = set_system_bitsets.get(a)!
            const b_systems = set_system_bitsets.get(b)!

            if (!a_systems.is_disjoint(b_systems)) {
                return ScheduleBuildError.SetsHaveOrderButIntesect(this.__get_node_name(a), this.__get_node_name(b)) as any
            }
        }

        return UNIT;
    }

    __check_system_type_set_ambiguity(set_systems: Map<NodeId, NodeId[]>): Result<Unit, ScheduleBuildError> {
        for (const [id, systems] of set_systems) {
            const set = this.#system_sets[id.index()];
            if (set.is_system_type()) {
                const instances = systems.length;
                const ambiguous_with = this.#ambiguous_with.edges(id);
                const before = this.#dependency.__graph.edges_directed(id, Incoming);
                const after = this.#dependency.__graph.edges_directed(id, Outgoing);
                const relations = before.count() + after.count() + ambiguous_with.count();

                if (instances > 1 && relations > 0) {
                    return ScheduleBuildError.SystemTypeSetAmbiguity(this.__get_node_name(id)) as any
                }
            }
        }
        return UNIT;
    }

    __optionally_check_conflicts(
        conflicts: [NodeId, NodeId, ComponentId[]][],
        components: Components,
        schedule_label: ScheduleLabel
    ): Result<Unit, ScheduleBuildError> {
        if (this.#settings.ambiguity_detection === LogLevel.Ignore) {
            return UNIT;
        }

        const message = this.__get_conflicts_error_message(conflicts, components);
        switch (this.#settings.ambiguity_detection) {
            case LogLevel.Warn:
                console.warn(`Schedule ${schedule_label} has ambiguities.\n${message}`)
                return UNIT
            case LogLevel.Error:
                return ScheduleBuildError.Ambiguity(message) as any;
        }
    }

    __get_conflicts_error_message(ambiguities: [NodeId, NodeId, ComponentId[]][], components: Components): string {
        const n_amiguities = ambiguities.length;
        let message = `${n_amiguities} pairs of systems with conflicting data access have indeterminate execution order. Consider adding 'before', 'after', or 'ambiguous_with' relationships between these:\n`;

        for (const [name_a, name_b, conflicts] of this.__conflicts_to_string(ambiguities, components)) {
            message += writeln(`-- ${name_a} and ${name_b}`);

            if (!(conflicts.length === 0)) {
                message += writeln(`    conflicts on: ${conflicts}`)
            } else {
                // one or both systems must be exclusive
                message += writeln(`    conflict on: World`)
            }
        }

        return message;
    }

    __conflicts_to_string(
        ambiguities: [NodeId, NodeId, ComponentId[]][],
        components: Components
    ) {
        return iter(ambiguities).map(([system_a, system_b, conflicts]) => {
            const name_a = this.__get_node_name(system_a);
            const name_b = this.__get_node_name(system_b);

            assert(system_a.is_system());
            assert(system_b.is_system());

            const conflict_names = iter(conflicts)
                .map(id => components.get_name(id))
                .collect();
            return [name_a, name_b, conflict_names];
        })
    }

    __traverse_sets_containing_node(id: NodeId, fn: (node_id: NodeId) => boolean) {
        for (const [set_id] of this.#hierarchy.__graph.edges_directed(id, Incoming)) {
            if (fn(set_id)) {
                this.__traverse_sets_containing_node(set_id, fn);
            }
        }
    }

    __names_of_sets_containing_node(id: NodeId) {
        const sets = new Set();
        this.__traverse_sets_containing_node(id, (set_id) => {
            const has = sets.has(set_id);
            // TODO - look at HashSet::insert() docs -- return type
            return !this.#system_sets[set_id.index()].is_system_type() && has;
        })

        return iter(sets)
            .map(set_id => this.__get_node_name(set_id))
            .collect()
            .sort();
    }

    __update_graphs(id: NodeId, graph_info: GraphInfo): Result<Unit, ScheduleBuildError> {
        let r = this.__check_sets(id, graph_info);
        if (r !== UNIT) {
            return r
        }
        r = this.__check_edges(id, graph_info);
        if (r !== UNIT) {
            return r
        }

        this.__changed = true;

        const { sets, dependencies, ambiguous_with } = graph_info;

        this.#hierarchy.graph().add_node(id);
        this.#dependency.graph().add_node(id);

        for (const set of sets.into_iter().map((set: any) => this.#system_set_ids.get(set)!)) {
            this.#hierarchy.graph().add_edge(set, id, UNIT);

            // ensure set also appears in dependency graph
            this.#dependency.graph().add_node(set)
        }

        for (const [kind, set] of dependencies.into_iter().map(({ kind, set }: any) => [kind, this.#system_set_ids.get(set)!])) {
            let lhs, rhs;

            if (kind === DependencyKind.Before) {
                lhs = id;
                rhs = set;
            } else if (kind === DependencyKind.BeforeNoSync) {
                this.#no_sync_edges.insert([id, set]);
                lhs = id;
                rhs = set;
            } else if (kind === DependencyKind.After) {
                lhs = set;
                rhs = id;
            } else if (kind === DependencyKind.AfterNoSync) {
                this.#no_sync_edges.insert([set, id]);
                lhs = set;
                rhs = id;
            }

            this.#dependency.graph().add_edge(lhs, rhs, UNIT);

            // ensure set also appears in hierarchy graph
            this.#hierarchy.graph().add_node(set);
        }

        if (ambiguous_with === Ambiguity.IgnoreWithSet) {
            for (const set of ambiguous_with.into_iter().map((set: any) => this.#system_set_ids.get(set)!)) {
                this.#ambiguous_with.add_edge(id, set, UNIT);
            }
        } else if (ambiguous_with === Ambiguity.IgnoreAll) {
            this.#ambiguous_with.insert(id);
        }

        return UNIT;
    }

    initialize(world: World) {
        for (const [id, i] of drain(this.#uninit, range(0, this.#uninit.length))) {
            if (id instanceof NodeId.System) {
                this.#systems[id.index()].initialize(world);
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

    build_schedule(components: Components, schedule_label: ScheduleLabel, ignored_ambiguities: BTreeSet<ComponentId>): Result<SystemSchedule, ScheduleBuildError> {
        let topsort = this.__topsort_graph(this.#hierarchy.graph(), ReportCycles.Hierarchy);
        if (!Array.isArray(topsort)) {
            return topsort
        }
        this.#hierarchy.__topsort = topsort

        const hier_results = check_graph(this.#hierarchy.graph(), this.#hierarchy.cached_topsort());
        //?
        this.__optionally_check_hierarchy_conflicts(hier_results.transitive_edges, schedule_label);
        //?
        this.#hierarchy.__graph = hier_results.transitive_reduction;

        topsort = this.__topsort_graph(this.#dependency.graph(), ReportCycles.Dependency)
        if (!Array.isArray(topsort)) {
            return topsort
        }

        this.#dependency.__topsort = topsort

        const dep_results = check_graph(this.#dependency.graph(), this.#dependency.cached_topsort());
        this.__check_for_cross_dependencies(dep_results, hier_results.connected)//?;

        const [set_systems, set_system_bitsets] = this.__map_sets_to_systems(this.#hierarchy.cached_topsort(), this.#hierarchy.graph()) //?
        this.__check_order_but_intersect(dep_results.connected, set_system_bitsets)//?;

        this.__check_system_type_set_ambiguity(set_systems)//?

        let dependency_flattened = this.__get_dependency_flattened(set_systems);

        if (this.#settings.auto_insert_apply_deferred) {
            dependency_flattened = this.auto_insert_apply_deferred(dependency_flattened)//?
        }

        const dependency_flattened_dag = new Dag(
            // topsort: self.topsort_graph(&dependency_flattened, ReportCycles::Dependency)?,
            // graph: dependency_flattened,
        )

        const flat_results = check_graph(dependency_flattened_dag.graph(), dependency_flattened_dag.cached_topsort())

        dependency_flattened_dag.__graph = flat_results.transitive_reduction;

        const ambiguous_with_flattened = this.__get_ambiguous_with_flattened(set_systems);

        const conflicting_systems = this.__get_conflicting_systems(
            flat_results.disconnected,
            ambiguous_with_flattened,
            ignored_ambiguities
        )

        this.__optionally_check_conflicts(conflicting_systems, components, schedule_label)//?

        this.#conflicting_systems = conflicting_systems;

        return this.__build_schedule_inner(dependency_flattened_dag, hier_results.reachable);
    }

    __build_schedule_inner(dependency_flattened_dag: Dag, reachable: any) {
        const dg_system_ids = structuredClone(dependency_flattened_dag.__topsort);
        const dg_system_idx_map = iter(dg_system_ids)
            .enumerate()
            .map(([i, id]) => [id, i] as [any, number])
            .collect(Map<any, number>);

        const hg_systems = iter(this.#hierarchy.__topsort)
            .enumerate()
            .filter(([_i, id]) => id.is_system())
            .collect()

        const [hg_set_with_conditions_idxs, hg_set_ids] = iter(this.#hierarchy.__topsort)
            .enumerate()
            .filter(([_i, id]) => {
                return id.is_set() && !(this.#system_set_conditions[id.index()].length === 0)
            })
            .unzip()

        const sys_count = this.#systems.length;
        const set_with_conditions_count = hg_set_ids.length;
        const hg_node_count = this.#hierarchy.__graph.node_count();

        // with_capacity(sys_count)
        const system_dependencies = []
        // with_capacity(sys_count)
        const system_dependents = []

        for (const sys_id of dg_system_ids) {
            const num_dependencies = dependency_flattened_dag
                .__graph
                .neighbours_directed(sys_id, Incoming)
                .count();

            const dependents = dependency_flattened_dag
                .__graph
                .neighbours_directed(sys_id, Outgoing)
                .map(dep_id => dg_system_idx_map.get(dep_id))
                .collect();
            system_dependencies.push(num_dependencies);
            system_dependents.push(dependents)
        }

        const systems_in_sets_with_conditions = Array.from({ length: set_with_conditions_count }, () => FixedBitSet.with_capacity(sys_count))
        for (const [i, row] of iter(hg_set_with_conditions_idxs).enumerate()) {
            const bitset = systems_in_sets_with_conditions[i];
            for (const [col, sys_id] of hg_systems) {
                const idx = dg_system_idx_map.get(sys_id)!;
                const is_descendant = reachable[index(row, col, hg_node_count)];
                bitset.set(idx, is_descendant);
            }
        }

        const sets_with_conditions_of_systems = Array.from({ length: sys_count }, () => FixedBitSet.with_capacity(set_with_conditions_count))
        for (const [col, sys_id] of hg_systems) {
            const i = dg_system_idx_map.get(sys_id)!;
            const bitset = sets_with_conditions_of_systems[i];
            for (const [idx, row] of iter(hg_set_with_conditions_idxs).enumerate().take_while(([_idx, row]) => row < col)) {
                const is_ancestor = reachable[index(row, col, hg_node_count)];
                bitset.set(idx, is_ancestor);
            }
        }

        return new SystemSchedule(
            [],//TODO with_capacity(sys_count)
            [],//TODO with_capacity(sys_count)
            [],//TODO with_capacity(set_with_conditions_count)
            dg_system_ids,
            hg_set_ids,
            system_dependencies,
            system_dependents,
            sets_with_conditions_of_systems,
            systems_in_sets_with_conditions
        );

        return TODO<any>('Schedule::#build_schedule_inner', dependency_flattened_dag, reachable);

    }


    __update_schedule(
        schedule: SystemSchedule,
        components: Components,
        ignored_ambiguities: BTreeSet<ComponentId>,
        schedule_label: ScheduleLabel
    ): Result<Unit, ScheduleBuildError> {
        if (!(this.#uninit.length === 0)) {
            return ScheduleBuildError.Uninitialized() as any;
        }

        // move systems out of old schedule
        for (const [[id, system], conditions] of drain(schedule.__system_ids, range(0, schedule.__system_ids.length))
            .zip(drain(schedule.__systems, range(0, schedule.__systems.length)))
            .zip(drain(schedule.__system_conditions, range(0, schedule.__system_conditions.length)))
        ) {
            this.#systems[id.index()].inner = system;
            this.#system_conditions[id.index()] = conditions;
        }

        for (const [id, conditions] of drain(schedule.__set_ids, range(0, schedule.__set_ids.length))
            .zip(drain(schedule.__set_conditions, range(0, schedule.__set_conditions.length)))
        ) {
            this.#system_set_conditions[id.index()] = conditions;
        }

        const new_schedule = this.build_schedule(components, schedule_label, ignored_ambiguities);
        if (is_error(new_schedule)) {
            return new_schedule
        }
        schedule = new_schedule;

        for (const id of schedule.__system_ids) {
            const system = this.#systems[id.index()].inner;
            this.#systems[id.index()].inner = null;
            const conditions = this.#system_conditions[id.index()];
            this.#system_conditions[id.index()] = [];
            schedule.__systems.push(system);
            schedule.__system_conditions.push(conditions);
        }

        for (const id of schedule.__set_ids) {
            const conditions = this.#system_set_conditions[id.index()];
            this.#system_set_conditions[id.index()] = [];
            schedule.__set_conditions.push(conditions);
        }

        return UNIT
    }
}

export class Schedules {
    #schedules: Map<ScheduleLabel, Schedule>;
    #ignored_scheduling_ambiguities: BTreeSet<ComponentId>;

    constructor() {
        this.#schedules = new Map();
        // this.#ignored_scheduling_ambiguities = new BTreeSet();
    }

    get ignored_scheduling_ambiguities(): BTreeSet<ComponentId> {
        return this.#ignored_scheduling_ambiguities;
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

    contains(label: ScheduleLabel): boolean {
        return this.#schedules.has(label);
    }

    /**
     * Returns a reference to the schedule associated with the `label`, if it exists.
     */
    get(label: ScheduleLabel): Option<Schedule> {
        return this.#schedules.get(label)
    }

    iter() {
        return iter(() => this.#schedules.entries());
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        for (const schedule of this.#schedules.values()) {
            schedule.set_build_settings(schedule_build_settings.clone());
        }
    }

    allow_ambiguous_component(world: World, type: Component) {
        this.#ignored_scheduling_ambiguities.insert(world.init_component(type))
    }

    allow_ambiguous_resource(world: World, type: Resource<Component>) {
        this.#ignored_scheduling_ambiguities.insert(world.init_resource(type))
    }

    iter_ignored_ambiguities(): Iterator<ComponentId> {
        return this.#ignored_scheduling_ambiguities.iter();
    }

    print_ignored_ambiguities(components: Components) {
        let message = 'System order ambiguities caused by conflicts on the following types are ignored:\n';

        for (const id of this.iter_ignored_ambiguities()) {
            message += `${components.get_name(id)}\n`
        }

        console.info(message);
    }

    // /**
    //  * @description
    //  * `add_schedule` adds a schedule to the `Schedules` with the provided `label`.
    //  * 
    //  * `add_schedule` will overwrite any existing schedule at the `label`.
    //  */
    // add_schedule(label: ScheduleLabel, schedule: Schedule) {
    //     this.#schedules.set(label, schedule);
    // }

    // get_schedule(label: ScheduleLabel): Option<Schedule> {
    //     return this.#schedules.get(label)
    // }

    // add_system(label: ScheduleLabel, system: System) {
    //     this.get_schedule(label)?.add_system(system);
    // }
};
