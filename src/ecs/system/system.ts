import { DoubleEndedIterator, iter } from "joshkaposh-iterator";
import { NodeId } from "../schedule";
import { World } from "../world";


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
export interface System<In extends any[] = any[], Out = void | boolean> extends IntoConfig {
    name(): string;
    params(): In;
    into_config(): IntoConfig;

    initialize(world: World): void;

    run(...args: In): Out;

    run_if(condition: Condition): IntoConfig
    before(system: System): IntoConfig;
    after(system: System): IntoConfig
};


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
