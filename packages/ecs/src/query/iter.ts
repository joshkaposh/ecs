import { Iterator, done, item } from "joshkaposh-iterator";
import { Archetype, ArchetypeEntity, Archetypes, AsQueryFetch, AsQueryItem, Entity, InternalArchetypeEntity, QueryData, QueryFilter, QueryState, StorageId, StorageIdArchetype, StorageIdTable, ThinQueryData, ThinQueryFilter, ThinQueryState, ThinWorld, Tick, World } from "ecs";
import { Table, Tables, ThinTable, ThinTables } from "../storage/table";
import { type Option, u32 } from "joshkaposh-option";
import { TODO } from "joshkaposh-iterator/src/util";
import { debug_assert } from "../util";
import { ComponentProxy } from "@packages/define";

export class QueryIter<D, F> extends Iterator<D> {
    #tables: Tables;
    #archetypes: Archetypes;
    #query_state: QueryState<any, any>;
    #cursor: QueryIterationCursor<D, F>;
    #D: QueryData;
    #F: QueryFilter;

    constructor(
        world: World,
        state: QueryState<QueryData, QueryFilter>,
        last_run: Tick,
        this_run: Tick,
        tables?: Tables,
        archetypes?: Archetypes,
        cursor?: QueryIterationCursor<D, F>
    ) {
        super()
        tables ??= world.storages.tables;
        archetypes ??= world.archetypes;
        cursor ??= QueryIterationCursor.init<D, F>(world, state, last_run, this_run);

        this.#tables = tables;
        this.#archetypes = archetypes;
        this.#cursor = cursor;
        this.#query_state = state;
        this.#D = state.D;
        this.#F = state.F;
    }

