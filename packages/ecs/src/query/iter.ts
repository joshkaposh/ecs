import { Iterator, done, iter, item, Range } from "joshkaposh-iterator";
import { Archetype, ArchetypeEntity, Archetypes, Entity, QueryData, QueryFilter, QueryState, StorageId, StorageIdArchetype, StorageIdTable, Tick, World } from "../../../../src";
import { Table, Tables } from "../storage/table";
import { Option } from "joshkaposh-option";
import { assert } from "joshkaposh-iterator/src/util";
import { u32 } from "intrinsics";

export class QueryIter<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>> extends Iterator<any> {
    #world: World;
    #tables: Tables;
    #archetypes: Archetypes;
    #query_state: QueryState<any, any>;
    #cursor: QueryIterationCursor<D, F>;
    #D: D;
    #F: F;

    private constructor(world: World, state: QueryState<D, F>, tables: Tables, archetypes: Archetypes, cursor: QueryIterationCursor<D, F>) {
        super()
        this.#world = world;
        this.#tables = tables;
        this.#archetypes = archetypes;
        this.#cursor = cursor;
        this.#query_state = state;
        this.#D = state.D;
        this.#F = state.F
    }

    static new<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>>(
        world: World,
        state: QueryState<D, F>,
        last_run: Tick,
        this_run: Tick
    ): QueryIter<D, F> {
        return new QueryIter(
            world,
            state,
            world.storages().tables,
            world.archetypes(),
            QueryIterationCursor.init(world, state, last_run, this_run)
        );
    }

