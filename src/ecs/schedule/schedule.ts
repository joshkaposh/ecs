import { Iterator, drain, range, iter, once } from "joshkaposh-iterator";
import { TODO, assert } from "joshkaposh-iterator/src/util";
import { Heap } from "joshkaposh-heap";
import { IndexMap, IndexSet } from "joshkaposh-index-map";
import { type Option, type Result, is_some, is_none, is_error, ErrorExt, } from 'joshkaposh-option'
import { IntoConfig, type Condition, type System } from "../system/system";
import { World } from "../world";
import { UNIT, Unit } from "../../util";
import { Component, Components, Resource, Tick, type ComponentId } from '../component'
import { ExecutorKind, SystemSchedule } from "./executor";
import { FixedBitSet } from "../../fixed-bit-set";
import { Directed, TarjanScc, Undirected, UnGraphMap, Incoming, Outgoing, DiGraphMap, GraphMap, Topo, toposort } from "joshkaposh-graph";
import { extend } from "../../array-helpers";
import { Configs, IntoSytemSetConfigs, NodeConfig, NodeConfigs, SystemConfig, SystemSet } from "./config";
import { define_resource } from "../define";
import { StorageType } from "../storage";

// * --- TEMP Variables and Types ---

// * ECS Types
// type CheckGraphResults<T> = any; //* Maybe not ECS ?

type Dependency = any
type SystemExecutor = any;

// @ts-expect-error
type IntoSystemSet<T> = any;
type InternedSystemSet = any;
type BoxedSystem = any;

export type NodeId = InstanceType<typeof NodeId[keyof typeof NodeId]>;
export const NodeId = {
    System: class {
        constructor(public index: number) { }
        is_system() { return true }
        is_set() { return false }
        [Symbol.toPrimitive]() {
            return this.index
        }
    },
    SystemSet: class {
        constructor(public index: number) { }
        is_system() { return false }
        is_set() { return true }
        [Symbol.toPrimitive]() {
            return this.index
        }
    }
};

function make_executor(_kind: ExecutorKind): SystemExecutor {
    return {
        run(executable: SystemSchedule, world: World) {
            executable
        }
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
        return is_some(this.inner.system_type());
    }

    is_anonymous(): boolean {
        return this.inner.is_anonymous();
    }
}

export class SystemNode {
    inner: Option<BoxedSystem>
    constructor(system: BoxedSystem) {
        this.inner = system;
    }

    name(): string {
        return TODO('SystemNode::name()')
    }

    initialize(world: World) {

    }

    component_access(): any {
        return {}
    }

    is_exclusive(): boolean {
        TODO('SystemNode::is_exclusive()')
        return true;
    }
};

export type ScheduleLabel = string;
export type ScheduleId = number;

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
        this.#executor = make_executor(ExecutorKind.SingleThreaded); //TODO ExecutorKind.default()
        this.#executor_initialized = false;
    }

    label(): ScheduleLabel {
        return this.#label
    }

    add_system(system: IntoConfig) {
        this.#graph.process_config(system, false);
        return this;
    }

    add_systems(systems: System[]) {
        this.#graph.process_configs(systems, false)
        return this;
    }

    run(world: World) {
        this.initialize(world);
        this.#executable.run()
    }

    initialize(world: World): Result<Unit, any> {
        if (!this.#executor_initialized) {
            this.#executor
        }

        this.#graph.build_schedule(world.components(), this.#label)

        return UNIT;
    }

    graph(): ScheduleGraph {
        return this.#graph
    }

};

class Dag {
    __graph: DiGraphMap<NodeId, Unit>;
    #topsort: NodeId[];

    constructor(graph: DiGraphMap<NodeId, Unit> = DiGraphMap(), topsort: NodeId[] = []) {
        this.__graph = graph;
        this.#topsort = topsort;
    }

    topsort() {
        this.#topsort = toposort(this.__graph) ?? [];
    }

    set __topsort(new_topsort: NodeId[]) {
        this.#topsort = new_topsort;
    }

    graph(): DiGraphMap<NodeId, Unit> {
        return this.__graph;
    }

    cached_topsort(): NodeId[] {
        return this.#topsort;
    }
}

export class ScheduleBuildSettings {
    constructor(
        public ambiguity_detection: any, // LogLevel,
        public hierarchy_detection: any, //LogLevel,
        public auto_insert_apply_deferred: boolean,
        public use_shortnames: boolean,
        public report_sets: boolean
    ) { }

    clone() {
        return new ScheduleBuildSettings(this.ambiguity_detection, this.hierarchy_detection, this.auto_insert_apply_deferred, this.use_shortnames, this.report_sets)
    }

    static default(): ScheduleBuildSettings {
        return new ScheduleBuildSettings(null, null, true, true, true)
    }
};