    next(): IteratorResult<D> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state);
    }

    into_iter(): Iterator<D> {
        return this;
    }

    /**
     * Creates a new separate iterayor yielding the same remaining items of the current one.
     * Advancing the new iterator will not advance the original one, which will resume at the same point it was left at.
     * 
     * Differently from `QueryIter.remaining_mut()`, the new iterator does not refer to the original one. However it can only be called from an iterator over readonly items.
     */
    remaining() {
        return this.#cursor.max_remaining(this.#tables, this.#archetypes);
        // return this.#cursor.max_remaining(this.#tables, this.#archetypes);
        // return TODO('QueryIter.remaining()');
        // return new QueryIter<D, F>(
        // this.#world,
        // this.#query_state,
        // this.#tables,
        // this.#archetypes,
        // this.#cursor.clone()
        // )
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from a storage.
     * 
     * **SAFETY**
     * 
     * `from` and `to` must be in the range of `0` to `storage.entityCount`, or left empty.
     */
    fold_over_storage_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        storage: StorageId,
        from?: number,
        to?: number
    ) {
        if (this.#cursor.is_dense) {
            const table_id = (storage as StorageIdTable).table_id;
            const table = this.#tables.get(table_id)!;
            from ??= 0;
            to ??= table.entityCount;
            accum = this.fold_over_table_range(accum, fold, table, from, to);
        } else {
            const archetype_id = (storage as StorageIdArchetype).archetype_id;
            const archetype = this.#archetypes.get(archetype_id)!;
            const table = this.#tables.get(archetype.tableId)!;
            from ??= 0;
            to ??= archetype.length;

            if (table.entityCount === archetype.length) {
                accum = this.fold_over_dense_archetype_range(accum, fold, archetype, from, to)
            } else {
                accum = this.fold_over_archetype_range(accum, fold, archetype, from, to);

            }
        }
        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from a table.
     * 
     * SAFETY
     * 
     * - all `rows` must be in the range of `0` to `table.entityCount`
     * - `table` must match `D` and `F`.
     * - The query iteration must be dense (i.e. `this.query_state.is_dense` must be true).
     */
    fold_over_table_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        table: Table,
        row_start: number,
        row_end: number
    ): B {
        if (table.isEmpty) {
            return accum;
        }

        debug_assert(row_end <= u32.MAX, 'too many entities');
        // @ts-expect-error
        this.#D.set_table(this.#cursor.__fetch, this.#query_state.__fetch_state, table);
        // @ts-expect-error
        this.#F.set_table(this.#cursor.__filter, this.#query_state.__filter_state, table);
        const entities = table.entities;
        for (let row = row_start; row < row_end; row++) {
            const entity = entities[row];
            const fetched = !this.#F.filter_fetch(this.#cursor.__filter, entity, row);
            if (fetched) {
                continue
            }

            const elt = this.#D.fetch(this.#cursor.__fetch, entity, row);
            accum = fold(accum, elt);

        }

        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from an archetype.
     * 
     * SAFETY
     * - all `indices` from `index_start` to `index_end` must be in the range from `0` to `archetype.length`.
     * - `archetype` must match `D` and `F`
     * - The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        archetype: Archetype,
        index_start: number,
        index_end: number,
    ): B {

        if (archetype.isEmpty) {
            return accum
        }

        const table = this.#tables.get(archetype.tableId)!;
        this.#D.set_archetype(
            this.#cursor.__fetch,
            // @ts-expect-error
            this.#query_state.__fetch_state,
            archetype,
            table
        )

        this.#F.set_archetype(
            this.#cursor.__filter,
            // @ts-expect-error
            this.#query_state.__filter_state,
            archetype,
            table
        )

        const entities = archetype.entities as unknown as InternalArchetypeEntity[];
        for (let i = index_start; i < index_end; i++) {
            const archetype_entity = entities[i];

            const fetched = !this.#F.filter_fetch(this.#cursor.__filter, archetype_entity.id(), archetype_entity.table_row)
            if (fetched) {
                continue
            }

            const elt = this.#D.fetch(this.#cursor.__fetch, archetype_entity.id(), archetype_entity.table_row)
            accum = fold(accum, elt)
        }

        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment
     * from an archetype which has the same entity count as its table.
     * 
     * SAFETY
     * - all `indices` must be in the range from `0` to `archetype.length`.
     * - `archetype` must match `D` and `F`.
     * - `archetype` must have the same length as its table.
     * The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_dense_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        archetype: Archetype,
        rows_start: number,
        rows_end: number
    ): B {
        if (archetype.isEmpty) {
            return accum
        }

        debug_assert(rows_end <= u32.MAX, 'too many entities');

        const table = this.#tables.get(archetype.tableId)!
        debug_assert(archetype.length === table.entityCount, 'mismatched entity length')

        // @ts-expect-error
        this.#D.set_archetype(this.#cursor.__fetch, this.#query_state.__fetch_state, archetype, table);
        // @ts-expect-error
        this.#F.set_archetype(this.#cursor.__filter, this.#query_state.__filter_state, archetype, table);

        const entities = table.entities;

        for (let row = rows_start; row < rows_end; row++) {
            const entity = entities[row];
            const filter_matched = !this.#F.filter_fetch(this.#cursor.__filter, entity, row);
            if (filter_matched) {
                continue
            }
            const elt = this.#D.fetch(this.#cursor.__fetch, entity, row);
            accum = fold(accum, elt);
        }

        return accum
    }

    fold<B>(initial: B, fold: (acc: B, x: any) => B): B {
        let accum = initial;
        while (this.#cursor.__current_row !== this.#cursor.__current_len) {
            const elt = this.next();
            if (elt.done) {
                break
            }
            accum = fold(accum, elt.value);
        }

        const ids = this.#cursor.__storage_id_iter.slice(this.#cursor.__storage_id_index)
        for (let i = 0; i < ids.length; i++) {
            accum = this.fold_over_storage_range(accum, fold, ids[i], undefined)
        }
        return accum;
    }

    // sort<L extends ReadonlyQueryData<Ord>>(query: L) {
    //     return this.#sort_impl((keyed_query) => keyed_query.sort())
    // }

    // sort_unstable<L extends ReadonlyQueryData<Ord>>(query: L) {
    //     return this.#sort_impl((keyed_query) => keyed_query.sort_unstable());
    // }

    // sort_by<L extends ReadonlyQueryData<any>>(query: L, compare: (lhs: L['__item'], rhs: L['__item']) => -1 | 0 | 1) {
    //     return this.#sort_impl(keyed_query => {
    //         return keyed_query.sort_by(([key1], [key2]) => compare(key1, key2))
    //     })
    // }

    // sort_unstable_by<L extends ReadonlyQueryData>(query: L, compare: (lhs: L['__item'], rhs: L['__item']) => -1 | 0 | 1) {
    //     return this.#sort_impl(keyed_query => {
    //         return keyed_query.sort_unstable_by(([key1], [key2]) => compare(key1, key2))
    //     })
    // }

    // sort_by_key<L extends ReadonlyQueryData, K>(query: L, fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_by_key(([lens]) => fn(lens)))
    // }

    // sort_unstable_by_key<L extends ReadonlyQueryData, K>(fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_unstable_by_key(([lens]) => fn(lens)))
    // }

    // sort_by_cached_key<L extends ReadonlyQueryData, K>(query: L, fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_by_cached_key(([lens]) => fn(lens)))
    // }

    // #sort_impl<L extends ReadonlyQueryData>(query: L, fn: (items: Array<[L['__item'], NeutralOrd<Entity>]>) => void) {
    //     /**
    //      * On the first successful iterator of `QueryIterationCursor`, `archetype_entities` or `table_entities`
    //      * will be set to a non-zero value. The correctness of this method relies on this.
    //      * I.e. this sort method will execute if and only if `next` on `QueryIterationCursor` of a 
    //      * non-empty `QueryIter` has not yet been called. When empty, this sort empty will not throw an Error.
    //      */

    //     if (this.#cursor.__archetype_entities.length !== 0 || this.#cursor.__table_entities.length !== 0) {
    //         throw new Error('it is not valid to call sort() after next()')
    //     }

    //     const world = this.#world;
    //     const query_lens_state = this.#query_state.transmute_filtered([query, Entity] as any, this.#F, world);

    //     // const query_lens = query_lens_state.query_unchecked_manual(world);
    //     // const keyed_query = query_lens.map(([key, entity]) => [key, NeutralOrd(entity)]).collect()
    //     // fn(keyed_query);
    //     // const entity_iter = iter(keyed_query).map(([..._, entity]) => entity.value);

    //     // return QuerySortedIter.new(
    //     //     world,
    //     //     this.#query_state,
    //     //     entity_iter,
    //     //     world.last_change_tick(),
    //     //     world.change_tick(),
    //     // )
    // }

    size_hint(): [number, Option<number>] {
        const max_size = this.#cursor.max_remaining(this.#tables, this.#archetypes);
        const archetype_query = this.#F.IS_ARCHETYPAL;
        const min_size = archetype_query ? max_size : 0;
        return [min_size, max_size]
    }

    iter() {
        return this
    }
}

