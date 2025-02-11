import { Entity, Event, EventReader, Events, EventWriter, Res, Resource, Tick } from "..";
import { Archetype } from "../archetype";
import { Maybe, Query, Read, Write } from "../query";
import { World } from "../world";
import { SystemMeta } from './function-system';
import { Commands } from "../world/world";
import { Option } from "joshkaposh-option";
import { ResMut, Ticks, TicksMut } from "../change_detection";

export interface SystemParam<State, Item> {
    param_init_state(world: World, system_meta: SystemMeta): State;
    param_get_param(state: State, system: SystemMeta, world: World, change_tick: Tick): Item;

    param_new_archetype(_state: State, _archetype: Archetype, _system_meta: SystemMeta): void;

    param_apply(_state: State, _system_meta: SystemMeta, _world: World): void;

    param_queue(_state: State, _system_meta: SystemMeta, _world: World): void;


    param_validate_param(_state: State, _system_meta: SystemMeta, _world: World): boolean;

}

export class ParamSet<T extends SystemParam<any, any>> implements SystemParam<any, any> {
    constructor(
        public param_states: ReturnType<T['param_init_state']>,
        public world: World,
        public system_meta: SystemMeta,
        public change_tick: Tick,
    ) {
    }

    param_init_state(world: World, system_meta: SystemMeta) {

        const states = this.param_states;
        let system_meta_
        for (let i = 0; i < states.length; i++) {
            system_meta_ = system_meta.clone();
            system_meta_.__archetype_component_access.clear();
            states[i].param_init_state(world, system_meta_.clone())
            states[i].param_init_state(world, system_meta.clone())
        }

        if (!system_meta_!.is_send()) {
            system_meta.set_non_send();
        }

        const params: any[] = []

        for (let i = 0; i < states.length; i++) {
            const param = states[i];
            system_meta.__component_access_set.extend(param.__component_access_set)
            system_meta.__archetype_component_access.extend(param.__archetype_component_access)
            params.push(param)
        }

        return params
    }

    param_new_archetype(state: any, archetype: Archetype, _system_meta: SystemMeta): void {
        for (let i = 0; i < this.param_states.length; i++) {
            this.param_states[i].param_new_archetype(state, archetype);
        }
    }

    param_apply(state: any, system_meta: SystemMeta, world: World): void {
        for (let i = 0; i < this.param_states.length; i++) {
            this.param_states[i].param_apply(state, system_meta, world);
        }
    }

    param_queue(state: any, system_meta: SystemMeta, world: World): void {
        const states = this.param_states
        for (let i = 0; i < states.length; i++) {
            states[i].param_queue(state, system_meta, world)
        }
    }

    param_validate_param(state: any, system_meta: SystemMeta, world: World): boolean {
        return this.param_states.every((p: any) => p.param_validate_param(state, system_meta, world))
    }

    param_get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick) {
        return new ParamSet(state, world, system_meta.clone(), change_tick)
    }

}

export class Local<T> {
    constructor(public value: T) { }
}

type Inst<T> = T extends new (...args: any) => infer I ? I : never;
type ExcludeMetadata<T extends readonly any[]> = {
    [K in keyof T]:
    T[K] extends typeof Entity ? Entity :
    T[K] extends Write<infer C> | Read<infer C> ? Inst<C> :
    T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    T[K] extends new (...args: any[]) => infer C ? C :
    never
}

export class SystemChangeTick {
    #last_run: Tick;
    #this_run: Tick;

    constructor(last_run: Tick, this_run: Tick) {
        this.#last_run = last_run;
        this.#this_run = this_run;
    }

    last_run() {
        return this.#last_run
    }

    this_run() {
        return this.#this_run;
    }
}

type PRet<Previous extends any[], Current> = ParamBuilder<[...Previous, Current]>;

export class ParamBuilder<P extends any[] = []> {
    #w: World;
    #system_meta: SystemMeta
    #params: P;
    #name: string;
    constructor(world: World, system_meta: SystemMeta, name: string) {
        this.#w = world;
        this.#system_meta = system_meta;
        this.#params = [] as unknown as P;
        this.#name = name;
    }

    world(): PRet<P, World> {
        this.#params.push(this.#w);
        return this as unknown as PRet<P, World>;
    }

    array<T>(array: T[]): PRet<P, T[]> {
        this.#params.push(array);
        return this as unknown as PRet<P, T[]>;
    }

