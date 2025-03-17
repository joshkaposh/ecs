import { v4 } from "uuid";
import { NodeId } from "../schedule/graph";
import { World } from "../world";
import { Access } from "../query";
import { Condition, ScheduleGraph, Tick } from "..";
import { unit } from "../util";
import { ErrorExt, Option } from "joshkaposh-option";
import { InternedSystemSet, IntoSystemSet, SystemSet, SystemTypeSet } from "../schedule/set";
import { IntoSystemConfigs, NodeConfig, NodeConfigs, SystemConfig, SystemConfigs } from "../schedule/config";
import { TODO } from "joshkaposh-iterator/src/util";

export type SystemIn<T> = any;

export abstract class System<In, Out> implements IntoSystemConfigs<unit> {
    static readonly type_id: UUID;

    /**
     * A system is fallible if it returns a value
     */
    abstract readonly fallible: boolean;

    abstract is_send(): boolean;
    abstract is_exclusive(): boolean;
    abstract has_deferred(): boolean;

    abstract type_id(): UUID;
    abstract name(): string;
    abstract initialize(world: World): void;

    abstract component_access(): Access;
    abstract archetype_component_access(): Access;

    abstract run_unsafe(input: SystemIn<System<In, Out>>, world: World): Out;
    abstract validate_param_unsafe(world: World): boolean

    abstract apply_deferred(world: World): void;
    abstract queue_deferred(world: World): void;

    abstract update_archetype_component_access(world: World): void;

    abstract check_change_tick(change_tick: Tick): void;

    abstract get_last_run(): Tick;
    abstract set_last_run(last_run: Tick): void;

    process_config(schedule_graph: ScheduleGraph, config: SystemConfig) {
        const id = schedule_graph.add_system_inner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    chain() {
        return this.into_configs();
    }


    run(input: SystemIn<System<In, Out>>, world: World) {
        this.update_archetype_component_access(world);
        const ret = this.run_unsafe(input, world);
        this.apply_deferred(world);
        return ret;
    }

    validate_param(world: World): boolean {
        this.update_archetype_component_access(world);
        return this.validate_param_unsafe(world);
    }

    default_system_sets(): InternedSystemSet[] {
        return [];

    }

    // pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
    //     TODO('System.pipe()')
    //     // @ts-expect-error
    //     return IntoPipeSystem.new(this, this)
    // }

    // map<T>(fn: (output: Out) => T) {
    //     TODO('System.map()')
    //     // @ts-expect-error
    //     IntoAdaperSystem.new(fn, this)
    // }

    system_type_id() {
        return this.type_id();
    }

    //* IntoSystem impl

    into_system() {
        return this;
    }

    //* IntoSystemConfigs impl

    into_configs(): SystemConfigs {
        return this.fallible ?
            NodeConfigs.new_system((this)) :
            NodeConfigs.new_system(this as System<In, void>)
    }

    run_if(condition: Condition<any>) {
        return this.into_configs().run_if(condition)
    }

    before<M>(other: IntoSystemSet<M>) {
        return this.into_configs().before(other);
    }

    after<M>(other: IntoSystemSet<M>) {
        return this.into_configs().after(other);
    }

    //* IntoSystemSet impl
    into_system_set() {
        return new SystemTypeSet(this) as SystemSet;
    }

    [Symbol.toPrimitive]() {
        return `System {
            name: ${this.name()},
            is_exclusive: ${this.is_exclusive()},
            is_send: ${this.is_send()}
        }`
    }

    [Symbol.toStringTag]() {
        return `System {
            name: ${this.name()},
            is_exclusive: ${this.is_exclusive()},
            is_send: ${this.is_send()}
        }`
    }

};

export function check_system_change_tick(last_run: Tick, this_run: Tick, system_name: string) {
    if (last_run.check_tick(this_run)) {
        const age = this_run.relative_to(last_run).get();
        console.warn(`System ${system_name} has not run for ${age} ticks. Changed older than ${Tick.MAX.get() - 1} will not be detected.`)
    }
}

interface IntoSystem<In, Out, Marker> {
    into_system(): System<In, Out>;
}

export type RunSystemOnce = {
    run_system_once<Out, Marker, T extends IntoSystem<unit, Out, Marker>>(system: T): void;
    run_system_once_with<Out, Marker, T extends IntoSystem<any, Out, Marker>>(system: T): void;
}

export type RunSystemError = ErrorExt<string>;
export const RunSystemError = {
    InvalidParams(name: string) {
        return new ErrorExt(name);
    }
} as const;

export type BoxedSystem<In extends any[] = any[], Out = void | boolean> = System<In, Out>;
export type SystemId = number;

export class AnonymousSet implements SystemSet {
    #id: NodeId;
    constructor(id: NodeId) {
        this.#id = id;
    }

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<InternedSystemSet>): NodeId {
        const id = schedule_graph.configure_set_inner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    system_type(): Option<UUID> {
        return
    }

    is_anonymous(): boolean {
        return true;
    }
}

export function assert_is_system(system: System<any, any>) {
    const world = new World();
    system.initialize(world);
}

export class ApplyDeferred extends System<unit, unit> {
    static readonly type_id: UUID = v4() as UUID;
    readonly fallible = false;

    type_id(): UUID {
        return ApplyDeferred.type_id;
    }

    name(): string {
        return 'joshkaposh-ecs: apply_deferred';
    }

    component_access(): Access {
        return TODO('class ApplyDeferred.component_access()')
    }

    archetype_component_access(): Access {
        return TODO('class ApplyDeferred.archetype_component_access()')
    }

    is_send(): boolean {
        return false
    }

    is_exclusive(): boolean {
        return true
    }

    has_deferred(): boolean {
        return false
    }

    run_unsafe(_input: SystemIn<System<unit, unit>>, _world: World): unit {
        return unit;
    }

    run(_input: SystemIn<System<unit, unit>>, _world: World): unit {
        return unit
    }

    apply_deferred(_world: World): void { }

    queue_deferred(_world: World): void { }

    validate_param_unsafe(_world: World): boolean {
        return true
    }

    initialize(_world: World): void { }

    update_archetype_component_access(_world: World): void { }

    check_change_tick(_change_tick: Tick): void { }

    default_system_sets(): InternedSystemSet[] {
        return [];
    }

    get_last_run(): Tick {
        return Tick.MAX
    }

    set_last_run(_last_run: Tick): void { }

    into_system_set() {
        return new SystemTypeSet(this);
    }
}