    next(): IteratorResult<any, any> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state)
    }

    into_iter(): Iterator<any> {
        return this;
    }

    remaining(): QueryIter<D, F> {
        return new QueryIter<D, F>(
            this.#world,
            this.#query_state,
            this.#tables,
            this.#archetypes,
            this.#cursor.clone()

        )
    }

    __fold_over_storage_range<B>(
        accum: B,
        fold: (acc: B, x: D['__item']) => B,
        storage: StorageId,
        range: Option<Range>
    ) {
        if (this.#cursor.is_dense) {
            const table_id = (storage as StorageIdTable).table_id;
            const table = this.#tables.get(table_id)!;
            range = range ?? new Range(0, table.entity_count())
            accum = this.__fold_over_table_range(accum, fold, table, range);
        } else {
            const archetype_id = (storage as StorageIdArchetype).archetype_id;
            const archetype = this.#archetypes.get(archetype_id)!;
            const table = this.#tables.get(archetype.table_id())!;
            range = range ?? new Range(0, archetype.len())

            if (table.entity_count() === archetype.len()) {
                accum = this.__fold_over_dense_archetype_range(accum, fold, archetype, range)
            } else {
                accum = this.__fold_over_archetype_range(accum, fold, archetype, range);

            }
        }
        return accum;
    }

    __fold_over_table_range<B>(
        accum: B,
        fold: (acc: B, x: D['__item']) => B,
        table: Table,
        rows: Range
    ): B {
        if (table.is_empty()) {
            return accum;
        }

        assert(rows.end <= u32.MAX);
        // @ts-expect-error
        this.#D.set_table(this.#cursor.__fetch, this.#query_state.__fetch_state, table);
        // @ts-expect-error
        this.#F.set_table(this.#cursor.__filter, this.#query_state.__filter_state, table);
        const entities = table.entities();
        for (const row of rows) {
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


    __fold_over_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: D['__item']) => B,
        archetype: Archetype,
        indices: Range
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
        for (let i = indices.start; i < indices.end; i++) {
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

    __fold_over_dense_archetype_range<B>(
        accum: B,
        fold: (acc: B, x: D['__item']) => B,
        archetype: Archetype,
        rows: Range
    ): B {
        if (archetype.is_empty()) {
            return accum
        }

        assert(rows.end <= u32.MAX);

        const table = this.#tables.get(archetype.table_id())!
        assert(archetype.len() === table.entity_count())

        // @ts-expect-error
        this.#D.set_archetype(this.#cursor.__fetch, this.#query_state.__fetch_state, archetype, table);
        // @ts-expect-error
        this.#F.set_archetype(this.#cursor.__filter, this.#query_state.__filter_state, archetype, table);

        const entities = table.entities();

        for (let row = rows.start; row < rows.end; row++) {
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

        for (const id of this.#cursor.__storage_id_iter.clone()) {
            accum = this.__fold_over_storage_range(accum, fold, id, undefined)
        }

        return accum;
    }

    size_hint(): [number, Option<number>] {
        const max_size = this.#cursor.max_remaining(this.#tables, this.#archetypes);
        const archetype_query = this.#F.IS_ARCHETYPAL;
        const min_size = archetype_query ? max_size : 0;
        return [min_size, max_size]
    }

}

class QueryIterationCursor<D extends QueryData, F extends QueryFilter> {

    readonly is_dense: boolean;
    #table_entities: Entity[];
    #archetype_entites: ArchetypeEntity[];
    __storage_id_iter: Iterator<StorageId>;
    __current_len: number;
    __current_row: number;
    __fetch: D['__fetch'];
    __filter: F['__fetch'];

    constructor(
        fetch: D['__fetch'],
        filter: F['__fetch'],
        table_entities: Entity[],
        archetype_entites: ArchetypeEntity[],
        storage_id_iter: Iterator<StorageId>,
        is_dense: boolean,
        current_len: number,
        current_row: number,
    ) {
        this.is_dense = is_dense;
        this.__storage_id_iter = iter(storage_id_iter);
        this.#table_entities = table_entities;
        this.#archetype_entites = archetype_entites;
        this.__fetch = fetch;
        this.__filter = filter;
        this.__current_len = current_len;
        this.__current_row = current_row;
    }

    clone() {
        return new QueryIterationCursor(
            this.__fetch,
            this.__filter,
            this.#table_entities,
            this.#archetype_entites,
            this.__storage_id_iter,
            this.is_dense,
            this.__current_len,
            this.__current_row,
        )

    }

    static init_empty(world: World, query_state: QueryState<any, any>) {
        // return new QueryCursor(

        // )

    }

    static init<D extends QueryData, F extends QueryFilter>(world: World, query_state: QueryState<D, F>, last_run: Tick, this_run: Tick) {
        // @ts-expect-error
        const fetch = query_state.D.init_fetch(world, query_state.__fetch_state, last_run, this_run);
        // @ts-expect-error
        const filter = query_state.F.init_fetch(world, query_state.__filter_state, last_run, this_run);
        const cursor = new QueryIterationCursor(
            fetch as D['__fetch'],
            filter as F['__fetch'],
            [],
            [],
            // @ts-expect-error
            iter(query_state.__matched_storage_ids),
            query_state.is_dense,
            0,
            0
        );
        return cursor
    }

    max_remaining(tables: Tables, archetypes: Archetypes): number {

        const ids = this.__storage_id_iter.clone();
        const remaining_matched = this.is_dense ?
            // @ts-expect-error
            ids.map(id => tables.get(id.table_id)!.entity_count()).sum() :
            // @ts-expect-error
            ids.map(id => archetypes.get(id.archetype_id)?.len()).sum()
        return remaining_matched + this.__current_len - this.__current_row;;
    }

    next(tables: Tables, archetypes: Archetypes, query_state: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>) {
        const D = query_state.D;
        const F = query_state.F;

        if (this.is_dense) {
            while (true) {
                // we are on the beginning of the query, or finished processing a table, so skip to the next
                if (this.__current_row === this.__current_len) {
                    const sid = this.__storage_id_iter.next()
                    if (sid.done) {
                        return done()
                    }

                    // @ts-expect-error
                    const table_id = sid.value.table_id ?? sid.value.archetype_id;
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
                    this.#table_entities = table.entities();
                    this.__current_len = table.entity_count();
                    this.__current_row = 0;
                }

                const entity = this.#table_entities[this.__current_row];
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
                    const sid = this.__storage_id_iter.next() as IteratorResult<StorageIdArchetype>;
                    if (sid.done) {
                        return done()
                    }
                    const archetype_id = sid.value.archetype_id;
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
                    this.#archetype_entites = archetype.entities();
                    this.__current_len = archetype.len();
                    this.__current_row = 0;
                }

                const archetype_entity = this.#archetype_entites[this.__current_row];
                if (!F.filter_fetch(this.__filter,
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