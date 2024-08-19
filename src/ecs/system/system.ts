import { MustReturn } from 'joshkaposh-iterator'
import { World } from "../world";

export type Condition = (...args: any[]) => boolean;
export type BoxedCondition = any;
// @ts-expect-error
export type System<In, Out> = any;
export type BoxedSystem = any;
export type SystemId = number;

class PipeSystem {
    constructor(system_a: any, system_b: any, name: any) { }
};

export abstract class IntoSystem<In, Out> {
    #system: System<In, Out>;

    constructor(system: System<In, Out>) {
        this.#system = system;
    }

    abstract into_system(): System<In, Out>;

    pipe<Final>(system: IntoSystem<Out, Final>): PipeSystem {
        const system_a = this.into_system();
        const system_b = system.into_system();
        const name = `Pipe(${system_a.name()}, ${system_b.name()})`;
        // TODO: Cow::owned(name);
        return new PipeSystem(system_a, system_b, name)
    }

    map<T>(fn: MustReturn<(out: Out) => T>): AdapterSystem<MustReturn<(out: Out) => T>, System<In, Out>> {
        const system = this.into_system();
        const name = system.name();
        return new AdapterSystem(fn, system, name);
    }

    system_type_id() {
        return this.#system.type_id;
    }
}

export function assert_is_system(system: IntoSystem<any, any>) {
    const sys = system.into_system();

    const world = World.default();
    sys.initialize(world);
}