export class ThinQueryIter<D extends readonly any[], F extends readonly any[]> extends Iterator<AsQueryItem<D>> {
    #tables: ThinTables;
    #archetypes: Archetypes;
    #query_state: ThinQueryState<any, any>;
    #cursor: ThinQueryIterationCursor<D, F>;
    #D: ThinQueryData;
    #F: ThinQueryFilter;

    constructor(
        world: ThinWorld,
        state: ThinQueryState<ThinQueryData, ThinQueryFilter>,
        last_run: Tick,
        this_run: Tick,
        tables?: ThinTables,
        archetypes?: Archetypes,
        cursor?: ThinQueryIterationCursor<D, F>
    ) {
        super()
        this.#tables = tables ?? world.storages.tables;
        this.#archetypes = archetypes ?? world.archetypes;
        this.#cursor = cursor ?? ThinQueryIterationCursor.init<D, F>(world, state, last_run, this_run);
        this.#query_state = state;
        this.#D = state.D
        this.#F = state.F;
    }

    next(): IteratorResult<any, any> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state);
    }

    into_iter(): Iterator<any> {
        return this;
    }

    index() {
        return this.#cursor.next_index(this.#query_state);
    }

    /**
     * Creates a new separate iterayor yielding the same remaining items of the current one.
     * Advancing the new iterator will not advance the original one, which will resume at the same point it was left at.
     * 
     * Differently from `QueryIter.remaining_mut()`, the new iterator does not refer to the original one. However it can only be called from an iterator over readonly items.
     */
    remaining(): QueryIter<D, F> {
        return TODO('QueryIter.remaining()');
        // return new QueryIter<D, F>(
        // this.#world,
        // this.#query_state,
        // this.#tables,
        // this.#archetypes,
        // this.#cursor.clone()
        // )
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from a storage.
     * 
     * SAFETY
     * 
     * `from` and `to` must be in the range of `0` to `storage.entityCount`, or left empty.
     */
    fold_over_storage_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        storage: StorageId,
        from?: number,
        to?: number
    ) {
        if (this.#cursor.is_dense) {
            const table_id = (storage as StorageIdTable).table_id;
            const table = this.#tables.get(table_id)!;
            from ??= 0;
            to ??= table.entityCount;
            accum = this.fold_over_table_range(accum, fold, table, from, to);
        } else {
            const archetype_id = (storage as StorageIdArchetype).archetype_id;
            const archetype = this.#archetypes.get(archetype_id)!;
            const table = this.#tables.get(archetype.tableId)!;
            from ??= 0;
            to ??= archetype.length;

            if (table.entityCount === archetype.length) {
                accum = this.fold_over_dense_archetype_range(accum, fold, archetype, from, to)
            } else {
                accum = this.fold_over_archetype_range(accum, fold, archetype, from, to);

            }
        }
        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from a table.
     * 
     * SAFETY
     * 
     * - all `rows` must be in the range of `0` to `table.entityCount`
     * - `table` must match `D` and `F`.
     * - The query iteration must be dense (i.e. `this.query_state.is_dense` must be true).
     */
    fold_over_table_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        table: ThinTable,
        row_start: number,
        row_end: number
    ): B {
        if (table.isEmpty) {
            return accum;
        }

        debug_assert(row_end <= u32.MAX, 'Too many entities');
        // @ts-expect-error
        this.#D.set_table(this.#cursor.__fetch, this.#query_state.__fetch_state, table);
        // @ts-expect-error
        this.#F.set_table(this.#cursor.__filter, this.#query_state.__filter_state, table);
        const entities = table.entities;
        for (let row = row_start; row < row_end; row++) {
            const entity = entities[row];
            const fetched = !this.#F.filter_fetch(this.#cursor.filter, entity, row);
            if (fetched) {
                continue
            }

            const elt = this.#D.fetch(this.#cursor.fetch, entity, row);
            accum = fold(accum, elt);

        }

        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment from an archetype.
     * 
     * SAFETY
     * - all `indices` from `index_start` to `index_end` must be in the range from `0` to `archetype.length`.
     * - `archetype` must match `D` and `F`
     * - The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        archetype: Archetype,
        index_start: number,
        index_end: number,
    ): B {

        if (archetype.isEmpty) {
            return accum
        }

        const table = this.#tables.get(archetype.tableId)!;
        this.#D.set_archetype(
            this.#cursor.fetch,
            // @ts-expect-error
            this.#query_state.__fetch_state,
            archetype,
            table,
        )

        this.#F.set_archetype(
            this.#cursor.filter,
            // @ts-expect-error
            this.#query_state.__filter_state,
            archetype,
            table,
        )

        const entities = archetype.entities as unknown as InternalArchetypeEntity[];
        for (let i = index_start; i < index_end; i++) {
            const archetype_entity = entities[i];

            const fetched = !this.#F.filter_fetch(this.#cursor.filter, archetype_entity.id(), archetype_entity.table_row)
            if (fetched) {
                continue
            }

            const elt = this.#D.fetch(this.#cursor.fetch, archetype_entity.id(), archetype_entity.table_row)
            accum = fold(accum, elt)
        }

        return accum;
    }

    /**
     * Executes the equivalent of `Iterator.fold()` over a contiguous segment
     * from an archetype which has the same entity count as its table.
     * 
     * SAFETY
     * - all `indices` must be in the range from `0` to `archetype.length`.
     * - `archetype` must match `D` and `F`.
     * - `archetype` must have the same length as its table.
     * The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_dense_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: AsQueryItem<D>) => B,
        archetype: Archetype,
        rows_start: number,
        rows_end: number
    ): B {
        if (archetype.isEmpty) {
            return accum
        }

        debug_assert(rows_end <= u32.MAX, '');

        const table = this.#tables.get(archetype.tableId)!
        debug_assert(archetype.length === table.entityCount, '')

        // @ts-expect-error
        this.#D.set_archetype(this.#cursor.__fetch, this.#query_state.__fetch_state, archetype, table);
        // @ts-expect-error
        this.#F.set_archetype(this.#cursor.__filter, this.#query_state.__filter_state, archetype, table);

        const entities = table.entities;

        for (let row = rows_start; row < rows_end; row++) {
            const entity = entities[row];
            const filter_matched = !this.#F.filter_fetch(this.#cursor.filter, entity, row);
            if (filter_matched) {
                continue
            }
            const elt = this.#D.fetch(this.#cursor.fetch, entity, row);
            accum = fold(accum, elt);
        }

        return accum
    }

    fold<B>(initial: B, fold: (acc: B, x: any) => B): B {
        let accum = initial;
        const proxy = this.#cursor.fetch.proxy;
        while (proxy.index !== proxy.length) {
            const elt = this.next();
            if (elt.done) {
                break
            }
            accum = fold(accum, elt.value);
        }

        const ids = this.#cursor.storage_id_iter.slice(this.#cursor.storage_id_index)
        for (let i = 0; i < ids.length; i++) {
            accum = this.fold_over_storage_range(accum, fold, ids[i], undefined)
        }
        return accum;
    }

    // sort<L extends ReadonlyQueryData<Ord>>(query: L) {
    //     return this.#sort_impl((keyed_query) => keyed_query.sort())
    // }

    // sort_unstable<L extends ReadonlyQueryData<Ord>>(query: L) {
    //     return this.#sort_impl((keyed_query) => keyed_query.sort_unstable());
    // }

    // sort_by<L extends ReadonlyQueryData<any>>(query: L, compare: (lhs: L['__item'], rhs: L['__item']) => -1 | 0 | 1) {
    //     return this.#sort_impl(keyed_query => {
    //         return keyed_query.sort_by(([key1], [key2]) => compare(key1, key2))
    //     })
    // }

    // sort_unstable_by<L extends ReadonlyQueryData>(query: L, compare: (lhs: L['__item'], rhs: L['__item']) => -1 | 0 | 1) {
    //     return this.#sort_impl(keyed_query => {
    //         return keyed_query.sort_unstable_by(([key1], [key2]) => compare(key1, key2))
    //     })
    // }

    // sort_by_key<L extends ReadonlyQueryData, K>(query: L, fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_by_key(([lens]) => fn(lens)))
    // }

    // sort_unstable_by_key<L extends ReadonlyQueryData, K>(fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_unstable_by_key(([lens]) => fn(lens)))
    // }

    // sort_by_cached_key<L extends ReadonlyQueryData, K>(query: L, fn: (item: L['__item']) => K) {
    //     return this.#sort_impl(keyed_query => keyed_query.sort_by_cached_key(([lens]) => fn(lens)))
    // }

    // #sort_impl<L extends ReadonlyQueryData>(query: L, fn: (items: Array<[L['__item'], NeutralOrd<Entity>]>) => void) {
    //     /**
    //      * On the first successful iterator of `QueryIterationCursor`, `archetype_entities` or `table_entities`
    //      * will be set to a non-zero value. The correctness of this method relies on this.
    //      * I.e. this sort method will execute if and only if `next` on `QueryIterationCursor` of a 
    //      * non-empty `QueryIter` has not yet been called. When empty, this sort empty will not throw an Error.
    //      */

    //     if (this.#cursor.__archetype_entities.length !== 0 || this.#cursor.__table_entities.length !== 0) {
    //         throw new Error('it is not valid to call sort() after next()')
    //     }

    //     const world = this.#world;
    //     const query_lens_state = this.#query_state.transmute_filtered([query, Entity] as any, this.#F, world);

    //     // const query_lens = query_lens_state.query_unchecked_manual(world);
    //     // const keyed_query = query_lens.map(([key, entity]) => [key, NeutralOrd(entity)]).collect()
    //     // fn(keyed_query);
    //     // const entity_iter = iter(keyed_query).map(([..._, entity]) => entity.value);

    //     // return QuerySortedIter.new(
    //     //     world,
    //     //     this.#query_state,
    //     //     entity_iter,
    //     //     world.last_change_tick(),
    //     //     world.change_tick(),
    //     // )
    // }

    iter() {
        return this;
    }

    for_each(fn: (value: AsQueryItem<D>) => void): this {
        for (const proxies of this) {
            const len = this.#cursor.current_len;
            for (let i = this.index(); i < len; i = this.index()) {
                proxies.forEach((proxy: any, i: number) => proxy.index = i);
                fn(proxies);
            }
        }

        return this;
    }

    size_hint(): [number, Option<number>] {
        const max_size = this.#cursor.max_remaining(this.#tables, this.#archetypes);
        const archetype_query = this.#F.IS_ARCHETYPAL;
        const min_size = archetype_query ? max_size : 0;
        return [min_size, max_size];
    }
}

