import { Option } from "joshkaposh-option";
import { Entity } from "../entity";
import { QueryData } from "../query";
import { World } from "../world";
import { SystemMeta, SystemState } from "./function-system";
import { Local, SystemChangeTick, SystemParam, SystemParamState } from "./system-param";
import type { Component, Resource, Tick } from "../component";
import { Commands } from "./commands";
import { OptRes, Res, ResMut, OptResMut } from "../change_detection";
import { Query, ThinQuery } from "./query";
import { Event, EventReader, Events, EventWriter } from "../event";
import { TODO } from "joshkaposh-iterator/src/util";
import { RemovedComponents } from "../removal-detection";

type ExcludeMetadata<T extends readonly any[]> = {
    [K in keyof T]:
    T[K] extends typeof Entity ? Entity :
    T[K] extends QueryData<infer Item> ? Item :
    // T[K] extends Mutable<infer C> | Read<infer C> ? Inst<C> :
    // T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    // T[K] extends new (...args: any[]) => infer C ? C :
    never
}

type PRet<Previous extends any[], Current> = ParamBuilder<[...Previous, Current]>;

export class ParamBuilder<P extends any[] = []> {
    #uninitialized: [param_type: any, (world: World, meta: SystemMeta) => any][];
    // @ts-expect-error
    #name: string;
    constructor(name: string) {
        this.#uninitialized = [];
        this.#name = name;
    }

    get uninitialized() {
        return this.#uninitialized;
    }

    #add_param(param_type: any, ctor: (world: World, meta: SystemMeta) => any) {
        this.#uninitialized.push([param_type, ctor])
        return this;
    }

    build<Param extends SystemParam>(world: World, meta: SystemMeta, _param?: Param): SystemParamState<Param> {
        return this.#uninitialized.map(([_, ctor]) => ctor(world, meta)) as SystemParamState<Param>;
    }

    buildState<Param extends SystemParam>(world: World, param: Param): SystemState<Param> {
        return TODO('ParamBuilder.buildState', world, param);
    }

    world(): PRet<P, World> {
        return this.#add_param(World, (w, meta) => World.init_state(w, meta));
    }

    array<T>(array: T[]): PRet<P, T[]> {
        return this.#add_param(Array, () => array);
    }

    systemChangeTick(): PRet<P, SystemChangeTick> {
        return this.#add_param(SystemChangeTick, (world, meta) => SystemChangeTick.init_state(world, meta))
    }

    lastChangeTick(): PRet<P, Local<Tick>> {
        return this.#add_param(Local, (world, meta) => Local.init_state(world, meta, world.lastChangeTick))
    }

    local<T>(value: T): PRet<P, Local<T>> {
        return this.#add_param(Local, (world, meta) => Local.init_state(world, meta, value as any))
    }

    commands(): PRet<P, InstanceType<typeof Commands>> {
        return this.#add_param(Commands, (world, meta) => Commands.init_state(world, meta))
    }

    res<T extends Resource>(resource: T): PRet<P, Res<T>> {
        return this.#add_param(Res, (world, meta) => Res.init_state(world, meta, resource));
    }

    resMut<T extends Resource>(resource: T): PRet<P, ResMut<T>> {
        return this.#add_param(ResMut, (world, meta) => ResMut.init_state(world, meta, resource));
    }

    optRes<T extends Resource>(resource: T): PRet<P, Option<Res<T>>> {
        return this.#add_param(Res, (world, meta) => OptRes.init_state(world, meta, resource));
    }

    optResMut<T extends Resource>(resource: T): PRet<P, Option<ResMut<T>>> {
        return this.#add_param(ResMut, (world, meta) => OptResMut.init_state(world, meta, resource));
    }

    query<const D extends readonly any[]>(query: D): PRet<P, Query<D, []>> {
        return this.#add_param(Query, (world, meta) => Query.init_state(world, meta, query, []))
    }

    queryFiltered<const D extends readonly any[], const F extends readonly any[]>(data: D, filter: F): PRet<P, Query<ExcludeMetadata<D>, F>> {
        return this.#add_param(Query, (world, meta) => Query.init_state(world, meta, data, filter))
    }

    thinQuery(data: any[]) {
        return this.#add_param(ThinQuery, (world, meta) => ThinQuery.init_state(world, meta, data, []));
    }

    events<E extends Event>(type: E): PRet<P, Events<E>> {
        return this.#add_param(Events, (world, meta) => Events.init_state(world, meta, type));
    }

    reader<E extends Event>(type: E): PRet<P, Res<EventReader<E>>> {
        return this.#add_param(EventReader, (world, meta) => EventReader.init_state(world, meta, type));
    }

    writer<E extends Event>(type: E): PRet<P, ResMut<EventWriter<E>>> {
        return this.#add_param(EventWriter, (world, meta) => EventWriter.init_state(world, meta, type));
    }

    removedComponent<T extends Component>(type: T): PRet<P, RemovedComponents> {
        return this.#add_param(RemovedComponents, (world, meta) => RemovedComponents.init_state(world, meta, world.componentId(type)))
    }
}