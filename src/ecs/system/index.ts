import { SystemInput } from './input';
import { Access } from '../query';
import { Archetype, ArchetypeComponentId } from '../archetype';
import { System, SystemMeta } from '../system'
import { World } from '../world';
import { ComponentId, is_component, Tick } from '../component';
import { define_type } from '../../define';
import { assert, Prettify } from 'joshkaposh-iterator/src/util';
import { SystemState } from './function-system';
import { Option } from 'joshkaposh-option';
import { ParamBuilder, SystemParam } from './system-param';
import { recursively_flatten_nested_arrays, unit } from '../../util';
import { Configs, NodeConfigs } from '../schedule/config';
import { Chain } from '../schedule';
import { SystemSet } from '../schedule/set';
import { ScheduleSystem } from './schedule_system';
export * from './system-param';
export * from './input';
export * from './system';
export * from './function-system';
export * from './schedule_system';

export abstract class IntoSystemTrait<In extends SystemInput | unit, Out, Marker> {
    #system: System<In, Out>
    constructor(system: System<In, Out>) {
        this.#system = system;
    }

    static into_system<In extends SystemInput, Out, Marker>(system: IntoSystemTrait<In, Out, Marker>) {
        return system.into_system();
    }

    abstract into_system(): System<In, Out>;

    pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
        // @ts-expect-error
        return IntoPipeSystem.new(this, this.#system)
    }

    map<T>(fn: (output: Out) => T) {
        // @ts-expect-error
        IntoAdaperSystem.new(fn, this)
    }

    system_type_id() {
        return this.#system.type_id();
    }
}

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
            // console.log('Param init_state', c);
            if (is_component(c)) {
                const id = world.register_component(c)
                const set = system_meta.__component_access_set;
                assert(!set.combined_access().has_any_component_read(id))
                set.combined_access().add_component_read(id)
            }
        }

        param_get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick) {
            // console.log('SystemParam param_get_param()', state, this.#param);
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

type SysBase<P extends readonly any[], F extends (...args: P) => any> = {
    system: F;
    params: (builder: ParamBuilder<P>) => P;
}

// export type SystemDefinition<P extends readonly any[], F extends (...args: P) => any> = P extends readonly [] ? Omit<SysBase<P, F>, 'params'> : SysBase<P, F>;
export type SystemDefinition<P extends readonly any[], F extends (...args: P) => any> = SysBase<P, F> & (ReturnType<F> extends boolean ? {
    condition: true
} : {});


export type SystemImpl<In, Out> = System<In, Out> & {
    set_name(new_name: string): SystemImpl<In, Out>;
}

export function define_system<const P extends readonly any[], const F extends (...args: P) => any>(
    config: SystemDefinition<P, F>
): SystemImpl<Parameters<F>, ReturnType<F>> {

    const fallible = 'condition' in config;
    const params = config.params;
    const system = config.system;

    console.log('define_system: fallible', fallible)

    class SystemImpl<const P extends Parameters<F>> extends System<any, any> {
        #fn: F;
        #name: string;
        // #params_initial: P;
        #params!: SystemParam<any, any>;
        #state: Option<SystemState<any>>;
        #system_meta: SystemMeta;

        readonly fallible = fallible;

        constructor(fn: F) {
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
            if (this.#state) {
                assert(this.#state.matches_world(world.id()), 'System built with a different world than the one it was added to');
            } else {
                const p = define_params(...params(new ParamBuilder(world)))
                this.#params = p;
                this.#state = SystemState.new(world, p)
            }
            // console.log('System initialize', this.#state, this.#params);

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

        // into_system_set() {}

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
            // console.log('SystemImpl run');
            return this.run_unsafe(input, world);
        }

        // @ts-expect-error
        run_unsafe(input: SystemIn<System<any, any>>, world: World) {
            const change_tick = world.increment_change_tick();
            if (!this.#state) {
                throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
            }
            const param_state = this.#state.get(world);
            // console.log('SystemImpl run_unsafe', input, param_state);
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

    define_type(SystemImpl)
    return new SystemImpl(system);
}

export function set<const S extends readonly System<any, any>[]>(...system_sets: S) {
    class SystemSetImpl {
        #sets: SystemSet[];
        #configs: Configs<ScheduleSystem>
        constructor(sets: SystemSet[]) {
            this.#sets = sets;
            this.#configs = new NodeConfigs.Configs(
                // @ts-expect-error
                sets.map(s => s.into_configs()),
                [],
                Chain.No
            )
        }

        readonly fallible = false;

        into_configs() {
            return this.#configs
        }

        chain() {
            this.into_configs().chain();
            return this;
        }
    }

    const sets = recursively_flatten_nested_arrays(system_sets)
    return new SystemSetImpl(sets as SystemSet[]);
}