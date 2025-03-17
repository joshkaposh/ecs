import { Tick, World } from "..";
import { Access } from "../query";
import { And, AndMarker, Condition, Nand, NandMarker, Nor, NorMarker, Or, OrMarker, Xnor, XnorMarker, Xor, XorMarker } from "../schedule/condition";
import { SystemInput } from "./input";
import { System, SystemIn } from "./system";

export type Combine<A extends System<any, any>, B extends System<any, any>, In = SystemInput, Out = any> = {
    combine(
        input: In,
        a: (input: any) => ReturnType<A['run']>,
        b: (input: any) => ReturnType<B['run']>,
    ): Out;
}

export class CombinatorSystem<Marker extends Combine<A, B>, A extends System<any, any>, B extends System<any, any>> extends System<any, any> {
    #a: A;
    #b: B;
    #name: string;
    #component_access: Access;
    #archetype_component_access: Access;
    #type: Marker;
    #type_id: string;

    constructor(
        type: Marker,
        a: A,
        b: B,
        name: string
    ) {
        super();
        this.#type = type;
        this.#a = a;
        this.#b = b;
        this.#name = name;
        this.#component_access = new Access();
        this.#archetype_component_access = new Access();
        this.fallible = a.fallible || b.fallible;
        this.#type_id = `${a.type_id()}+${b.type_id()}`
    }

    readonly fallible: boolean;

    /**
             * Combines `this` condition and `other` into a new condition.
             * 
             * The system `this` combination is applied to will **only** run if both `a` and `b` return true
             * 
             * This is equivalent to `a() && b()`.
             * 
             * Short-curcuits: Condition `other` will not run if `this` condition returns false.
             */
    and<M, C extends Condition<M, any>>(other: C): And<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new AndMarker(), a, b, name) as any;
    }

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() && b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */
    nand<M, C extends Condition<M, any>>(other: C): Nand<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new NandMarker(), a, b, name) as any;
    }


    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` or `b` returns true
     * 
     * This is equivalent to `a() || b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */
    or<M, C extends Condition<M, any>>(other: C): Or<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new OrMarker(), a, b, name) as any;

    }

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() || b()`.
     * 
     * Short-curcuits: Condition `other` may not run if `this` condition returns false.
     */
    nor<M, C extends Condition<M, any>>(other: C): Nor<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new NorMarker(), a, b, name) as any;

    }

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` != `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `a() ^ b()`.
     * 
     * Both conditions will always run.
     */
    xor<M, C extends Condition<M, any>>(other: C): Xor<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new XorMarker(), a, b, name) as any;
    }

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` === `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `!(a() ^ b())`.
     * 
     * Both conditions will always run.
     */
    xnor<M, C extends Condition<M, any>>(other: C): Xnor<System<any, boolean>, System<any, boolean>> {
        const a = this.#a.into_system();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new XnorMarker(), a, b, name) as any;
    }


    type_id(): UUID {
        return this.#type_id as UUID;
    }

    name() {
        return this.#name
    }

    component_access() {
        return this.#component_access
    }

    archetype_component_access() {
        return this.#archetype_component_access
    }

    is_send() {
        return this.#a.is_send() && this.#b.is_send();
    }

    is_exclusive(): boolean {
        return this.#a.is_exclusive() || this.#b.is_exclusive();
    }

    has_deferred(): boolean {
        return this.#a.has_deferred() || this.#b.has_deferred();
    }

    run_unsafe(input: SystemIn<System<any, any>>, world: World) {
        return this.#type.combine(
            input,
            input => this.#a.run_unsafe(input, world),
            (input) => this.#b.run_unsafe(input, world)
        )
    }

    run(input: SystemIn<System<any, any>>, world: World) {
        return this.#type.combine(
            input,
            input => this.#a.run(input, world),
            input => this.#b.run(input, world)

        )
    }

    apply_deferred(world: World): void {
        this.#a.apply_deferred(world);
        this.#b.apply_deferred(world);
    }

    queue_deferred(world: World): void {
        this.#a.queue_deferred(world);
        this.#b.queue_deferred(world);
    }

    validate_param_unsafe(world: World): boolean {
        return this.#a.validate_param_unsafe(world);
    }

    initialize(world: World): void {
        const a = this.#a;
        const b = this.#b;
        a.initialize(world);
        b.initialize(world);
        const access = this.#component_access;
        access.extend(a.component_access())
        access.extend(b.component_access())
    }

    update_archetype_component_access(world: World): void {
        const a = this.#a;
        const b = this.#b;
        a.update_archetype_component_access(world);
        b.update_archetype_component_access(world);
        const access = this.#archetype_component_access;
        access.extend(a.archetype_component_access())
        access.extend(b.archetype_component_access())
    }

    check_change_tick(change_tick: Tick): void {
        this.#a.check_change_tick(change_tick);
        this.#b.check_change_tick(change_tick);
    }

    default_system_sets(): any[] {
        const default_sets = this.#a.default_system_sets();
        default_sets.push(...this.#b.default_system_sets());
        return default_sets;
    }

    get_last_run(): Tick {
        return this.#a.get_last_run();
    }

    set_last_run(last_run: Tick): void {
        this.#a.set_last_run(last_run);
        this.#b.set_last_run(last_run);
    }
}