class QueryIterationCursor<D, F> {
    readonly is_dense: boolean;
    __table_entities: Entity[];
    __archetype_entities: ArchetypeEntity[];
    __storage_id_index: number;
    __storage_id_iter: StorageId[];
    __current_len: number;
    __current_row: number;
    __fetch: AsQueryFetch<D>;
    __filter: AsQueryFetch<F>;

    #item: IteratorResult<D>;

    constructor(
        fetch: AsQueryFetch<D>,
        filter: AsQueryFetch<F>,
        storage_id_iter: StorageId[],
        is_dense: boolean,
        table_entities: Entity[] = [],
        archetype_entities: ArchetypeEntity[] = [],
        current_len = 0,
        current_row = 0,
        storage_id_index = -1,
    ) {
        this.is_dense = is_dense;
        this.__storage_id_iter = storage_id_iter;
        this.__table_entities = table_entities;
        this.__archetype_entities = archetype_entities;
        this.__fetch = fetch;
        this.__filter = filter;
        this.__current_len = current_len;
        this.__current_row = current_row;
        this.__storage_id_index = storage_id_index;
        this.#item = { done: false, value: undefined } as IteratorResult<D>;
    }

    static init<D extends any, F extends any>(world: World, state: QueryState<QueryData, QueryFilter>, last_run: Tick, this_run: Tick) {
        // @ts-expect-error
        const fetch = state.D.init_fetch(world, state.__fetch_state, last_run, this_run)
        // @ts-expect-error
        const filter = state.F.init_fetch(world, state.__filter_state, last_run, this_run)
        // @ts-expect-error
        return new QueryIterationCursor<D, F>(fetch, filter, state.__matched_storage_ids, state.is_dense);
    }

