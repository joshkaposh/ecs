import { World } from "../world";
import { from_tuples, QueryState } from "../query/state";
import { Maybe, QueryData, Read, Write } from "../query/fetch";
import { QueryFilter } from "../query/filter";
import { Iterator } from "joshkaposh-iterator";
import { Option, Result } from "joshkaposh-option";
import { Archetype, Entity, EntityDoesNotExistError, EntityRef, EntitySet, init_query_param, QueryCombinationIter, QueryEntityError, QueryManyIter, QueryManyUniqueIter, QuerySingleError, SystemMeta, Tick } from "..";

type Inst<T> = T extends new (...args: any) => infer I ? I : never;

export type RemapToInstance<T extends readonly any[]> = {
    [K in keyof T]:
    T[K] extends Entity ? Entity :
    T[K] extends typeof EntityRef ? EntityRef :

    T[K] extends Write<infer C> | Read<infer C> ? Inst<C> :
    T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    T[K] extends new (...args: any[]) => infer C ? C :
    T[K]
}

export class Query<const D extends readonly any[], const F extends readonly any[]> {
    #world: World;
    #state: QueryState<QueryData, QueryFilter>;
    #last_run: Tick;
    #this_run: Tick;

    constructor(
        world: World,
        state: QueryState<QueryData, QueryFilter>,
        last_run: Tick,
        this_run: Tick
    ) {
        this.#world = world;
        this.#state = state;
        this.#last_run = last_run;
        this.#this_run = this_run;
    }

    static from<const Q extends readonly any[], const F extends readonly any[]>(value: QueryLens<Q, F>) {
        return value.query();
    }

    // TODO: figure out how to pass `data` and `filter` to this method while adhering to `SystemParam.init_state()`
    static init_state(world: World, system_meta: SystemMeta, data: readonly any[], filter: readonly any[]) {
        // TODO: use .new_with_access() instead of .new()
        const [d, f] = from_tuples(data, filter);
        const state = QueryState.new_with_access(
            d,
            f,
            world,
            system_meta.__archetype_component_access
        )
        init_query_param(world, system_meta, state);
        return state;
    }

