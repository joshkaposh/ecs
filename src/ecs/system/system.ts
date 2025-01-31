import { NodeId } from "../schedule/graph";
import { World } from "../world";
import { Access } from "../query";
import { ArchetypeComponentId, ComponentId, Condition, FunctionSystem, IntoSystemTrait, ScheduleGraph, SystemInput, SystemParamFunction, Tick, TypeId } from "..";
import { unit } from "../../util";
import { ErrorExt } from "joshkaposh-option";
import { InternedSystemSet, SystemTypeSet } from "../schedule/set";
import { v4 } from "uuid";
import { IntoSystemConfigs, NodeConfig, NodeConfigs, SystemConfigs } from "../schedule/config";
import { TODO } from "joshkaposh-iterator/src/util";
import { ProcessNodeConfig } from "../schedule/schedule";

// export type SystemFn<In extends any[] = any[], Out extends boolean | void = boolean | void> = (...args: In) => Out;
// export type ConditionFn<In extends any[] = any[]> = (...args: In) => boolean;

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

    abstract component_access(): Access<ComponentId>;
    abstract archetype_component_access(): Access<ArchetypeComponentId>;

    abstract run_unsafe(input: SystemIn<System<In, Out>>, world: World): Out;
    abstract validate_param_unsafe(world: World): boolean

    abstract apply_deferred(world: World): void;
    abstract queue_deferred(world: World): void;

    abstract update_archetype_component_access(world: World): void;

    abstract check_change_tick(change_tick: Tick): void;

    abstract get_last_run(): Tick;
    abstract set_last_run(last_run: Tick): void;

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>) {
        console.log('System.process_config()', config);
        return schedule_graph.add_system_inner(config) as NodeId;
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

    pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
        TODO('System.pipe()')
        // @ts-expect-error
        return IntoPipeSystem.new(this, this)
    }

    map<T>(fn: (output: Out) => T) {
        TODO('System.map()')
        // @ts-expect-error
        IntoAdaperSystem.new(fn, this)
    }

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
        // @ts-expect-error
        return this.into_configs().run_if(condition)
    }

    before(other: System<any, any>) {
        // @ts-expect-error
        return this.into_configs().before(other as any);
    }

    after(other: any) {
        // @ts-expect-error
        return this.into_configs().after(other);
    }

    //* IntoSystemSet impl
    into_system_set<T extends FunctionSystem<any, SystemParamFunction<any>>>() {
        type Set = SystemTypeSet<T>;
        // console.log('System.into_system_set()', this);

        return new SystemTypeSet(this as unknown as TypeId) as Set;
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

export type RunSystemOnce = {
    run_system_once<Out, Marker, T extends IntoSystemTrait<unit, Out, Marker>>(system: T): void;
    run_system_once_with<Out, Marker, T extends IntoSystemTrait<any, Out, Marker>>(system: T): void;
}

export type RunSystemError = ErrorExt<string>;
export const RunSystemError = {
    InvalidParams(name: string) {
        return new ErrorExt(name);
    }
} as const;

export type BoxedSystem<In extends any[] = any[], Out = void | boolean> = System<In, Out>;
export type SystemId = number;

export class AnonymousSet {
    #id: NodeId;
    constructor(id: NodeId) {
        this.#id = id;
    }
}

export function assert_is_system(system: System<any, any>) {
    const world = new World();
    system.initialize(world);
}

const acc = new Access();
export class ApplyDeferred extends System<unit, unit> {
    static readonly type_id: UUID = v4() as UUID;
    readonly fallible = false;

    type_id(): UUID {
        return ApplyDeferred.type_id;
    }

    name(): string {
        return 'joshkaposh-ecs: apply_deferred'
    }

    component_access(): Access<ComponentId> {
        return acc;
    }

    archetype_component_access(): Access<ArchetypeComponentId> {
        return acc;
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