    clone() {
        return new QueryIterationCursor(
            this.__fetch,
            this.__filter,
            this.__storage_id_iter,
            this.is_dense,
            this.__table_entities,
            this.__archetype_entities,
            this.__current_len,
            this.__current_row,
            this.__storage_id_index
        )

    }

    max_remaining(tables: Tables, archetypes: Archetypes): number {
        const ids = this.__storage_id_iter;
        // const remaining_matched = this.is_dense ?

        const remaining_matched = this.is_dense ?
            // @ts-expect-error
            ids.reduce((acc, id) => acc += tables.get(id.table_id)!.entityCount, 0)
            :
            // @ts-expect-error
            ids.reduce((acc, id) => acc += archetypes.get(id.archetype_id)!.length, 0)
        return remaining_matched + this.__current_len - this.__current_row;
    }

    next(
        tables: Tables,
        archetypes: Archetypes,
        query_state: QueryState<QueryData, QueryFilter>
    ): IteratorResult<D> {
        const D = query_state.D;
        const F = query_state.F;

        if (this.is_dense) {
            while (true) {
                // we are on the beginning of the query, or finished processing a table, so skip to the next
                if (this.__current_row === this.__current_len) {
                    this.__storage_id_index++;

                    if (this.__storage_id_index >= this.__storage_id_iter.length) {
                        return done();
                    }

                    // @ts-expect-error
                    const table_id = this.__storage_id_iter[this.__storage_id_index].table_id;
                    const table = tables.get(table_id)!;
                    if (table.isEmpty) {
                        continue
                    }

                    // SAFETY: table is from the world that fetch/filter were created for.
                    //  fetch_state / filter_state are the states that fetch/filter were initialized with
                    // @ts-expect-error
                    D.set_table(this.__fetch, query_state.__fetch_state, table)
                    // @ts-expect-error
                    F.set_table(this.__filter, query_state.__filter_state, table)
                    this.__table_entities = table.entities;
                    this.__current_len = table.entityCount;
                    this.__current_row = 0;
                }

                const entity = this.__table_entities[this.__current_row];
                const row = this.__current_row;

                if (!F.filter_fetch(this.__filter, entity, row)) {
                    this.__current_row += 1;
                    continue;
                }

                const elt = D.fetch(this.__fetch, entity, row);
                this.__current_row += 1;
                const item = this.#item;
                item.value = elt;
                return item;
            }
        } else {
            while (true) {
                if (this.__current_row === this.__current_len) {
                    this.__storage_id_index++;
                    const sid = this.__storage_id_iter[this.__storage_id_index] as StorageIdArchetype;
                    if (!sid) {
                        return done()
                    }
                    const archetype_id = sid.archetype_id;
                    const archetype = archetypes.get(archetype_id)!;
                    if (archetype.isEmpty) {
                        continue
                    }
                    const table = tables.get(archetype.tableId)!;

                    D.set_archetype(
                        this.__fetch,
                        // @ts-expect-error
                        query_state.__fetch_state,
                        archetype,
                        table
                    )
                    F.set_archetype(
                        this.__filter,
                        // @ts-expect-error
                        query_state.__filter_state,
                        archetype,
                        table
                    )
                    this.__archetype_entities = archetype.entities;
                    this.__current_len = archetype.length;
                    this.__current_row = 0;
                }

                const archetype_entity = this.__archetype_entities[this.__current_row] as unknown as InternalArchetypeEntity;
                if (!F.filter_fetch(
                    this.__filter,
                    archetype_entity.id(),
                    archetype_entity.table_row
                )) {
                    this.__current_row += 1;
                    continue
                }

                const elt = D.fetch(
                    this.__fetch,
                    archetype_entity.id(),
                    archetype_entity.table_row
                )

                this.__current_row += 1;
                const item = this.#item;
                item.value = elt;
                return item;
            }
        }
    }

}

