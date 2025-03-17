import { Iterator, done, item } from "joshkaposh-iterator";
import { Archetype, ArchetypeEntity, Archetypes, Entity, QueryData, QueryFilter, QueryState, RemapToInstance, StorageId, StorageIdArchetype, StorageIdTable, Tick, World } from "ecs";
import { Table, Tables } from "../storage/table";
import { type Option, u32 } from "joshkaposh-option";
import { TODO } from "joshkaposh-iterator/src/util";
import { debug_assert } from "../util";

export class QueryIter<D extends readonly any[], F extends readonly any[]> extends Iterator<RemapToInstance<D>> {
    #world: World;
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
        this.#world = world;
        tables ??= world.storages().tables;
        archetypes ??= world.archetypes();
        cursor ??= QueryIterationCursor.init<D, F>(world, state, last_run, this_run);

        this.#tables = tables;
        this.#archetypes = archetypes;
        this.#cursor = cursor;
        this.#query_state = state;
        this.#D = state.D as any;
        this.#F = state.F as any;
    }

    next(): IteratorResult<any, any> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state)
    }

    into_iter(): Iterator<any> {
        return this;
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
     * `from` and `to` must be in the range of `0` to `storage.entity_count()`, or left empty.
     */
    fold_over_storage_range<B>(
        accum: B,
        fold: (acc: B, x: QueryData['__item']) => B,
        storage: StorageId,
        from?: number,
        to?: number
    ) {
        if (this.#cursor.is_dense) {
            const table_id = (storage as StorageIdTable).table_id;
            const table = this.#tables.get(table_id)!;
            from ??= 0;
            to ??= table.entity_count();
            accum = this.fold_over_table_range(accum, fold, table, from, to);
        } else {
            const archetype_id = (storage as StorageIdArchetype).archetype_id;
            const archetype = this.#archetypes.get(archetype_id)!;
            const table = this.#tables.get(archetype.table_id())!;
            from ??= 0;
            to ??= archetype.len();

            if (table.entity_count() === archetype.len()) {
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
     * - all `rows` must be in the range of `0` to `table.entity_count()`
     * - `table` must match `D` and `F`.
     * - The query iteration must be dense (i.e. `this.query_state.is_dense` must be true).
     */
    fold_over_table_range<B>(
        accum: B,
        fold: (acc: B, x: QueryData['__item']) => B,
        table: Table,
        row_start: number,
        row_end: number
    ): B {
        if (table.is_empty()) {
            return accum;
        }

        debug_assert(row_end <= u32.MAX);
        // @ts-expect-error
        this.#D.set_table(this.#cursor.__fetch, this.#query_state.__fetch_state, table);
        // @ts-expect-error
        this.#F.set_table(this.#cursor.__filter, this.#query_state.__filter_state, table);
        const entities = table.entities();
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
     * - all `indices` from `index_start` to `index_end` must be in the range from `0` to `archetype.len()`.
     * - `archetype` must match `D` and `F`
     * - The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: QueryData['__item']) => B,
        archetype: Archetype,
        index_start: number,
        index_end: number,
    ): B {

        if (archetype.is_empty()) {
            return accum
        }

        const table = this.#tables.get(archetype.table_id())!;
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

        const entities = archetype.entities();
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
     * - all `indices` must be in the range from `0` to `archetype.len()`.
     * - `archetype` must match `D` and `F`.
     * - `archetype` must have the same length as its table.
     * The query iteration must not be dense (i.e. `this.query_state.is_dense` must be false).
     */
    fold_over_dense_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: QueryData['__item']) => B,
        archetype: Archetype,
        rows_start: number,
        rows_end: number
    ): B {
        if (archetype.is_empty()) {
            return accum
        }

        debug_assert(rows_end <= u32.MAX);

        const table = this.#tables.get(archetype.table_id())!
        debug_assert(archetype.len() === table.entity_count())

        // @ts-expect-error
        this.#D.set_archetype(this.#cursor.__fetch, this.#query_state.__fetch_state, archetype, table);
        // @ts-expect-error
        this.#F.set_archetype(this.#cursor.__filter, this.#query_state.__filter_state, archetype, table);

        const entities = table.entities();

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

}

class QueryIterationCursor<D extends readonly any[], F extends readonly any[]> {
    readonly is_dense: boolean;
    __table_entities: Entity[];
    __archetype_entities: ArchetypeEntity[];
    __storage_id_index: number;
    __storage_id_iter: StorageId[];
    __current_len: number;
    __current_row: number;
    __fetch: QueryData['__fetch'];
    __filter: QueryFilter['__fetch'];

    constructor(
        fetch: any,
        filter: any,
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
    }

    static init<D extends readonly any[], F extends readonly any[]>(world: World, state: QueryState<QueryData, QueryFilter>, last_run: Tick, this_run: Tick) {
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
        const remaining_matched = this.is_dense ?
            // @ts-expect-error
            ids.map(id => tables.get(id.table_id)!.entity_count()).sum() :
            // @ts-expect-error
            ids.map(id => archetypes.get(id.archetype_id)?.len()).sum()
        return remaining_matched + this.__current_len - this.__current_row;;
    }

    next(
        tables: Tables,
        archetypes: Archetypes,
        query_state: QueryState<QueryData, QueryFilter>
    ): IteratorResult<RemapToInstance<D>> {
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
                    if (table.is_empty()) {
                        continue
                    }

                    // SAFETY: table is from the world that fetch/filter were created for.
                    //  fetch_state / filter_state are the states that fetch/filter were initialized with
                    // @ts-expect-error
                    D.set_table(this.__fetch, query_state.__fetch_state, table)
                    // @ts-expect-error
                    F.set_table(this.__filter, query_state.__filter_state, table)
                    this.__table_entities = table.entities();
                    this.__current_len = table.entity_count();
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
                return item(elt);
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
                    if (archetype.is_empty()) {
                        continue
                    }
                    const table = tables.get(archetype.table_id())!;

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
                    this.__archetype_entities = archetype.entities();
                    this.__current_len = archetype.len();
                    this.__current_row = 0;
                }

                const archetype_entity = this.__archetype_entities[this.__current_row];
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
                return item(elt)
            }
        }
    }

}

export class QueryCombinationIter<D extends readonly any[], F extends readonly any[], K extends number> extends Iterator<RemapToInstance<D>> {
    static new<D extends readonly any[], F extends readonly any[], K extends number>(world: World, state: QueryState<QueryData, QueryFilter>, last_run: Tick, this_run: Tick, size: K): QueryCombinationIter<D, F, K> {

        return new QueryCombinationIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<RemapToInstance<D>> {
        return done();
    }
}

export class QueryManyIter<D extends readonly any[], F extends readonly any[]> extends Iterator<RemapToInstance<D>> {
    static new<D extends readonly any[], F extends readonly any[]>(
        world: World,
        state: QueryState<QueryData, QueryFilter>,
        entities: Iterable<Entity>,
        last_run: Tick,
        this_run: Tick,
    ): QueryManyIter<D, F> {

        return new QueryManyIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<RemapToInstance<D>> {
        return done();
    }
}

export class QueryManyUniqueIter<D extends readonly any[], F extends readonly any[]> extends Iterator<RemapToInstance<D>> {
    static new<D extends readonly any[], F extends readonly any[]>(
        world: World,
        state: QueryState<QueryData, QueryFilter>,
        entities: Set<Entity>,
        last_run: Tick,
        this_run: Tick,
    ): QueryManyUniqueIter<D, F> {

        return new QueryManyUniqueIter();
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<RemapToInstance<D>> {
        return done();
    }
}