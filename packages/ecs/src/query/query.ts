import { World } from "../world";
import { QueryState } from "./state";
import { Maybe, QueryData, Read, Write } from "./fetch";
import { QueryFilter } from "./filter";
import { Iterator } from "joshkaposh-iterator";
import { Option } from "joshkaposh-option";
import { Archetype, Entity, EntityRef, SystemMeta, SystemParam, Tick } from "../";

type Inst<T> = T extends new (...args: any) => infer I ? I : never;

export type RemapToInstance<T extends readonly any[]> = {
    [K in keyof T]:
    T[K] extends typeof Entity ? Entity :
    T[K] extends typeof EntityRef ? EntityRef :

    T[K] extends Write<infer C> | Read<infer C> ? Inst<C> :
    T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    T[K] extends new (...args: any[]) => infer C ? C :
    T[K]
}

// @ts-expect-error
export type Single<D, F> = any;

export class Query<const D extends readonly any[], const F extends readonly any[]> implements SystemParam<any, any> {
    #world: World;
    #state: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>;


    constructor(
        world: World,
        state: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>,
        last_run: Tick,
        this_run: Tick
    ) {
        this.#world = world;
        this.#state = state;
    }

    param_init_state(world: World, system_meta: SystemMeta) {
        const state = QueryState.new_with_access(this.#state.D, this.#state.F, world, system_meta.__archetype_component_access)
        // init_query_param(world, system_meta, state);
        return state;
    }

    param_get_param(
        state: any,
        system_meta: SystemMeta,
        world: World,
        change_tick: Tick
    ) {
        return new Query(world, state, system_meta.last_run, change_tick)
    }

    param_new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta) {
        state.new_archetype(archetype, system_meta.__archetype_component_access)
    }

    param_apply(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    param_queue(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    param_validate_param(_state: any, _system_meta: SystemMeta, _world: World): boolean {
        return true;
    }


    data(): QueryData<any, any, any> {
        return this.#state.D;
    }

    filter(): QueryFilter<any, any, any> {
        return this.#state.F;
    }

    get(index: number): Option<RemapToInstance<D>> {
        return this.iter().skip(index).next().value
    }

    get_many(index: number, amount: number): Iterator<RemapToInstance<D>> {
        return this.iter().skip(index).take(amount);
    }

    count(): number {
        return this.iter().count()
    }

    one(): RemapToInstance<D> {
        const next = this.iter().next();
        if (next.done) {
            throw new Error('Query.one() expected at least one entity, but got none')
        }
        return next.value as any;
    }

    is_empty(): boolean {
        return this.iter().count() === 0;
    }

    iter(): Iterator<RemapToInstance<D>> {
        return this.#state.iter(this.#world) as unknown as Iterator<RemapToInstance<D>>;
    }

    [Symbol.iterator]() {
        return this.iter()
    }
}

