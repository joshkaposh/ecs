import { DoubleEndedIterator } from "joshkaposh-iterator";
import { NodeId } from "../schedule";
import { World } from "../world";
import { Access, FilteredAccessSet } from "../query";
import { ArchetypeComponentId, ComponentId, Tick } from "..";
import { unit } from "../../util";
import { ErrorExt } from "joshkaposh-option";

export type SystemFn<In extends any[] = any[], Out extends boolean | void = boolean | void> = (...args: In) => Out;
export type ConditionFn<In extends any[] = any[]> = (...args: In) => boolean;
export type Condition<In extends any[] = any[], Out extends boolean = boolean> = System<In, Out>;
export type BoxedCondition<In extends any[] = any[]> = Condition<In>;

export interface IntoConfig {
    before(config: IntoConfig): IntoConfig;
    after(config: IntoConfig): IntoConfig;

    run_if(condition: Condition): IntoConfig

    dependencies(): DoubleEndedIterator<readonly [System, System]>;
    conditions(): DoubleEndedIterator<readonly [System, System]>
}
export abstract class System<In, Out> {
    static readonly type_id: UUID;

    abstract is_send(): boolean;
    abstract is_exclusive(): boolean;
    abstract has_deferred(): boolean;

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
        return [];
    }

    abstract type_id(): UUID;

    //* IntoSystem impl
    into_system() {
        return this;
    }

    pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
        return IntoPipeSystem.new(this, this)
    }

    map<T>(fn: (output: Out) => T) {
        IntoAdaperSystem.new(fn, this)
    }

    system_type_id() {
        return this.type_id();
    }
};
export type RunSystemOnce = {
    run_system_once<Out, Marker, T extends IntoSystem<unit, Out, Marker>>(system: T): void;
    run_system_once_with<Out, Marker, T extends IntoSystem<In, Out, Marker>>(system: T): void;
}

export type RunSystemError = ErrorExt<string>;
export const RunSystemError = {
    InvalidParams(name: string) {
        return new ErrorExt(name);
    }
} as const;

export type BoxedSystem<In extends any[] = any[], Out = void | boolean> = System<In, Out>;
export type SystemId = number;

class SystemSet { }


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