class ThinQueryIterationCursor<D extends readonly any[], F extends readonly any[]> {
    readonly is_dense: boolean;
    table_entities: Uint32Array<ArrayBuffer>;
    archetype_entities: InternalArchetypeEntity[];
    storage_id_index: number;
    storage_id_iter: StorageId[];
    current_len: number;
    current_row: number;
    fetch: AsQueryFetch<D> & { proxy: any };
    filter: AsQueryFetch<F>;

    constructor(
        fetch: AsQueryFetch<D> & { proxy: any },
        filter: AsQueryFetch<F>,
        storage_id_iter: StorageId[],
        is_dense: boolean,
        table_entities = new Uint32Array(),
        archetype_entities: InternalArchetypeEntity[] = [],
        storage_id_index = -1,
        current_len = 0,
        current_row = 0,
    ) {
        this.is_dense = is_dense;
        this.storage_id_iter = storage_id_iter;
        this.table_entities = table_entities;
        this.archetype_entities = archetype_entities;
        this.fetch = fetch;
        this.filter = filter;
        this.storage_id_index = storage_id_index;
        this.current_len = current_len;
        this.current_row = current_row;
    }

    static init<D extends readonly any[], F extends readonly any[]>(world: ThinWorld, state: ThinQueryState<ThinQueryData, ThinQueryFilter>, last_run: Tick, this_run: Tick) {
        // @ts-expect-error
        const fetch = state.D.init_fetch(world, state.__fetch_state, last_run, this_run);
        // @ts-expect-error
        const filter = state.F.init_fetch(world, state.__filter_state, last_run, this_run);
        // @ts-expect-error
        return new ThinQueryIterationCursor<D, F>(fetch, filter, state.__matched_storage_ids, state.is_dense);
    }

