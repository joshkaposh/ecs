import { DoubleEndedIterator, iter } from "joshkaposh-iterator";
import { NodeId } from "../schedule";
import { World } from "../world";
import { Access, FilteredAccessSet } from "../query";
import { ArchetypeComponentId, ComponentId } from "..";
import { unit } from "../../util";


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
export abstract class System<In extends any[] = any[], Out = void | boolean> implements IntoConfig {
    static readonly type_id: UUID;

    abstract name(): string;

    type_id() {
        return System.type_id;
    }

    abstract component_access(): Access<ComponentId>;
    abstract archetype_component_access(): Access<ArchetypeComponentId>;

    abstract is_send(): boolean;
    abstract is_exclusive(): boolean;
    abstract has_deferred(): boolean;

    abstract run_unsafe(input: SystemIn<System<In, Out>>, world: World): Out;

    run(input: SystemIn<System<In, Out>>, world: World) {
        this.update_archetyoe_component_access(world);
        const ret = this.run_unsafe(input, world);
        this.apply_deferred(world);
        return ret;
    }

    abstract apply_deferred(world: World): void;

    abstract queue_deferred(world: World): void;

    abstract validate_param_unsafe(world: World): boolean

    validate_param(world: World): boolean {
        this.update_archetype_component_access(world);
        return this.validate_param_unsafe(world);
    }

    abstract initialize(world: World): void;

    abstract update_archetype_component_access(world: World): void;

    default_system_sets(): any[] {
        return [];
    }

    abstract params(): In;
    abstract into_config(): IntoConfig;

    // run(...args: In): Out;

    // run_if(condition: Condition): IntoConfig
    // before(system: System): IntoConfig;
    // after(system: System): IntoConfig
};

export type RunSystemOnce = {
    run_system_once<Out, Marker, T extends IntoSystem<unit, Out, Marker>>(system: T): void;
    run_system_once_with<Out, Marker, T extends IntoSystem<unit, Out, Marker>>(system: T): void;
}


export type BoxedSystem<In extends any[] = any[], Out = void | boolean> = System<In, Out>;
export type SystemId = number;

class SystemSet { }


export class AnonymousSet {
    #id: NodeId;
    constructor(id: NodeId) {
        this.#id = id;
    }
}


export class SystemMeta {
    __name: string; // Cow<str>;
    __component_access_set: FilteredAccessSet<ComponentId>;
    __archetype_component_access: Access<ArchetypeComponentId>;
    #is_send: boolean;
    #has_deferred: boolean;

    constructor(type: any) {
        this.__name = type.name;
        this.__archetype_component_access = Access.default();
        this.__component_access_set = FilteredAccessSet.default();
        this.#is_send = true;
        this.#has_deferred = false;
    }

    name(): string {
        return this.__name;
    }

    is_send(): boolean {
        return this.#is_send
    }

    set_non_send(): void {
        this.#is_send = false;
    }

    has_deferred(): boolean {
        return this.#has_deferred;
    }

    set_has_deferred(): void {
        this.#has_deferred = true;
    }


    clone() {
    }
}

export function assert_is_system(system: System<any, any>) {
    const world = World.default();
    system.initialize(world);
}
