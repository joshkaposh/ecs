import { ScheduleGraph, Tick, World } from "..";
import { Access } from "../query";
import { And, AndMarker, Condition, Nand, NandMarker, Nor, NorMarker, Or, OrMarker, Xnor, XnorMarker, Xor, XorMarker } from "../schedule/condition";
import { ScheduleConfig, ScheduleConfigs } from "../schedule/config";
import { Ambiguity, NodeId } from "../schedule/graph";
import { IntoSystemSet, SystemSet, SystemTypeSet } from "../schedule/set";
import { SystemInput } from "./input";
import { System, SystemIn } from "./system";

export type Combine<A extends System<any, any>, B extends System<any, any>, In = SystemInput, Out = any> = {
    combine(
        input: In,
        a: (input: any) => ReturnType<A['run']>,
        b: (input: any) => ReturnType<B['run']>,
    ): Out;
}


export class CombinatorSystem<
    Marker extends Combine<A, B>,
    A extends System<any, any>,
    B extends System<any, any>
> implements System<any, any> {
    #a: A;
    #b: B;
    #component_access: Access;
    #archetype_component_access: Access;
    #type: Marker;

    constructor(
        type: Marker,
        a: A,
        b: B,
        name: string
    ) {
        this.#type = type;
        this.#a = a;
        this.#b = b;
        this.#component_access = new Access();
        this.#archetype_component_access = new Access();
        this.name = name;
        this.fallible = a.fallible || b.fallible;
        const type_id = `${a.type_id}+${b.type_id}` as UUID;
        this.type_id = type_id;
        this.system_type_id = type_id;

        this.is_send = a.is_send && b.is_send;
        this.is_exclusive = a.is_exclusive || b.is_exclusive;
        this.has_deferred = a.has_deferred || b.has_deferred;
    }

    readonly fallible: boolean;
    readonly name: string;
    readonly type_id: UUID;
    readonly system_type_id: UUID;

    readonly is_send: boolean;
    readonly is_exclusive: boolean;
    readonly has_deferred: boolean;

    setName(new_name: string): System<any, any> {
        // @ts-expect-error
        this.name = new_name;
        return this as any;
    }

    processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId {
        //@ts-expect-error
        return schedule_graph.add_system_inner(config as any);
    }


    intoConfig(): ScheduleConfigs {
        return new ScheduleConfig(
            this as any,
            {
                hierarchy: this.defaultSystemSets(),
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    }

    inSet(set: SystemSet): ScheduleConfigs {
        return this.intoConfig().inSet(set);
    }

    before<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().before(set);
    }

    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().beforeIgnoreDeferred(set);

    }

    after<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().after(set);
    }

    afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().afterIgnoreDeferred(set);
    }

    distributiveRunIf<M>(condition: Condition<M, boolean>): ScheduleConfigs {
        return this.intoConfig().distributiveRunIf(condition);
    }

    runIf<M>(condition: Condition<M, boolean>): ScheduleConfigs {
        return this.intoConfig().runIf(condition);
    }

    chain(): ScheduleConfigs {
        return this.intoConfig().chain();
    }

    chainIgnoreDeferred(): ScheduleConfigs {
        return this.intoConfig().chainIgnoreDeferred();
    }

    ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().ambiguousWith(set);
    }

    ambiguousWithAll(): ScheduleConfigs {
        return this.intoConfig().ambiguousWithAll();
    }

    intoSystem(): System<any, any> {
        return this as any;
    }

    intoSystemSet(): SystemTypeSet {
        return new SystemTypeSet(this)
    }

    /**
             * Combines `this` condition and `other` into a new condition.
             * 
             * The system `this` combination is applied to will **only** run if both `a` and `b` return true
             * 
             * This is equivalent to `a() && b()`.
             * 
             * Short-curcuits: Condition `other` will not run if `this` condition returns false.
             */
    and<C extends Condition<any>>(other: C): And<Condition<any, boolean>, C> {
        const a = this.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;

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
    nand<C extends Condition<any>>(other: C): Nand<Condition<any, boolean>, C> {
        const a = this.#a.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
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
    or<C extends Condition<any>>(other: C): Or<Condition<any, boolean>, C> {
        const a = this.#a.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
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
    nor<C extends Condition<any>>(other: C): Nor<Condition<any, boolean>, C> {
        const a = this.#a.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
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
    xor<C extends Condition<any>>(other: C): Xor<Condition<any, boolean>, C> {
        const a = this.#a.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
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
    xnor<C extends Condition<any>>(other: C): Xnor<Condition<any, boolean>, C> {
        const a = this.#a.intoSystem();
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new XnorMarker(), a, b, name) as any;
    }

    componentAccess() {
        return this.#component_access
    }

    archetypeComponentAccess() {
        return this.#archetype_component_access
    }

    runUnsafe(input: SystemIn<System<any, any>>, world: World) {
        return this.#type.combine(
            input,
            input => this.#a.runUnsafe(input, world),
            input => this.#b.runUnsafe(input, world)
        )
    }

    run(input: SystemIn<System<any, any>>, world: World) {
        return this.#type.combine(
            input,
            input => this.#a.run(input, world),
            input => this.#b.run(input, world)

        )
    }

    runWithoutApplyingDeferred(input: any, world: World) {
        this.updateArchetypeComponentAccess(world);
        return this.runUnsafe(input, world);
    }

    applyDeferred(world: World): void {
        this.#a.applyDeferred(world);
        this.#b.applyDeferred(world);
    }

    queueDeferred(world: World): void {
        this.#a.queueDeferred(world);
        this.#b.queueDeferred(world);
    }

    validateParamUnsafe(world: World) {
        return this.#a.validateParamUnsafe(world);
    }

    validateParam(world: World) {
        return this.#a.validateParam(world);
    }

    initialize(world: World): void {
        const a = this.#a;
        const b = this.#b;
        a.initialize(world);
        b.initialize(world);
        const access = this.#component_access;
        access.extend(a.componentAccess())
        access.extend(b.componentAccess())
    }

    updateArchetypeComponentAccess(world: World): void {
        const a = this.#a;
        const b = this.#b;
        a.updateArchetypeComponentAccess(world);
        b.updateArchetypeComponentAccess(world);
        const access = this.#archetype_component_access;
        access.extend(a.archetypeComponentAccess())
        access.extend(b.archetypeComponentAccess())
    }

    checkChangeTick(change_tick: Tick): void {
        this.#a.checkChangeTick(change_tick);
        this.#b.checkChangeTick(change_tick);
    }

    defaultSystemSets() {
        return this.#a.defaultSystemSets().concat(this.#b.defaultSystemSets());
    }

    getLastRun(): Tick {
        return this.#a.getLastRun();
    }

    setLastRun(last_run: Tick): void {
        this.#a.setLastRun(last_run);
        this.#b.setLastRun(last_run);
    }

    [Symbol.toPrimitive]() {
        return `CombinatorSystem {
            name: ${this.name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }

    [Symbol.toStringTag]() {
        return `CombinatorSystem {
            name: ${this.name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }
}