    clone() {
        return new ThinQueryIterationCursor(
            this.fetch,
            this.filter,
            this.storage_id_iter,
            this.is_dense,
            this.table_entities,
            this.archetype_entities,
            this.storage_id_index,
            this.current_len,
            this.current_row
        )

    }

    max_remaining(tables: ThinTables, archetypes: Archetypes): number {
        const ids = this.storage_id_iter,
            proxy = this.fetch.proxy;
        const remaining_matched = this.is_dense ?
            // @ts-expect-error
            ids.map(id => tables.get(id.table_id)!.entityCount).sum() :
            // @ts-expect-error
            ids.map(id => archetypes.get(id.archetype_id)?.length).sum()
        return remaining_matched + proxy.length - proxy.index;
    }

    next(
        tables: ThinTables,
        archetypes: Archetypes,
        state: ThinQueryState<ThinQueryData, ThinQueryFilter>,
    ): IteratorResult<AsQueryItem<D>> {
        if (this.is_dense) {
            // return this.index(tables, state, proxy) as any;
            return this.next_table(tables, state) as IteratorResult<AsQueryItem<D>>;
            // while (true) {
            // we are on the beginning of the query, or finished processing a table, so skip to the next
            // if (proxy.index === proxy.length) {
            // this.storage_id_index++;
            // const storage_index = this.storage_id_index;
            // const storage_ids = this.storage_id_iter;
            // if (this.storage_id_index >= storage_ids.length) {
            //     return done();
            // }



            // // @ts-expect-error
            // const table_id = storage_ids[storage_index].table_id;
            // const table = tables.get(table_id)!;
            // if (table.isEmpty) {
            //     continue
            // }

            // // SAFETY: table is from the world that fetch/filter were created for.
            // //  fetch_state / filter_state are the states that fetch/filter were initialized with
            // // @ts-expect-error
            // D.set_table(this.fetch, query_state.__fetch_state, table, proxy);
            // // @ts-expect-error
            // F.set_table(this.filter, query_state.__filter_state, table, proxy);

            // this.table_entities = table.entities;
            // proxy.length = table.entityCount;
            // proxy.index = 0;

            // return item(proxy) as any;
            // }

            // const entity = this.table_entities[proxy.index];
            // const row = proxy.index;

            // if (!F.filter_fetch(this.filter, entity, row)) {
            //     proxy.index += 1;
            //     continue;
            // }

            // proxy.index += 1;
            // const elt = D.fetch(this.fetch, entity, row);
            // return item(elt);
            // }
        } else {
            return this.next_archetype(tables, archetypes, state);
            // while (true) {
            //     if (proxy.index === proxy.length) {
            //         this.storage_id_index++;
            //         const sid = this.storage_id_iter[this.storage_id_index] as StorageIdArchetype;
            //         if (!sid) {
            //             return done()
            //         }
            //         const archetype_id = sid.archetype_id;
            //         const archetype = archetypes.get(archetype_id)!;
            //         if (archetype.isEmpty) {
            //             continue
            //         }
            //         const table = tables.get(archetype.tableId)!;

            //         // @ts-expect-error 
            //         D.set_archetype(this.fetch, query_state.__fetch_state, archetype, table, proxy);
            //         // @ts-expect-error
            //         F.set_archetype(this.filter, query_state.__filter_state, archetype, table, proxy);
            //         this.archetype_entities = archetype.entities as unknown as InternalArchetypeEntity[];
            //         proxy.length = archetype.length;
            //         proxy.index = 0;

            //     }

            //     const archetype_entity = this.archetype_entities[proxy.index];
            //     if (!F.filter_fetch(
            //         this.filter,
            //         archetype_entity.id(),
            //         archetype_entity.table_row
            //     )) {
            //         proxy.index += 1;
            //         continue
            //     }

            //     const elt = D.fetch(
            //         this.fetch,
            //         archetype_entity.id(),
            //         archetype_entity.table_row
            //     )

            //     proxy.index += 1;
            //     return item(elt)
            // }
        }
    }

