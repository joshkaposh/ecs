import { SystemInput } from './input';
import { Access } from '../query';
import { Archetype, ArchetypeComponentId } from '../archetype';
import { System, SystemMeta } from '../system'
import { World } from '../world';
import { ComponentId, is_component, Tick } from '../component';
import { define_type } from '../define';
import { assert } from 'joshkaposh-iterator/src/util';
import { SystemState } from './function-system';
import { Option } from 'joshkaposh-option';
import { SystemParam } from './system-param';
export * from './system-param';
export * from './input';
export * from './system';
export * from './function-system';
export * from './schedule_system';

export abstract class IntoSystemTrait<In extends SystemInput, Out, Marker> {
    #system: System<In, Out>
    constructor(system: System<In, Out>) {
        this.#system = system;
    }

    static into_system<In extends SystemInput, Out, Marker>(system: IntoSystemTrait<In, Out, Marker>) {
        return system.into_system();
    }

    abstract into_system(): System<In, Out>;

    pipe<Bin extends SystemInput, Bout, Bmarker, B extends IntoSystemTrait<Bin, Bout, Bmarker>>(system: B) {
        return IntoPipeSystem.new(this, this.#system)
    }

    map<T>(fn: (output: Out) => T) {
        IntoAdaperSystem.new(fn, this)
    }

    system_type_id() {
        return this.#system.type_id();
    }
}

export function define_params<P extends readonly any[]>(...params: P) {
    class ParamImpl extends SystemParam<any, any> {
        State: any;
        Item: any;
        #param: P;

        constructor(params: P) {
            super();
            this.#param = params;
        }

        init_state(world: World, system_meta: SystemMeta) {
            const c = this.#param;
            // console.log('Param init_state', c);
            if (is_component(c)) {
                const id = world.register_component(c)
                assert(!system_meta.__component_access_set.combined_access().has_any_component_read(id))
                system_meta.__component_access_set.combined_access().add_component_read(id)
            }
        }

        get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick) {
            return this.#param;
        }

        new_archetype(_state: any, _archetype: Archetype, _system_meta: SystemMeta): void {

        }

        apply(_state: any, _system_meta: SystemMeta, _world: World): void {

        }

        validate_param(_state: any, _system_meta: SystemMeta, _world: World): boolean {
            return true
        }
    }

    return new ParamImpl(params);
}

export function define_system<F extends (...args: any[]) => void, P extends Parameters<F>>(fn: F, ...params: P): System<any, any> {
    class SystemImpl extends System<any, any> {
        #fn: F;
        #name: string;
        #params_initial: P;
        #params: SystemParam<any, any>;
        #state: Option<SystemState<any>>;
        #system_meta: SystemMeta;

        constructor(fn: F, ...params: P) {
            super()
            this.#fn = fn;
            this.#params_initial = params;
            this.#params = define_params(...params);
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
            return this.#fn.name
        }

        set_name(new_name: string) {
            this.#name = new_name;
        }

        initialize(world: World): void {
            if (this.#state) {
                assert(this.#state.matches_world(world.id()), 'System built with a different world than the one it was added to');
            } else {
                this.#state = SystemState.new(world, this.#params)
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


            // const param_state = this.#state.get(world);
            // console.log('run_unsafe param_state', param_state);
            const params = this.#state.get(world);
            const out = this.#fn(...params);
            // const params = this.#func.Param.get_param(param_state, this.#system_meta, world, change_tick);
            // const out = this.#func.run(input, params);
            // this.#system_meta.last_run = change_tick;
            // return out;



            return this.#fn(input)
        }

        validate_param(world: World): boolean {
            return this.validate_param_unsafe(world)
        }

        validate_param_unsafe(world: World): boolean {
            return true;
        }

        type_id(): UUID {
            return SystemImpl.type_id
        }
    }

    define_type(SystemImpl)
    return new SystemImpl(fn, ...params);
}
