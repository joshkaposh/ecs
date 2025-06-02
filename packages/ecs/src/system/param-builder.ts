import { Option } from "joshkaposh-option";
import { World } from "../world";
import { SystemMeta, SystemState } from "./function-system";
import { Local, SystemChangeTick, SystemParam, SystemParamItem, SystemParamState } from "./system-param";
import type { Component, Resource, Tick } from "../component";
import { Commands } from "./commands";
import { OptRes, Res, ResMut, OptResMut } from "../change_detection";
import { Query, ThinQuery } from "./query";
import { Event, EventReader, Events, EventWriter } from "../event";
import { TODO } from "joshkaposh-iterator/src/util";
import { RemovedComponents } from "../removal-detection";

type Push<Previous extends any[], Current> = ParamBuilder<[...Previous, Current]>;

export class ParamBuilder<P extends any[] = []> {
    #uninitialized: [param_type: any, (world: World, meta: SystemMeta) => any][];
    constructor(_name: string) {
        this.#uninitialized = [];
    }

    get uninitialized() {
        return this.#uninitialized;
    }

    #add_param<T>(param_type: T, ctor: (world: World, meta: SystemMeta) => any) {
        this.#uninitialized.push([param_type, ctor]);
        return this;
    }

    build<Param extends Required<SystemParam>>(world: World, meta: SystemMeta, _param?: Param): SystemParamState<Param> {
        return this.#uninitialized.map(([_, ctor]) => ctor(world, meta)) as SystemParamState<Param>;
    }

    buildState<Param extends Required<SystemParam>>(world: World, param: Param): SystemState<Param> {
        return TODO('ParamBuilder.buildState', world, param);
    }

    world(): Push<P, World> {
        return this.#add_param(World, (w, meta) => World.init_state(w, meta));
    }

    array<T>(array: T[]): Push<P, T[]> {
        return this.#add_param(Array, () => array);
    }

    systemChangeTick(): Push<P, SystemChangeTick> {
        return this.#add_param(SystemChangeTick, (world, meta) => SystemChangeTick.init_state(world, meta))
    }

    lastChangeTick(): Push<P, Local<Tick>> {
        return this.#add_param(Local, (world, meta) => Local.init_state(world, meta, world.lastChangeTick))
    }

    local<T>(value: T): Push<P, Local<T>> {
        return this.#add_param(Local, (world, meta) => Local.init_state(world, meta, value as any))
    }

    commands(): Push<P, InstanceType<typeof Commands>> {
        return this.#add_param(Commands, (world, meta) => Commands.init_state(world, meta))
    }

    res<T extends Resource>(resource: T): Push<P, Res<T>> {
        return this.#add_param(Res, (world, meta) => Res.init_state(world, meta, resource));
    }

    resMut<T extends Resource>(resource: T): Push<P, ResMut<T>> {
        return this.#add_param(ResMut, (world, meta) => ResMut.init_state(world, meta, resource));
    }

    optRes<T extends Resource>(resource: T): Push<P, Option<Res<T>>> {
        return this.#add_param(Res, (world, meta) => OptRes.init_state(world, meta, resource));
    }

    optResMut<T extends Resource>(resource: T): Push<P, Option<ResMut<T>>> {
        return this.#add_param(ResMut, (world, meta) => OptResMut.init_state(world, meta, resource));
    }

    query<const D extends any[]>(query: D): Push<P, Query<D, []>> {
        return this.#add_param(Query, (world, meta) => Query.init_state(world, meta, query, []));
    }

    queryFiltered<const D extends any[], const F extends any[]>(data: D, filter: F): Push<P, Query<D, F>> {
        return this.#add_param(Query, (world, meta) => Query.init_state(world, meta, data, filter));
    }

    thinQuery(data: any[]) {
        return this.#add_param(ThinQuery, (world, meta) => ThinQuery.init_state(world, meta, data, []));
    }

    events<E extends Event>(type: E): Push<P, Events<E>> {
        return this.#add_param(Events, (world, meta) => Events.init_state(world, meta, type));
    }

    reader<E extends Event>(type: E): Push<P, Res<EventReader<E>>> {
        return this.#add_param(EventReader, (world, meta) => EventReader.init_state(world, meta, type));
    }

    writer<E extends Event>(type: E): Push<P, ResMut<EventWriter<E>>> {
        return this.#add_param(EventWriter, (world, meta) => EventWriter.init_state(world, meta, type));
    }

    removedComponents<T extends Component>(type: T): Push<P, RemovedComponents> {
        return this.#add_param(RemovedComponents, (world, meta) => RemovedComponents.init_state(world, meta, world.componentId(type)));
    }

    custom<T extends SystemParam>(param: T): Push<P, SystemParamItem<T>> {
        return this.#add_param(param, param.init_state);
    }
}