    static new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta) {
        state.new_archetype(archetype, system_meta.__archetype_component_access)
    }

    static get_param<D extends readonly any[], F extends readonly any[]>(
        state: QueryState<QueryData, QueryFilter>,
        system_meta: SystemMeta,
        world: World,
        change_tick: Tick
    ) {
        return state.query_unchecked_manual_with_ticks<D, F>(world, system_meta.last_run, change_tick);
    }

    clone() {
        return new Query(this.#world, this.#state.clone(), this.#last_run.clone(), this.#this_run.clone())
    }

    data(): QueryData<any, any, any> {
        return this.#state.D;
    }

    filter(): QueryFilter<any, any, any> {
        return this.#state.F;
    }

    get(entity: Entity) {
        return this.get_inner(entity)
        // return this.as_readonly().get_inner(entity)
    }

    get_mut(entity: Entity) {
        return this.get_inner(entity)
    }

    get_many(entities: Entity[]) {
        return this.get_many_readonly(entities);
        // return this.as_readonly().get_many_readonly(entities);
    }

    many(entities: Entity[]): RemapToInstance<D>[] {
        const result = this.get_many(entities);
        if (result instanceof QueryEntityError) {
            throw new Error(`Cannot get query results: ${result.get()}`)
        }
        return result;
    }

    get_many_mut(entities: Entity[]) {
        return this.get_many_inner(entities);
    }

    many_mut(entities: Entity[]) {
        const result = this.get_many_mut(entities);
        if (result instanceof QueryEntityError) {
            throw new Error(`Cannot get query result: ${result.get()}`)
        }
        return result;
    }

    get_inner(entity: Entity) {
        const location = this.#world.entities().get(entity) ?? new EntityDoesNotExistError(entity);
        if (location instanceof EntityDoesNotExistError) {
            return location;
        }
        // @ts-expect-error
        if (!this.#state.__matched_archetypes.contains(location.archetype_id)) {
            return QueryEntityError.QueryDoesNotMatch(entity, this.#world);
        }

        const archetype = this.#world.archetypes().get(location.archetype_id)!;
        const D = this.#state.D;
        const F = this.#state.F;
        // @ts-expect-error
        const fetch_state = this.#state.__fetch_state;
        // @ts-expect-error
        const filter_state = this.#state.__fetch_state;

        const fetch = D.init_fetch(this.#world, fetch_state, this.#last_run, this.#this_run);
        const filter = F.init_fetch(this.#world, filter_state, this.#last_run, this.#this_run);

        const table = this.#world.storages().tables.get(location.table_id)!;
        D.set_archetype(fetch, fetch_state, archetype, table)
        F.set_archetype(filter, filter_state, archetype, table)

        if (F.filter_fetch(filter, entity, location.table_row)) {
            return D.fetch(fetch, entity, location.table_row)
        } else {
            return QueryEntityError.QueryDoesNotMatch(entity, this.#world);
        }

    }

    get_many_inner(entities: Entity[]) {
        const k = entities.length;
        for (let i = 0; i < k; i++) {
            const a = entities[i]
            for (let j = 0; j < i; j++) {
                const b = entities[j]
                if (a === b) {
                    return QueryEntityError.AliasedMutability(a)
                }
            }
        }

        return this.get_many_impl(entities);
    }

    get_many_readonly(entities: Entity[]) {
        return this.get_many_impl(entities)
    }

    get_many_impl(entities: Entity[]): Result<RemapToInstance<D>[], QueryEntityError> {
        const values = new Array(entities.length);
        for (let i = 0; i < entities.length; i++) {
            const value = this.get_inner(entities[i]);
            if (value instanceof QueryEntityError) {
                return value;
            }
            values[i] = value;
        }
        return values;
    }

    single() { }

    get_single() {
        return this.get_single_inner();
    }


    single_mut() { }

    get_single_mut() {
        return this.get_single_inner();
    }

    get_single_inner(): Result<RemapToInstance<D>, QuerySingleError> {
        const query = this.iter();
        const first = query.next();
        const extra = query.next();
        const fdone = !!first.done;
        const extdone = !extra.done;

        if (!fdone && extdone === false) {
            return first.value;
        } else if (fdone) {
            return QuerySingleError.NoEntities(Query.name);
        } else {
            return QuerySingleError.MultipleEntities(Query.name)
        }

    }

    single_inner(): RemapToInstance<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as RemapToInstance<D>;

    }

    single_mut_inner(): RemapToInstance<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as RemapToInstance<D>;
    }


    is_empty(): boolean {
        return this.iter().next().done ?? true;
    }

    contains(entity: Entity) {
        return false;
        // return (!this.as_nop().get(entity) instanceof QueryEntityError)
    }

    iter(): Iterator<RemapToInstance<D>> {
        // TODO: move this to SystemParam.get_param
        this.#last_run.set(this.#world.last_change_tick().get());
        this.#this_run.set(this.#world.change_tick().get());

        return this.#state.iter(
            this.#world,
            this.#last_run,
            this.#this_run
        ) as unknown as Iterator<RemapToInstance<D>>;
    }

    iter_combinations<K extends number>(size: K) {
        return this.iter_combinations_inner(size);
        // return this.as_readonly().iter_combinations_inner();
    }


    iter_combinations_mut<K extends number>(size: K) {
        return this.iter_combinations_inner(size);
    }

    iter_combinations_inner<K extends number>(size: K) {
        return QueryCombinationIter.new(this.#world, this.#state, this.#last_run, this.#this_run, size);
    }

    iter_many(entities: Iterable<Entity>) {
        // return this.as_readonly().iter_many_inner(entities);
        return this.iter_many_inner(entities);
    }

    iter_many_mut(entities: Iterable<Entity>) {
        return this.iter_many_inner(entities);
    }

    iter_many_inner(entities: Iterable<Entity>) {
        return QueryManyIter.new(
            this.#world,
            this.#state,
            entities,
            this.#last_run,
            this.#this_run,
        )
    }

    iter_many_unique(entities: EntitySet) {
        return this.iter_many_unique_inner(entities);
        // return this.as_readonly().iter_many_unique_inner(entities);
    }

    iter_many_unique_mut(entities: EntitySet) {
        return this.iter_many_unique_inner(entities);
    }


    iter_many_unique_inner(entities: EntitySet) {
        return QueryManyUniqueIter.new(
            this.#world,
            this.#state,
            entities,
            this.#last_run,
            this.#this_run
        )
    }

    [Symbol.iterator]() {
        return this.iter()
    }
}

export class QueryLens<const Q extends readonly any[], const F extends readonly any[] = []> {
    #world: World;
    #state: QueryState<QueryData, QueryFilter>;
    #last_run: Tick;
    #this_run: Tick;

    constructor(world: World, state: QueryState<QueryData, QueryFilter>, last_run: Tick, this_run: Tick) {
        this.#world = world;
        this.#state = state;
        this.#last_run = last_run;
        this.#this_run = this_run;
    }

    static from<const Q extends readonly any[], const F extends readonly any[] = []>(value: Query<Q, F>) {
        return value.transmute_lens_filtered()
    }

    query() {
        return new Query<Q, F>(this.#world, this.#state, this.#last_run, this.#this_run)
    }
}

export class Single<const D extends readonly any[], const F extends readonly any[] = []> {
    __item: QueryData['__item'];
    // @ts-expect-error
    __filter: F;

    into_inner() {
        return this.__item;
    }
}

export class Populated<const D extends readonly any[], const F extends readonly any[] = []> {
    __query: Query<D, F>;
    constructor(query: Query<D, F>) {
        this.__query = query;
    }
}

