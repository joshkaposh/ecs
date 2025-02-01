import { SystemInput } from './input';
import { Access } from '../query';
import { Archetype, ArchetypeComponentId } from '../../../../src/ecs/archetype';
import { System, SystemMeta } from '.'
import { World } from '../world';
import { ComponentId, is_component, Tick } from '../component';
import { define_type } from '../define';
import { assert } from 'joshkaposh-iterator/src/util';
import { SystemState } from './function-system';
import { Option } from 'joshkaposh-option';
import { ParamBuilder, SystemParam } from './system-param';
import { unit } from '../util';
import { And, AndMarker, Condition, Nand, NandMarker, Nor, NorMarker, Or, OrMarker, Xnor, XnorMarker, Xor, XorMarker } from '../schedule/condition';
import { CombinatorSystem } from './combinator';

export * from './system-param';
export * from './input';
export * from './system';
export * from './function-system';
export * from './schedule_system';

// export abstract class IntoSystemTrait<In extends SystemInput | unit, Out, Marker> {
//     #system: System<In, Out>
//     constructor(system: System<In, Out>) {
//         this.#system = system;
//     }

//     static into_system<In extends SystemInput, Out, Marker>(system: IntoSystemTrait<In, Out, Marker>) {
//         return system.into_system();
//     }

//     abstract into_system(): System<In, Out>;

//     pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
//         // @ts-expect-error
//         return IntoPipeSystem.new(this, this.#system)
//     }

//     map<T>(fn: (output: Out) => T) {
//         // @ts-expect-error
//         IntoAdaperSystem.new(fn, this)
//     }

//     system_type_id() {
//         return this.#system.type_id();
//     }
// }

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

declare function define_system2<P>(
    params: (builder: ParamBuilder) => P,
    system: (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => any
): void;


export function define_system<P>(
    params: (builder: ParamBuilder) => P,
    system: (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => any

): SystemImpl<Parameters<typeof system>, ReturnType<typeof system>> {

    class SystemImpl extends System<any, any> {
        #fn: typeof system;
        #name: string;
        // #params_initial: P;
        #params!: SystemParam<any, any>;
        #state: Option<SystemState<any>>;
        #system_meta: SystemMeta;

        readonly fallible = false;

        [$is_system] = true;

        constructor(fn: typeof system) {
            super()
            this.#fn = fn;
            this.#system_meta = SystemMeta.new(fn)
            this.#name = fn.name;
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
            // console.log('SYSTEM IMPL INITIALIZE');

            if (this.#state) {
                assert(this.#state.matches_world(world.id()), 'System built with a different world than the one it was added to');
            } else {
                let builder = new ParamBuilder(world);
                // @ts-expect-error
                builder ??= params(builder);
                const p = define_params(...builder.params())
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

        // @ts-expect-error
        run(input: SystemIn<System<any, any>>, world: World) {
            return this.run_unsafe(input, world);
        }

        // @ts-expect-error
        run_unsafe(input: SystemIn<System<any, any>>, world: World) {
            const change_tick = world.increment_change_tick();
            if (!this.#state) {
                throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
            }
            const param_state = this.#state.get(world);
            return this.#fn(...param_state)
        }

        validate_param(world: World): boolean {
            return this.validate_param_unsafe(world)
        }

        // @ts-expect-error
        validate_param_unsafe(world: World): boolean {
            return true;
        }

        type_id(): UUID {
            return SystemImpl.type_id
        }
    }

    Object.defineProperty(SystemImpl, $is_system, {
        get() {
            return true;
        },
    })

    define_type(SystemImpl)
    return new SystemImpl(system as any);
}

export function define_condition<const P extends readonly any[], const F extends (...args: P) => boolean>(
    condition: F,
    params: (builder: ParamBuilder<P>) => P
) {

    class ConditionImpl<const P extends Parameters<F>> extends System<any, any> implements Condition<any, any> {
        #fn: F;
        #name: string;
        // #params_initial: P;
        #params!: SystemParam<any, any>;
        #state: Option<SystemState<any>>;
        #system_meta: SystemMeta;

        readonly fallible = false;

        constructor(fn: F) {
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
            const a = IntoSystemTrait.into_system(this as any);
            const b = IntoSystemTrait.into_system(other as any);
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
                const p = define_params(...params(new ParamBuilder(world)))
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

        // @ts-expect-error
        run(input: SystemIn<System<any, any>>, world: World) {
            return this.run_unsafe(input, world);
        }

        // @ts-expect-error
        run_unsafe(input: SystemIn<System<any, any>>, world: World) {
            const change_tick = world.increment_change_tick();
            if (!this.#state) {
                throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
            }
            const param_state = this.#state.get(world);
            return this.#fn(...param_state)
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