export class ScheduleGraph {
    #systems: SystemNode[];
    #system_ids: Map<System | Condition, number>;
    #system_conditions: Array<Condition>[];
    #system_sets: SystemSetNode[];
    #system_set_conditions: Array<Condition>[];
    #system_set_ids: Map<SystemSet, NodeId>;
    #uninit: [NodeId, number][];
    #hierarchy: Dag;
    #dependency: Dag;
    #ambiguous_with: UnGraphMap<NodeId, Unit>;
    #ambiguous_with_all: IndexSet<NodeId>;
    #conflicting_systems: [NodeId, NodeId, ComponentId[]][]
    #anonymous_sets: number;
    __changed: boolean;
    #settings: ScheduleBuildSettings;
    #no_sync_edges: Heap<[NodeId, NodeId]>;
    #auto_sync_node_ids: Map<number, NodeId>

    constructor() {
        this.#systems = [];
        this.#system_ids = new Map();
        this.#system_conditions = [];
        this.#system_sets = [];
        this.#system_set_conditions = [];
        this.#system_set_ids = new Map();
        this.#uninit = [];
        this.#hierarchy = new Dag();
        this.#dependency = new Dag();
        this.#ambiguous_with = UnGraphMap();
        this.#ambiguous_with_all = new IndexSet();
        this.#conflicting_systems = [];
        this.#anonymous_sets = 0;
        this.__changed = false;
        this.#settings = ScheduleBuildSettings.default();
        this.#no_sync_edges = Heap.Min()
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

    update_schedule(schedule: SystemSchedule, components: Components, ignore_ambiguity: Option<boolean>, label: ScheduleLabel): any {
    }

    system_len(): number {
        return this.#systems.length;
    }

    get_system_at(id: NodeId): Option<System<any, any>> {
        if (!id.is_system()) {
            return null;
        }
        const system = this.#systems[id.index];
        return system?.inner;

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

    systems(): Iterator<[NodeId, System, Condition[]]> {
        return iter(this.#systems)
            .zip(this.#system_conditions)
            .enumerate()
            .filter_map(([i, [system_node, condition]]) => {
                const system = system_node.inner
                return !system ? null : [new NodeId.System(i), system, condition] as [NodeId, System, Condition[]]
            })
    }

    system_sets(): Iterator<[NodeId, SystemSet, Condition[]]> {
        return iter(this.#system_set_ids).map(([_, node_id]) => {
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

    process_configs(configs: System[], collect_nodes: boolean): any {
        for (const config of configs) {
            this.process_config(config, collect_nodes)
        }
    }

    process_config(config: IntoConfig, collect_nodes: boolean) {
        // add system to graph if not there already
        const cfg_id = this.#get_or_insert_system(config)

        config.conditions().for_each(cond => {
            const cond_id = this.#get_or_insert_system(cond as any);
            this.#dependency.__graph.update_edge(cond_id, cfg_id, UNIT);
        })

        config.dependencies().for_each(([a, b]) => {
            const dep_id = this.#get_or_insert_system(a);
            const sys_id = this.#get_or_insert_system(b);
            this.#dependency.__graph.update_edge(dep_id, sys_id, UNIT)
        })
    }

    #insert_new_system(config: System): NodeId {
        const len = this.#systems.length
        this.#systems.push(new SystemNode(config as any))
        this.#system_conditions.push([])
        const id = new NodeId.System(len);
        this.#system_ids.set(config, len);
        this.#dependency.__graph.add_node(id);
        return id
    }

    #get_or_insert_system(config: IntoConfig) {
        return !this.#system_ids.has(config) ? this.#insert_new_system(config) : this.#dependency.__graph.from_node_index(this.#system_ids.get(config)!)
    }

    initialize(world: World) {
        for (const [id, i] of drain(this.#uninit, range(0, this.#uninit.length))) {
            if (id instanceof NodeId.System) {
                this.#systems[id.index].initialize(world);
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

    build_schedule(_components: Components, schedule_label: ScheduleLabel): Option<System[]> {
        this.dependency().topsort();
        return this.dependency().cached_topsort().map(id => this.system_at(id));
    }

}

export class Schedules {
    #schedules: Map<ScheduleLabel, Schedule>;
    #ignored_scheduling_ambiguities: Heap<ComponentId>;
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => Schedules;

    constructor() {
        this.#schedules = new Map();
        this.#ignored_scheduling_ambiguities = Heap.Min();
    }

    get ignored_scheduling_ambiguities(): Heap<ComponentId> {
        return this.#ignored_scheduling_ambiguities;
    }

    check_change_ticks(change_tick: Tick) {

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
        return this.#schedules.entries();
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        for (const schedule of this.#schedules.values()) {
            // schedule.set_build_settings(schedule_build_settings.clone());
        }
    }
    // /**
    //  @description
    //  `add_schedule` adds a schedule to the `Schedules` with the provided `label`.
    //  
    //  `add_schedule` will overwrite any existing schedule at the `label`.
    //  */
    add_schedule(label: ScheduleLabel, schedule: Schedule) {
        this.#schedules.set(label, schedule);
    }
};
define_resource(Schedules);