    system_change_tick(): PRet<P, SystemChangeTick> {
        this.#params.push(new SystemChangeTick(this.#system_meta.last_run, this.#w.change_tick()))
        return this as unknown as PRet<P, SystemChangeTick>;
    }

    last_change_tick(): PRet<P, Local<Tick>> {
        const tick = this.#w.last_change_tick();
        const local = new Local(tick);
        this.#params.push(local);
        return this as unknown as PRet<P, Local<Tick>>;
    }

    local<T>(value: T): PRet<P, Local<T>> {
        this.#params.push(new Local(value))
        return this as unknown as PRet<P, Local<T>>;
    }

    commands(): PRet<P, InstanceType<typeof Commands>> {
        this.#params.push(new Commands(this.#w));
        return this as unknown as PRet<P, InstanceType<typeof Commands>>;
    }

    res<T extends Resource>(resource: T): PRet<P, Res<T>> {
        const res = this.#get_res(resource);
        if (!res) {
            throw new Error(`Resource ${resource.name} requested by ${this.#name} does not exist.`)
        }
        this.#params.push(res);
        return this as unknown as PRet<P, Res<T>>;
    }

    res_mut<T extends Resource>(resource: T): PRet<P, ResMut<T>> {
        const res = this.#get_res_mut(resource);
        if (!res) {
            throw new Error(`Resource ${resource.name} requested by ${this.#name} does not exist.`)
        }
        this.#params.push(res);
        return this as unknown as PRet<P, ResMut<T>>
    }

    res_opt<T extends Resource>(resource: T): PRet<P, Option<Res<T>>> {
        this.#params.push(this.#get_res(resource));
        return this as unknown as PRet<P, Option<Res<T>>>;
    }

    res_mut_opt<T extends Resource>(resource: T): PRet<P, ResMut<T>> {
        this.#params.push(this.#get_res_mut(resource));
        return this as unknown as PRet<P, ResMut<T>>
    }

    query<const D extends readonly any[]>(query: D): PRet<P, Query<ExcludeMetadata<D>, []>> {
        const q = this.#w.query(query)
        this.#params.push(q);
        return this as unknown as PRet<P, Query<ExcludeMetadata<D>, []>>;
    }

    query_filtered<const D extends readonly any[], const F extends readonly any[]>(data: D, filter: F): PRet<P, Query<ExcludeMetadata<D>, F>> {
        const q = this.#w.query_filtered(data, filter);
        this.#params.push(q);
        return this as unknown as PRet<P, Query<ExcludeMetadata<D>, F>>;
    }

    events<E extends Event>(type: E): PRet<P, Events<E>> {
        const event = this.#get_events(type);
        this.#params.push(event);
        return this as unknown as PRet<P, Events<E>>;
    }

    reader<E extends Event>(type: E): PRet<P, EventReader<E>> {
        const event = this.#get_events(type);
        const reader = new EventReader(event.get_cursor(), event)
        this.#params.push(reader);
        return this as unknown as PRet<P, EventReader<E>>;
    }

    writer<E extends Event>(type: E): PRet<P, EventWriter<E>> {
        const event = this.#get_events(type);
        const writer = new EventWriter(event as any);
        this.#params.push(writer);
        return this as unknown as PRet<P, EventWriter<E>>;
    }

    // @ts-expect-error
    private params() {
        return this.#params;
    }

    #get_events<E extends Event>(type: E): Events<E> {
        // @ts-expect-error
        return this.#w.resource(type.ECS_EVENTS_TYPE);
    }

    #get_res<T extends Resource>(resource: T) {
        const component_id = this.#w.components().get_resource_id(resource);
        if (typeof component_id !== 'number') {
            return;
        } else {
            const data = this.#w.get_resource_with_ticks(component_id);
            if (!data) {
                return
            } else {
                const [ptr, ticks] = data;
                return new Res(ptr, new Ticks(
                    ticks.added,
                    ticks.changed,
                    this.#system_meta.last_run,
                    this.#w.change_tick(),
                ))
            }
        }
    }

    #get_res_mut<T extends Resource>(resource: T) {
        const component_id = this.#w.components().get_resource_id(resource);
        if (typeof component_id !== 'number') {
            return;
        } else {
            const res = this.#w.get_resource_mut_by_id(component_id)!;
            return new ResMut(res.deref_mut(), new TicksMut(
                res.ticks.added,
                res.ticks.changed,
                this.#system_meta.last_run,
                this.#w.change_tick()
            ));
        }
    }
}

export type SystemParamItem<P extends SystemParam<any, any>> = ReturnType<P['param_get_param']>;