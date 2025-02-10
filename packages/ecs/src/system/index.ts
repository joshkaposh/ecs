import { Access } from '../query';
import { Archetype, ArchetypeComponentId } from '../archetype';
import { System, SystemMeta } from '.'
import { World } from '../world';
import { ComponentId, is_component, Tick } from '../component';
import { define_type } from 'define';
import { assert, TODO } from 'joshkaposh-iterator/src/util';
import { SystemState } from './function-system';
import { Option } from 'joshkaposh-option';
import { ParamBuilder, SystemParam } from './system-param';
import { unit } from '../util';
import { And, AndMarker, Condition, Nand, NandMarker, Nor, NorMarker, Or, OrMarker, Xnor, XnorMarker, Xor, XorMarker } from '../schedule/condition';
import { CombinatorSystem } from './combinator';
import { SystemIn } from './system';
import { v4 } from 'uuid';
import { InternedSystemSet, SystemSet, SystemTypeSet } from '../schedule/set';
import { ScheduleGraph } from '../schedule';
import { NodeConfigs, SystemConfig, SystemConfigs, SystemSetConfigs } from '../schedule/config';
import { NodeId } from '../schedule/graph';

export * from './system-param';
export * from './input';
export * from './system';
export * from './function-system';
export * from './schedule_system';

export function define_params<P extends readonly any[]>(...params: P) {
    class ParamImpl implements SystemParam<any, any> {
        State: any;
        Item: any;
        #param: P;

        constructor(params: P) {
            this.#param = params;
        }

        param_init_state(world: World, system_meta: SystemMeta) {
            const c = this.#param;
            if (is_component(c)) {
                const id = world.register_component(c)
                const set = system_meta.__component_access_set;
                assert(!set.combined_access().has_any_component_read(id))
                set.combined_access().add_component_read(id)
            }
        }

        param_get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick) {
            return this.#param;
        }

        param_new_archetype(_state: any, _archetype: Archetype, _system_meta: SystemMeta): void {

        }

        param_apply(_state: any, _system_meta: SystemMeta, _world: World): void {

        }

        param_queue(_state: any, _system_meta: SystemMeta, _world: World): void {

        }

        param_validate_param(_state: any, _system_meta: SystemMeta, _world: World): boolean {
            return true
        }
    }

    return new ParamImpl(params);
}

export type SystemImpl<In, Out> = System<In, Out> & {
    set_name(new_name: string): SystemImpl<In, Out>;
}

export const $is_system = Symbol('SYSTEM');

// export function define_system_old<P>(
//     params: (builder: ParamBuilder) => P,
//     system: (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => any

// ): SystemImpl<Parameters<typeof system>, ReturnType<typeof system>> {

//     class SystemImpl extends System<any, any> {
//         #fn: typeof system;
//         #name: string;
//         // #params_initial: P;
//         #params!: SystemParam<any, any>;
//         #state: Option<SystemState<any>>;
//         #system_meta: SystemMeta;

//         readonly fallible = false;

//         [$is_system] = true;

//         constructor(fn: typeof system) {
//             super()
//             this.#fn = fn;
//             this.#system_meta = SystemMeta.new(fn)
//             this.#name = fn.name;
//         }

//         has_deferred(): boolean {
//             return false
//         }

//         is_exclusive(): boolean {
//             return false
//         }

//         is_send(): boolean {
//             return true
//         }

//         name(): string {
//             return this.#name
//         }

//         /**
//          * Useful if system passed was an anonymous function and you want a better name for it.
//          */
//         set_name(new_name: string) {
//             this.#name = new_name;
//             return this
//         }

//         initialize(world: World): void {
//             if (this.#state) {
//                 assert(this.#state.matches_world(world.id()), 'System built with a different world than the one it was added to');
//             } else {
//                 const builder = new ParamBuilder(world);
//                 // @ts-expect-error
//                 const p = params(builder).params() as any;
//                 // const p = define_params(_params.params())
//                 this.#params = p;
//                 this.#state = SystemState.new(world, p)
//             }

//             this.#system_meta.last_run = world.change_tick().relative_to(Tick.MAX);
//         }

//         get_last_run(): Tick {
//             return this.#system_meta.last_run;
//         }

//         set_last_run(last_run: Tick): void {
//             this.#system_meta.last_run = last_run;
//         }

//         into_system(): this {
//             return this
//         }

//         check_change_tick(change_tick: Tick): void {
//         }

//         component_access(): Access<ComponentId> {
//             return this.#system_meta.__component_access_set.combined_access();
//         }

//         archetype_component_access(): Access<ArchetypeComponentId> {
//             return this.#system_meta.__archetype_component_access;
//         }

