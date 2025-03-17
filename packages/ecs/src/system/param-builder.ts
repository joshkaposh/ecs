import { Option } from "joshkaposh-option";
import { Entity } from "../entity";
import { Maybe, Read, Write } from "../query";
import { World } from "../world";
import { SystemMeta, SystemState } from "./function-system";
import { Local, SystemChangeTick, SystemParam } from "./system-param";
import { Resource, Tick } from "../component";
import { Commands } from "./commands";
import { Res, ResMut, Ticks, TicksMut } from "../change_detection";
import { Query } from "./query";
import { Event, EventReader, Events, EventWriter } from "../event";

type Inst<T> = T extends new (...args: any) => infer I ? I : never;
type ExcludeMetadata<T extends readonly any[]> = {
    [K in keyof T]:
    T[K] extends typeof Entity ? Entity :
    T[K] extends Write<infer C> | Read<infer C> ? Inst<C> :
    T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    T[K] extends new (...args: any[]) => infer C ? C :
    never
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

    build<Param extends SystemParam>(world: World, meta: SystemMeta, param: Param): Param['State'] {
        return param.init_state(world, meta);
    }

    build_state<Param extends SystemParam>(world: World, param: Param): SystemState<Param> {
        return SystemState.from_builder(world, this, param)
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
        this.#params.push();
        return this as unknown as PRet<P, InstanceType<typeof Commands>>;
    }

    res<T extends Resource>(resource: T): PRet<P, Res<T>> {
        // const res = Res.init_state(this.#w, this.#system_meta, resource);
        // const res = this.#get_res(resource);
        // if (!res) {
        //     throw new Error(`Resource ${resource.name} requested by ${this.#name} does not exist.`)
        // }
        this.#params.push([Res, resource]);
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

    res_mut_opt<T extends Resource>(resource: T): PRet<P, Option<ResMut<T>>> {
        this.#params.push(this.#get_res_mut(resource));
        return this as unknown as PRet<P, Option<ResMut<T>>>
    }

    query<const D extends readonly any[]>(query: D): PRet<P, Query<ExcludeMetadata<D>, []>> {
        const state = Query.init_state(this.#w, this.#system_meta, query as any, [] as any);
        const q = Query.get_param(state, this.#system_meta, this.#w, this.#w.change_tick())
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