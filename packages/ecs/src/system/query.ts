import { ThinWorld, World } from "../world";
import { QueryState, ThinQueryState } from "../query/state";
import { QueryData, RemapQueryTupleToQueryData, QueryDataTuple, AsQueryItem, ThinQueryData } from "../query/fetch";
import { All, QueryFilter, ThinQueryFilter } from "../query/filter";
import { Result } from "joshkaposh-option";
import { Archetype, Entity, EntitySet, init_query_param, NoopWorldQuery, QueryCombinationIter, QueryEntityError, QueryIter, QueryManyIter, QueryManyUniqueIter, QuerySingleError, SystemMeta, Tick } from "..";
import { TODO } from "joshkaposh-iterator/src/util";

export class Query<const D extends readonly any[], const F extends readonly any[]> {
    #world: World;
    #state: QueryState<RemapQueryTupleToQueryData<D>, QueryFilter>;
    #last_run: Tick;
    #this_run: Tick;

    constructor(
        world: World,
        state: QueryState<RemapQueryTupleToQueryData<D>, QueryFilter>,
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

    static init_state(world: World, system_meta: SystemMeta, data: readonly any[], filter: readonly any[]) {
        const state = QueryState.newWithAccess(new QueryDataTuple(data), All(...filter), world, system_meta.__archetype_component_access)
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
        return state.iter_unchecked_manual(world, system_meta.last_run, change_tick) as unknown as QueryIter<D, F>;
    }

    clone() {
        return new Query(this.#world, this.#state.clone(), this.#last_run, this.#this_run)
    }

    data(): QueryData<any, any, any> {
        return this.#state.D;
    }

    filter(): QueryFilter<any, any, any> {
        return this.#state.F;
    }

    as_nop() {
        return new NoopWorldQuery();
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

    many(entities: Entity[]): AsQueryItem<D>[] {
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

    get_inner(entity: Entity): Result<AsQueryItem<D>, QueryEntityError> {
        const location = this.#world.entities.get(entity);
        if (!location) {
            return QueryEntityError.NoSuchEntity(entity);
        }
        // @ts-expect-error
        if (!this.#state.__matched_archetypes.contains(location.archetype_id)) {

            return QueryEntityError.QueryDoesNotMatch(entity, this.#world);
        }

        const archetype = this.#world.archetypes.get(location.archetype_id)!;
        const D = this.#state.D;
        const F = this.#state.F;
        // @ts-expect-error
        const fetch_state = this.#state.__fetch_state;
        // @ts-expect-error
        const filter_state = this.#state.__fetch_state;

        const fetch = D.init_fetch(this.#world, fetch_state, this.#last_run, this.#this_run);
        const filter = F.init_fetch(this.#world, filter_state, this.#last_run, this.#this_run);

        const table = this.#world.storages.tables.get(location.table_id)!;
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

    get_many_impl(entities: Entity[]): Result<AsQueryItem<D>[], QueryEntityError> {
        const values = new Array(entities.length);
        for (let i = 0; i < entities.length; i++) {
            const value = this.get_inner(entities[i]);
            if (!Array.isArray(value)) {
                return value as QueryEntityError;
            }
            values[i] = value;
        }
        return values;
    }

    single(): AsQueryItem<D> {
        const item = this.get_single();

        if (!Array.isArray(item)) {
            throw item;
        }

        return item as AsQueryItem<D>;
    }

    get_single() {
        return this.get_single_inner();
    }


    single_mut() { }

    get_single_mut() {
        return this.get_single_inner();
    }

    get_single_inner(): Result<AsQueryItem<D>, QuerySingleError> {
        const query = this.iter();
        const first = query.next();
        const extra = query.next();
        const fdone = first.done;

        if (!fdone && extra.done) {
            return first.value;
        } else if (fdone) {
            return QuerySingleError.NoEntities(Query.name);
        } else {
            return QuerySingleError.MultipleEntities(Query.name)
        }
    }

    single_inner(): AsQueryItem<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as AsQueryItem<D>;

    }

    single_mut_inner(): AsQueryItem<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as AsQueryItem<D>;
    }

    count() {
        return this.#state.iter(this.#world).remaining();
    }

    is_empty(): boolean {
        return this.iter().next().done!;
    }

    has(entity: Entity) {
        return TODO('Query.has', entity)
        // return this.as_nop().get(entity) instanceof QueryEntityError;
        // return false;
        // return (!this.as_nop().get(entity) instanceof QueryEntityError)
    }

    iter(): QueryIter<AsQueryItem<D>, F> {
        return this.#state.iter(this.#world);
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
        return this.iter();
    }
}

export class ThinQuery<const D extends readonly any[], const F extends readonly any[]> {
    #world: World;
    #state: QueryState<RemapQueryTupleToQueryData<D>, QueryFilter>;
    #last_run: Tick;
    #this_run: Tick;

    constructor(
        world: World,
        state: QueryState<RemapQueryTupleToQueryData<D>, QueryFilter>,
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

    static init_state(world: World, system_meta: SystemMeta, data: readonly any[], filter: readonly any[]) {
        const state = ThinQueryState.newWithAccess(world as any, system_meta.__archetype_component_access, new QueryDataTuple(data) as any, All(...filter) as any)
        init_query_param(world, system_meta, state as any);
        return state;
    }

    static new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta) {
        state.new_archetype(archetype, system_meta.__archetype_component_access)
    }

    static get_param<D extends readonly any[], F extends readonly any[]>(
        state: ThinQueryState<ThinQueryData, ThinQueryFilter>,
        system_meta: SystemMeta,
        world: ThinWorld,
        change_tick: Tick
    ) {
        return state.iter_unchecked_manual(world, system_meta.last_run, change_tick) as unknown as QueryIter<D, F>;
    }

    clone() {
        return new Query(this.#world, this.#state.clone(), this.#last_run, this.#this_run)
    }

    data(): QueryData<any, any, any> {
        return this.#state.D;
    }

    filter(): QueryFilter<any, any, any> {
        return this.#state.F;
    }

    as_nop() {
        return new NoopWorldQuery();
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

    many(entities: Entity[]): AsQueryItem<D>[] {
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

    get_inner(entity: Entity): Result<AsQueryItem<D>, QueryEntityError> {
        const location = this.#world.entities.get(entity);
        if (!location) {
            return QueryEntityError.NoSuchEntity(entity);
        }
        // @ts-expect-error
        if (!this.#state.__matched_archetypes.contains(location.archetype_id)) {

            return QueryEntityError.QueryDoesNotMatch(entity, this.#world);
        }

        const archetype = this.#world.archetypes.get(location.archetype_id)!;
        const D = this.#state.D;
        const F = this.#state.F;
        // @ts-expect-error
        const fetch_state = this.#state.__fetch_state;
        // @ts-expect-error
        const filter_state = this.#state.__fetch_state;

        const fetch = D.init_fetch(this.#world, fetch_state, this.#last_run, this.#this_run);
        const filter = F.init_fetch(this.#world, filter_state, this.#last_run, this.#this_run);

        const table = this.#world.storages.tables.get(location.table_id)!;
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

    get_many_impl(entities: Entity[]): Result<AsQueryItem<D>[], QueryEntityError> {
        const values = new Array(entities.length);
        for (let i = 0; i < entities.length; i++) {
            const value = this.get_inner(entities[i]);
            if (!Array.isArray(value)) {
                return value as QueryEntityError;
            }
            values[i] = value;
        }
        return values;
    }

    single(): AsQueryItem<D> {
        const item = this.get_single();

        if (!Array.isArray(item)) {
            throw item;
        }

        return item as AsQueryItem<D>;
    }

    get_single() {
        return this.get_single_inner();
    }


    single_mut() { }

    get_single_mut() {
        return this.get_single_inner();
    }

    get_single_inner(): Result<AsQueryItem<D>, QuerySingleError> {
        const query = this.iter();
        const first = query.next();
        const extra = query.next();
        const fdone = first.done;

        if (!fdone && extra.done) {
            return first.value;
        } else if (fdone) {
            return QuerySingleError.NoEntities(Query.name);
        } else {
            return QuerySingleError.MultipleEntities(Query.name)
        }
    }

    single_inner(): AsQueryItem<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as AsQueryItem<D>;

    }

    single_mut_inner(): AsQueryItem<D> {
        const single = this.get_single_inner();
        if (!Array.isArray(single)) {
            throw single;
        }

        return single as AsQueryItem<D>;
    }

    count() {
        return this.#state.iter(this.#world).remaining();
    }

    is_empty(): boolean {
        return this.iter().next().done!;
    }

    has(entity: Entity) {
        return TODO('Query.has', entity)
        // return this.as_nop().get(entity) instanceof QueryEntityError;
        // return false;
        // return (!this.as_nop().get(entity) instanceof QueryEntityError)
    }

    iter(): QueryIter<AsQueryItem<D>, F> {
        return this.#state.iter(this.#world);
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
        return this.iter();
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
        return TODO('QueryLens.from', value)
        // return value.transmute_lens_filtered()
    }

    query() {
        return new Query<Q, F>(this.#world, this.#state, this.#last_run, this.#this_run)
    }
}

export class Single<const D extends readonly any[], const F extends readonly any[] = []> {
    __item!: AsQueryItem<D>;
    __filter!: F;

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