//         apply_deferred(world: World): void {

//         }

//         queue_deferred(world: World): void {

//         }

//         update_archetype_component_access(world: World): void {

//         }

//         run(input: SystemIn<typeof system>, world: World) {
//             return this.run_unsafe(input, world);
//         }

//         run_unsafe(input: SystemIn<typeof system>, world: World) {
//             const change_tick = world.increment_change_tick();
//             if (!this.#state) {
//                 throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//             }
//             const param_state = this.#state.get(world);
//             const system_params = input === unit ? param_state : [input, ...param_state];
//             return this.#fn(...system_params)
//         }

//         validate_param(world: World): boolean {
//             return this.validate_param_unsafe(world)
//         }

//         // @ts-expect-error
//         validate_param_unsafe(world: World): boolean {
//             return true;
//         }

//         type_id(): UUID {
//             return SystemImpl.type_id
//         }
//     }

//     define_type(SystemImpl)
//     return new SystemImpl(system as any);
// }

export type SystemFn<P, Fallible extends boolean> = (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => Fallible extends false ? any : boolean;

export interface SystemDefinitionImpl<P, Fn extends SystemFn<P, false>> {
    readonly fallible: boolean;
    name(): string;
    set_name(new_name: string): SystemDefinitionImpl<P, Fn>;
    has_deferred(): boolean;
    is_exclusive(): boolean;
    is_send(): boolean;
    initialize(world: World): void;
    get_last_run(): Tick;
    set_last_run(tick: Tick): void;
    check_change_tick(tick: Tick): void;
    component_access(): Access<ComponentId>;
    archetype_component_access(): Access<ArchetypeComponentId>;
    apply_deferred(world: World): void;
    queue_deferred(world: World): void;
    update_archetype_component_access(world: World): void;
    run(input: SystemIn<Fn>, world: World): ReturnType<Fn>;
    run_unsafe(input: SystemIn<Fn>, world: World): ReturnType<Fn>;
    validate_param(world: World): boolean;
    validate_param_unsafe(world: World): boolean;

    type_id(): UUID;
    system_type_id(): UUID;

    into_system(): SystemDefinitionImpl<P, Fn>;
    into_configs(): SystemConfigs;
    into_system_set(): SystemTypeSet;

    default_system_sets(): InternedSystemSet[];
    process_config(schedule_graph: ScheduleGraph, config: SystemConfig): NodeId;

    // system ordering

    chain(): SystemConfigs;
    run_if(condition: Condition<any>): SystemConfigs | SystemSetConfigs;
    before<P2>(other: SystemDefinitionImpl<P2, SystemFn<P2, false>>): SystemConfigs;
    after<P2>(other: SystemDefinitionImpl<P2, SystemFn<P2, false>>): SystemConfigs;
    in_set(other: InternedSystemSet): SystemConfigs;

    [Symbol.toPrimitive](): string;
    [Symbol.toStringTag](): string;
}
function define_system_base<P, Fallible extends boolean, Fn extends SystemFn<P, Fallible>>(
    params: (builder: ParamBuilder) => P,
    system: Fn & Omit<Partial<SystemDefinitionImpl<P, Fn>>, 'name'>
): SystemDefinitionImpl<P, Fn> {

    const system_meta = SystemMeta.new(system as unknown as SystemDefinitionImpl<P, Fn>);
    const TYPE_ID = v4() as UUID;
    let state: Option<SystemState<any>>;
    let system_name = system.name;
    let system_params;

    function type_id() {
        return TYPE_ID
    }

    system.type_id = type_id
    system.system_type_id = type_id

    function name() {
        return system_name;
    }
    Object.defineProperty(system, 'name', {
        get() {
            return name
        }
    })

    system.set_name = function set_name(new_name: string) {
        system_name = new_name;
        return system as unknown as SystemDefinitionImpl<P, Fn>;
    }

    system.has_deferred = function has_deferred() {
        return false;
    }

    system.is_exclusive = function is_exclusive() {
        return false;
    }

    system.is_send = function is_send() {
        return true
    }

    system.initialize = function initialize(world: World) {
        if (state) {
            assert(state.matches_world(world.id()), 'System built with a different world than the one it was added to');
        } else {
            const builder = new ParamBuilder(world);
            // @ts-expect-error
            const p = params(builder).params() as any;
            system_params = p;
            state = SystemState.new(world, p)
        }

        system_meta.last_run = world.change_tick().relative_to(Tick.MAX);
    }

    system.get_last_run = function get_last_run() {
        return system_meta.last_run;
    }
    system.set_last_run = function get_last_run(tick: Tick) {
        system_meta.last_run.set(tick.get());
    }

    system.check_change_tick = function check_change_tick(tick: Tick) { }

    system.component_access = function component_access() {
        return system_meta.__component_access_set.combined_access();
    }


    system.archetype_component_access = function archetype_component_access() {
        return system_meta.__archetype_component_access;
    }

    system.apply_deferred = function apply_deferred(world: World) { }
    system.queue_deferred = function queue_deferred(world: World) { }

    system.update_archetype_component_access = function update_archetype_component_access(world: World) { }

    system.run = function run(input: SystemIn<Fn>, world: World): ReturnType<Fn> {
        return this.run_unsafe!(input, world)
    }

    system.run_unsafe = function run_unsafe(input: SystemIn<Fn>, world: World): ReturnType<Fn> {
        const change_tick = world.increment_change_tick();
        if (!state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }
        const param_state = state.get(world);
        const system_params = input === unit ? param_state : [input, ...param_state];
        return system.call(this, ...system_params) as ReturnType<Fn>;

    }

    system.validate_param = function validate_param(world: World) {
        return this.validate_param_unsafe!(world);
    }


    system.validate_param_unsafe = function validate_param_unsafe(world: World) {
        return true;
    }

    Object.defineProperty(system, $is_system, {
        get() {
            return true;
        }
    })

    system.default_system_sets = function default_system_sets(): InternedSystemSet[] {
        return [];
    }
    system.process_config = function process_config(schedule_graph: ScheduleGraph, config: SystemConfig): NodeId {
        const id = schedule_graph.add_system_inner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    system.into_system = function into_system() {
        return system as unknown as SystemDefinitionImpl<P, Fn>;
    }

    system.into_configs = function into_configs(): SystemConfigs {
        return NodeConfigs.new_system(this as any);
    }


    system.into_system_set = function into_system_set() {
        return new SystemTypeSet(this as any);
    }

    system.chain = function chain() {
        return this.into_configs!();
    }

    system.run_if = function run_if(condition: Condition<any>) {
        return this.into_configs!().run_if(condition)
    }

    system.before = function before<P2>(other: SystemDefinitionImpl<P2, SystemFn<P2, boolean>>) {
        return this.into_configs!().before(other as any);
    }

    system.after = function after<P2>(other: SystemDefinitionImpl<P2, SystemFn<P2, boolean>>) {
        return this.into_configs!().after(other);
    }

    system.in_set = function in_set(set: InternedSystemSet) {
        return this.into_configs!().in_set(set) as SystemConfigs;
    }

    system[Symbol.toPrimitive] = function () {
        return `System {
            name: ${system_name},
            is_exclusive: ${this.is_exclusive!()},
            is_send: ${this.is_send!()}
        }`
    }

    system[Symbol.toStringTag] = function () {
        return `System {
            name: ${system_name},
            is_exclusive: ${this.is_exclusive!()},
            is_send: ${this.is_send!()}
        }`
    }

    return system as unknown as SystemDefinitionImpl<P, Fn>;

}

export function define_system<P, Fn extends SystemFn<P, false>>(
    params: (builder: ParamBuilder) => P,
    system: Fn & Omit<Partial<SystemDefinitionImpl<P, Fn>>, 'name'>
): SystemDefinitionImpl<P, Fn> {

    define_system_base(params, system);

    Object.defineProperty(system, 'fallible', {
        get() {
            return false;
        },
        enumerable: false,
        configurable: false
    })

    return system as unknown as SystemDefinitionImpl<P, Fn>;
}


export function define_condition<P>(
    params: (builder: ParamBuilder) => P,
    condition: (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => boolean
) {

    class ConditionImpl<const P extends Parameters<typeof condition>> extends System<any, any> implements Condition<any, any> {
        #fn: typeof condition;
        #name: string;
        // #params_initial: P;
        #params!: SystemParam<any, any>;
        #state: Option<SystemState<any>>;
        #system_meta: SystemMeta;

        readonly fallible = true;

        constructor(fn: typeof condition) {
            super()
            this.#fn = fn;
            this.#system_meta = SystemMeta.new(fn)
            this.#name = fn.name;
        }
        //* Condition impl

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
            const a = this.into_system();
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
            const a = this.into_system();
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
            const a = this.into_system();
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
            const a = this.into_system();
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
            const a = this.into_system();
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
            const a = this.into_system();
            const b = other.into_system();
            const name = `${a.name()} && ${b.name()}`;
            return new CombinatorSystem(new XnorMarker(), a, b, name) as any;
        }

        has_deferred(): boolean {
            return false
        }

        is_exclusive(): boolean {
            return false
        }

        is_send(): boolean {
            return true
        }

        name(): string {
            return this.#name
        }

        /**
         * Useful if system passed was an anonymous function and you want a better name for it.
         */
        set_name(new_name: string) {
            this.#name = new_name;
            return this
        }

        initialize(world: World): void {
            if (this.#state) {
                assert(this.#state.matches_world(world.id()), 'System built with a different world than the one it was added to');
            } else {
                const builder = new ParamBuilder(world);
                // @ts-expect-error
                const p = params(builder).params() as any;
                this.#params = p;
                this.#state = SystemState.new(world, p)
            }

            this.#system_meta.last_run = world.change_tick().relative_to(Tick.MAX);
        }

        get_last_run(): Tick {
            return this.#system_meta.last_run;
        }

        set_last_run(last_run: Tick): void {
            this.#system_meta.last_run = last_run;
        }

        into_system(): this {
            return this
        }

        check_change_tick(change_tick: Tick): void {
        }

        component_access(): Access<ComponentId> {
            return this.#system_meta.__component_access_set.combined_access();
        }

        archetype_component_access(): Access<ArchetypeComponentId> {
            return this.#system_meta.__archetype_component_access;
        }

        apply_deferred(world: World): void {

        }

        queue_deferred(world: World): void {

        }

        update_archetype_component_access(world: World): void {

        }

        run(input: SystemIn<System<any, any>>, world: World) {
            return this.run_unsafe(input, world);
        }

        run_unsafe(input: SystemIn<System<any, any>>, world: World) {
            const change_tick = world.increment_change_tick();
            if (!this.#state) {
                throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
            }
            const param_state = this.#state.get(world);

            const system_params = input === unit ? param_state : [input, ...param_state];
            return this.#fn(...system_params)
        }

        validate_param(world: World): boolean {
            return this.validate_param_unsafe(world)
        }

        // @ts-expect-error
        validate_param_unsafe(world: World): boolean {
            return true;
        }

        type_id(): UUID {
            return ConditionImpl.type_id
        }

    }

    define_type(ConditionImpl);
    Object.defineProperty(ConditionImpl, $is_system, {
        get() {
            return true;
        },
    });
    return new ConditionImpl(condition);

}

export interface ConditionDefinitionImpl<P, Fn extends SystemFn<P, true>> extends SystemDefinitionImpl<P, Fn> {
    and<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): And<System<M, boolean>, System<M, boolean>>;
    nand<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nand<System<M, boolean>, System<M, boolean>>;

    or<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Or<System<M, boolean>, System<M, boolean>>;
    nor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nor<System<M, boolean>, System<M, boolean>>;

    xor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xor<System<M, boolean>, System<M, boolean>>;
    xnor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xnor<System<M, boolean>, System<M, boolean>>;
}

// TODO: use this instead of define_condition
function define_condition2<P, Fn extends SystemFn<P, true>>(
    params: (builder: ParamBuilder) => P,
    condition: Fn & Omit<Partial<ConditionDefinitionImpl<P, Fn>>, 'name'>
): ConditionDefinitionImpl<P, Fn> {

    define_system_base(params, condition);

    Object.defineProperty(condition, 'fallible', {
        get() {
            return true;
        },
        enumerable: false,
        configurable: false
    })


    // and<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): And<System<M, boolean>, System<M, boolean>>;
    // nand<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nand<System<M, boolean>, System<M, boolean>>;

    // or<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Or<System<M, boolean>, System<M, boolean>>;
    // nor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nor<System<M, boolean>, System<M, boolean>>;

    // xor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xor<System<M, boolean>, System<M, boolean>>;
    // xnor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xnor<System<M, boolean>, System<M, boolean>>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if both `a` and `b` return true
     * 
     * This is equivalent to `a() && b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns false.
     */
    condition.and = function and<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): And<System<M, boolean>, System<M, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new AndMarker(), a as any, b as any, name) as any;
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
    condition.nand = function nand<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nand<System<any, boolean>, System<any, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new NandMarker(), a as any, b as any, name) as any;
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
    condition.or = function or<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Or<System<any, boolean>, System<any, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new OrMarker(), a as any, b as any, name) as any;

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
    condition.nor = function nor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Nor<System<any, boolean>, System<any, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new NorMarker(), a as any, b as any, name) as any;

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
    condition.xor = function xor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xor<System<any, boolean>, System<any, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new XorMarker(), a as any, b as any, name) as any;
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
    condition.xnor = function xnor<M, C extends ConditionDefinitionImpl<M, SystemFn<M, true>>>(other: C): Xnor<System<any, boolean>, System<any, boolean>> {
        const a = this.into_system!();
        const b = other.into_system();
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(new XnorMarker(), a as any, b as any, name) as any;
    }

    return condition as unknown as ConditionDefinitionImpl<P, Fn>;
}