    next_table(tables: ThinTables, state: ThinQueryState<ThinQueryData, ThinQueryFilter>): IteratorResult<ComponentProxy> {
        const { D, F } = state;
        const storage_ids = this.storage_id_iter;

        while (true) {
            this.storage_id_index++;
            if (this.storage_id_index >= storage_ids.length) {
                return done();
            }

            // @ts-expect-error
            const table_id = storage_ids[this.storage_id_index].table_id;
            const table = tables.get(table_id)!;
            if (table.isEmpty) {
                continue
            }

            // SAFETY: table is from the world that fetch/filter were created for.
            //  fetch_state / filter_state are the states that fetch/filter were initialized with
            // @ts-expect-error
            D.set_table(this.fetch, state.__fetch_state, table);
            // @ts-expect-error
            F.set_table(this.filter, state.__filter_state, table);

            this.table_entities = table.entities;
            this.current_len = table.entityCount;
            this.current_row = 0;


            const elt = D.fetch(this.fetch, table.entities[0], 0);
            for (let i = 0; i < elt.length; i++) {
                elt[i].length = table.entityCount;
                elt[i].index = 0;
            }

            return item(elt);
        }
    }

    next_archetype(tables: ThinTables, archetypes: Archetypes, state: ThinQueryState<ThinQueryData, ThinQueryFilter>) {

        const { D, F } = state;
        const storage_ids = this.storage_id_iter;

        while (true) {
            this.storage_id_index++;
            if (this.storage_id_index >= storage_ids.length) {
                return done();
            }

            // @ts-expect-error
            const archetype_id = storage_ids[this.storage_id_index].archetype_id;
            const archetype = archetypes.get(archetype_id)!;
            if (archetype.isEmpty) {
                continue
            }
            const table = tables.get(archetype.tableId)!;

            // @ts-expect-error 
            D.set_archetype(this.fetch, query_state.__fetch_state, archetype, table);
            // @ts-expect-error
            F.set_archetype(this.filter, query_state.__filter_state, archetype, table);
            this.archetype_entities = archetype.entities as unknown as InternalArchetypeEntity[];
            const proxy = this.fetch.proxy;
            proxy.length = archetype.length;
            proxy.index = 0;

            return item(proxy);
        }

    }

    next_index(state: ThinQueryState<ThinQueryData, ThinQueryFilter>) {
        if (this.is_dense) {

            if (this.current_row === this.current_len) {
                return this.current_len;
            }

            while (!state.F.filter_fetch(this.filter, this.table_entities[this.current_row], this.current_row) && this.current_row < this.current_len) {
                this.current_row++;
            }

            for (let i = this.current_row; this.current_row < this.current_len; i++) {
                if (!state.F.filter_fetch(this.filter, this.table_entities[i], i)) {
                    this.current_row++;
                    continue;
                }
                this.current_row++;

                return i;
            }
        }

        return this.current_len;
    }
}

// @ts-expect-error
export class QueryCombinationIter<D extends readonly any[], F extends readonly any[], K extends number> extends Iterator<AsQueryItem<D>> {
    static new<D extends readonly any[], F extends readonly any[], K extends number>(
        _world: World,
        _state: QueryState<QueryData, QueryFilter>,
        _last_run: Tick,
        _this_run: Tick,
        _size: K
    ): QueryCombinationIter<D, F, K> {

        return new QueryCombinationIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<AsQueryItem<D>> {
        return done();
    }
}

// @ts-expect-error
export class QueryManyIter<D extends readonly any[], F extends readonly any[]> extends Iterator<AsQueryItem<D>> {
    static new<D extends readonly any[], F extends readonly any[]>(
        _world: World,
        _state: QueryState<QueryData, QueryFilter>,
        _entities: Iterable<Entity>,
        _last_run: Tick,
        _this_run: Tick,
    ): QueryManyIter<D, F> {

        return new QueryManyIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<AsQueryItem<D>> {
        return done();
    }
}

// @ts-expect-error
export class QueryManyUniqueIter<D extends readonly any[], F extends readonly any[]> extends Iterator<AsQueryItem<D>> {

    static new<D extends readonly any[], F extends readonly any[]>(
        _world: World,
        _state: QueryState<QueryData, QueryFilter>,
        _entities: Set<Entity>,
        _last_run: Tick,
        _this_run: Tick,
    ): QueryManyUniqueIter<D, F> {

        return new QueryManyUniqueIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<AsQueryItem<D>> {
        return done();
    }
}