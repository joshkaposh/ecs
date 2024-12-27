import { NodeId } from "../schedule/graph";
import { World } from "../world";
import { Access } from "../query";
import { ArchetypeComponentId, ComponentId, IntoSystemTrait, ScheduleSystem, SystemInput, Tick } from "..";
import { unit } from "../../util";
import { ErrorExt } from "joshkaposh-option";
import { SystemTypeSet } from "../schedule/set";
import { v4 } from "uuid";
import { IntoSystemConfigs, NodeConfigs, SystemConfigs } from "../schedule/config";
import { TODO } from "joshkaposh-iterator/src/util";

// export type SystemFn<In extends any[] = any[], Out extends boolean | void = boolean | void> = (...args: In) => Out;
// export type ConditionFn<In extends any[] = any[]> = (...args: In) => boolean;
export type Condition<M> = any;
export type BoxedCondition<In extends any[] = any[]> = Condition<In>;

export type SystemIn<T> = any;

export abstract class System<In, Out> extends IntoSystemConfigs<unit> {


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

    run(input: SystemIn<System<In, Out>>, world: World) {
        console.log('RUNNING SYSTEM');
        this.update_archetype_component_access(world);
        const ret = this.run_unsafe(input, world);
        this.apply_deferred(world);
        return ret;
    }

    validate_param(world: World): boolean {
        this.update_archetype_component_access(world);
        return this.validate_param_unsafe(world);
    }

    default_system_sets(): any[] {
        return [
            new ScheduleSystem(this, this.fallible)
        ];

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
            NodeConfigs.new_system(ScheduleSystem.Fallible(this)) :
            NodeConfigs.new_system(ScheduleSystem.Infallible(this as System<In, void>))
    }

};
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
    const world = World.default();
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

    default_system_sets(): any[] {
        return [new SystemTypeSet(this)];
    }

    get_last_run(): Tick {
        return Tick.MAX
    }

    set_last_run(_last_run: Tick): void { }

    into_system_set() {
        return new SystemTypeSet(this);
    }

}
