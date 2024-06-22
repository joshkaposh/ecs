import { ErrorExt, Iterator, Option, Range, done, is_error, is_some, iter, iter_item, range } from "joshkaposh-iterator";
import { EntityList, QueryData, QueryFilter, QueryState } from ".";
import { Archetype, ArchetypeEntity, Archetypes } from "../archetype";
import { Table, Tables } from "../storage/table";
import { World } from "../world";
import { assert } from "joshkaposh-iterator/src/util";
import { u32 } from "../../Intrinsics";
import { Entities, Entity } from "../entity";

export class QueryIter<D extends QueryData<any>, F extends QueryFilter<any>> extends Iterator<any> {
    #tables: Tables;
    #archetypes: Archetypes;
    #query_state: QueryState<D, F>;
    #cursor: QueryIterationCursor<D, F>;

    constructor(world: World, query_state: QueryState<D, F>) {
        super()
        this.#query_state = query_state;
        this.#tables = world.storages().tables;
        this.#archetypes = world.archetypes();
        this.#cursor = QueryIterationCursor.init(world, query_state);
    }

    into_iter(): Iterator<any> {
        return this;
    }

    next(): IteratorResult<any, any> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state);
    }

    size_hint(): [number, number] {
        const max_size = this.#cursor.__max_remaining(this.#tables, this.#archetypes);
        const archetype_query = this.#query_state.__filter_type.IS_ARCHETYPAL;
        const min_size = archetype_query ? max_size : 0;
        return [min_size, max_size];
    }

    fold<B>(initial: B, fn: (acc: B, x: any) => B): B {
        let accum = initial;

        while (this.#cursor.current_row !== this.#cursor.current_len) {
            const n = this.next();
            if (n.done) {
                break;
            }
            accum = fn(accum, n.value)
        }

        if (this.#query_state.__data_type.IS_DENSE && this.#query_state.__filter_type.IS_DENSE) {
            for (const table_id of this.#cursor.table_id_iter.clone()) {
                const table = this.#tables.get(table_id)!;
                accum = this.__fold_over_table_range(accum, fn, table, range(0, table.entity_count()))
            }
        } else {
            for (const archetype_id of this.#cursor.archetype_id_iter.clone()) {
                const archetype = this.#archetypes.get(archetype_id)!;

                accum = this.__fold_over_archetype_range(accum, fn, archetype, range(0, archetype.len()))
            }
        }
        return accum;
    }

    __for_each_in_table_range(
        func: (component: any) => any,
        table: Table,
        rows: Range
    ) {
        return this.__fold_over_table_range(undefined, (_, item) => func(item), table, rows)
    }

    __for_each_in_archetype_range(
        func: (component: any) => any,
        archetype: Archetype,
        rows: Range
    ) {
        this.__fold_over_archetype_range(undefined, (_, item) => func(item), archetype, rows)
    }

    __fold_over_table_range<B>(acc: B, func: (acc: B, x: any) => B, table: Table, rows: Range) {
        assert(rows.end <= u32.MAX);
        const D = this.#query_state.__data_type;
        const F = this.#query_state.__filter_type
        D.set_table(this.#cursor.__fetch, this.#query_state.__fetch_state, table);
        F.set_table(this.#cursor.__filter, this.#query_state.__filter_state, table);
        // D::set_table(&mut self.cursor.fetch, &self.query_state.fetch_state, table);
        // F::set_table(&mut self.cursor.filter, &self.query_state.filter_state, table);
        const entities = table.entities();
        for (const row of rows) {
            // ! Safety: Caller assures `row` in range of the current archetype.
            const entity = entities[row];
            if (!F.filter_fetch(this.#cursor.__filter, entity, row)) {
                continue
            }
            const item = D.fetch(this.#cursor.__fetch, entity, row);
            acc = func(acc, item)
        }
        return acc;
    }

    __fold_over_archetype_range<B>(acc: B, func: (acc: B, x: any) => B, archetype: Archetype, indices: Range): B {
        const table = this.#tables.get(archetype.table_id());
        // D::set_archetype(
        //     &mut self.cursor.fetch,
        //     &self.query_state.fetch_state,
        //     archetype,
        //     table,
        // );
        // F::set_archetype(
        //     &mut self.cursor.filter,
        //     &self.query_state.filter_state,
        //     archetype,
        //     table,
        // );
        const entities = archetype.entities();
        for (const index of indices) {
            const archetype_entity = entities[index];

            // SAFETY: set_archetype was called prior.
            // Caller assures `index` in range of the current archetype.
            // if !F::filter_fetch(
            //     &mut self.cursor.filter,
            //     archetype_entity.id(),
            //     archetype_entity.table_row(),
            // ) {
            //     continue;
            // }

            // SAFETY: set_archetype was called prior, `index` is an archetype index in range of the current archetype
            // Caller assures `index` in range of the current archetype.
            // let item = D::fetch(
            //     &mut self.cursor.fetch,
            //     archetype_entity.id(),
            //     archetype_entity.table_row(),
            // );
            let item;
            acc = func(acc, item);
        }

        return acc;
    }
}

// Iterator<D::Item>;
export class QueryManyIter<D extends QueryData<any>, F extends QueryFilter<any>> extends Iterator<any> {
    #entity_iter: Iterator<Entity>;
    #entities: Entities;
    #tables: Tables;
    #archetypes: Archetypes;
    #fetch: any // D::Fetch
    #filter: any // F::Fetch
    #query_state: QueryState<D, F>;

    constructor(world: World, query_state: QueryState<D, F>, entity_list: EntityList) {
        super();
        const fetch = query_state.__data_type.init_fetch(world, query_state.__fetch_state)
        const filter = query_state.__filter_type.init_fetch(world, query_state.__filter_state);

        this.#query_state = query_state;
        this.#entities = world.entities();
        this.#archetypes = world.archetypes();
        this.#tables = world.storages().tables;
        this.#fetch = fetch;
        this.#fetch = filter;
        this.#entity_iter = entity_list.into_iter();
    }

    __fetch_next_aliased_unchecked() {
        const d = this.#query_state.__data_type;
        const f = this.#query_state.__filter_type;

        for (const entity of this.#entity_iter) {
            const location = this.#entities.get(entity);
            if (!location) {
                continue
            }

            if (!this.#query_state
                .matched_archetypes()
                .contains(location.archetype_id)
            ) {
                continue
            }

            const archetype = this.#archetypes.get(location.archetype_id)!;
            const table = this.#tables.get(location.table_id)!;

            d.set_archetype(this.#fetch, this.#query_state.__fetch_state, archetype, table);
            f.set_archetype(this.#filter, this.#query_state.__filter_state, archetype, table);

            if (f.filter_fetch(this.#filter, entity, location.table_row)) {
                return d.fetch(this.#fetch, entity, location.table_row)
            }
        }
        return null;
    }

    fetch_next() {
        const item = this.__fetch_next_aliased_unchecked();
        return is_some(item) ? iter_item(item) : done();
    }

    into_iter(): Iterator<any> {
        return this;
    }

    next(): IteratorResult<any> {
        return this.fetch_next();
    }

    size_hint(): [number, Option<number>] {
        const [_, max_size] = this.#entity_iter.size_hint();
        return [0, max_size];
    }
}

// Iterator<[D::Item; K]>
export class QueryCombinationIter<D extends QueryData<any>, F extends QueryFilter<any>, K extends number> extends Iterator<any[]> {
    #tables: Tables;
    #archetypes: Archetypes;
    #query_state: QueryState<D, F>;
    #cursors: QueryIterationCursor<D, F>[] // K
    #K: K;

    constructor(world: World, query_state: QueryState<D, F>, K: K) {
        super();
        const array: QueryIterationCursor<D, F>[] = [];

        if (K !== 0) {
            array.push(QueryIterationCursor.init(world, query_state));
        }

        for (const _ of range(1, K)) {
            array.push(QueryIterationCursor.init_empty(world, query_state))
        }

        this.#query_state = query_state;
        this.#tables = world.storages().tables;
        this.#archetypes = world.archetypes();
        this.#cursors = array;
        this.#K = K;
    }

    // Option<[D::Item; K]>
    __fetch_next_aliased_unchecked(): IteratorResult<any[]> {
        if (this.#K) {
            return done();
        }

        for (const i of range(0, this.#K).rev()) {
            const n = this.#cursors[i].next(this.#tables, this.#archetypes, this.#query_state)
            if (!n.done) {
                for (const j of range(i + 1, this.#K)) {
                    this.#cursors[j] = this.#cursors[j - 1].clone();
                    const n2 = this.#cursors[j].next(this.#tables, this.#archetypes, this.#query_state);
                    if (n2.done) {
                        if (i > 0) {
                            continue
                        }
                        return done();
                    }
                }
                break;
            } else if (i > 0) {
                continue
            }
            return done();
        }

        const values = [];

        for (let i = 0; i < this.#cursors.length; i++) {
            const cursor = this.#cursors[i];
            values.push(cursor.__peek_last());
        }

        return iter_item(values);
    }

    fetch_next() {
        return this.__fetch_next_aliased_unchecked();
    }

    into_iter(): Iterator<any[]> {
        return this;
    }

    next(): IteratorResult<any[], any> {
        return this.__fetch_next_aliased_unchecked();
    }

    size_hint(): [number, Option<number>] {
        function choose(n: number, k: number) {
            if (k > n || n === 0) {
                return 0;
            }

            k = Math.min(k, n - k);
            const ks = range(1, k + 1);
            const ns = range(n - k + 1, n + 1).rev();
            return ks.zip(ns).try_fold(1 as number, (acc, [k, n]) => {
                const m = u32.checked_mul(acc, n);
                if (!is_some(m)) {
                    return new ErrorExt(`Break`, 'Overflowed') as any;
                }
                return m / k;
            })

        }

        const max_combinations = iter(this.#cursors)
            .enumerate()
            .try_fold(0 as number, (acc, [i, cursor]) => {
                const n = cursor.__max_remaining(this.#tables, this.#archetypes);
                // return is_error(res) ? null : res;
                const res = choose(n, this.#K - i);
                if (is_error(res)) {
                    return new ErrorExt('Break', 'Overflowed') as any;
                }
                return acc + res;
            })
        const archetype_query = this.#query_state.__filter_type.IS_ARCHETYPAL;
        const known_max = !is_error(max_combinations) ?
            max_combinations :
            u32.MAX;

        const min_combinations = archetype_query ? known_max : 0;
        // TODO: maybe causes error or unexpected results: make sure try_fold return None on error
        return [min_combinations, max_combinations as number];
    }
}

class QueryIterationCursor<D extends QueryData<any>, F extends QueryFilter<any>> {
    #table_id_iter!: any;
    #archetype_id_iter!: any;
    #table_entities!: Entity[];
    #archetype_entities!: ArchetypeEntity[];
    __fetch!: any // D::Fetch
    __filter!: any // F:: Fetch
    // length of the table or length of the archetype, depending on whether both `D`s and `F`s fetches are dense
    #current_len!: number;
    // either table row or archetype index, depending on whether both `D`s and `F`s fetches are dense
    #current_row!: number;

    #qd!: D;
    #qf!: F;

    readonly IS_DENSE!: boolean;

    private constructor() { }

    static #new<D extends QueryData<any>, F extends QueryFilter<any>>(world: World, query_state: QueryState<D, F>): QueryIterationCursor<D, F> {
        const query_data = query_state.__data_type;
        const query_filter = query_state.__filter_type;

        const cursor = new QueryIterationCursor<D, F>();
        // @ts-expect-error
        cursor.IS_DENSE = query_data.IS_DENSE && query_filter.IS_DENSE;

        const fetch = query_data.init_fetch(world, query_state.__fetch_state);
        const filter = query_filter.init_fetch(world, query_state.__filter_state);
        cursor.#qd = query_data;
        cursor.#qf = query_filter;
        cursor.__fetch = fetch;
        cursor.__filter = filter;
        cursor.#table_entities = [];
        cursor.#archetype_entities = [];
        cursor.#table_id_iter = iter(query_state.__matched_archetype_ids);
        cursor.#archetype_id_iter = iter(query_state.__matched_archetype_ids);
        cursor.#current_len = 0;
        cursor.#current_row = 0;

        return cursor
    }

    clone(): QueryIterationCursor<D, F> {
        const cursor = new QueryIterationCursor<D, F>();

        cursor.#archetype_entities = structuredClone(this.#archetype_entities);
        cursor.#archetype_id_iter = this.#archetype_id_iter.clone();
        cursor.__fetch = this.__fetch//TODO .clone();
        cursor.__filter = this.__filter//TODO .clone();
        cursor.#qd = this.#qd;
        cursor.#qf = this.#qf;
        // @ts-expect-error;
        cursor.IS_DENSE = this.IS_DENSE;
        cursor.#current_len = this.#current_len;
        cursor.#current_row = this.#current_row;

        return cursor;
    }

    get table_id_iter() {
        return this.#table_id_iter;
    }

    get archetype_id_iter() {
        return this.#archetype_id_iter;
    }

    get current_row() {
        return this.#current_row
    }

    get current_len() {
        return this.#current_len
    }

    static init_empty<D extends QueryData<any>, F extends QueryFilter<any>>(world: World, query_state: QueryState<D, F>): QueryIterationCursor<D, F> {
        const cursor = QueryIterationCursor.init(world, query_state);
        cursor.#table_id_iter = iter([]);
        cursor.#archetype_id_iter = iter([]);
        return cursor;
    }

    static init<D extends QueryData<any>, F extends QueryFilter<any>>(world: World, query_state: QueryState<D, F>): QueryIterationCursor<D, F> {

        return QueryIterationCursor.#new(world, query_state);
    }

    // : Option<D::Fetch>
    __peek_last(): Option<ReturnType<D['fetch']>> {
        if (this.#current_row > 0) {
            const index = this.#current_row - 1;
            if (this.IS_DENSE) {
                const entity = this.#table_entities[index];
                return this.#qd.fetch(this.__fetch, entity, index);
            } else {
                const archetype_entity = this.#archetype_entities[index];
                return this.#qd.fetch(this.__fetch, archetype_entity.id(), archetype_entity.table_row);
            }
        }

        return null;
    }

    __max_remaining(tables: Tables, archetypes: Archetypes) {
        let remaining_matched;
        if (this.IS_DENSE) {
            const ids = this.#table_id_iter.clone();
            remaining_matched = ids.map((id: any) => tables.get(id)!.entity_count()).sum();
        } else {
            const ids = this.#archetype_id_iter.clone();
            remaining_matched = ids.map((id: any) => archetypes.get(id)!.len()).sum();
        }

        return remaining_matched + this.#current_len - this.#current_row;
    }

    next(tables: Tables, archetypes: Archetypes, query_state: QueryState<D, F>) {
        if (this.IS_DENSE) {
            while (true) {
                // we are on the beginning of the query, or finished processing a table, so skip to the next

                if (this.#current_row === this.#current_len) {
                    const table_id = this.#table_id_iter.next();
                    if (table_id.done) {
                        return done();
                    }

                    const table = tables.get(table_id.value)!;
                    // D::set_table(this.#fetch, query_state.fetch_state, table);
                    // F::set_table(this.#filter, query_state.filter_state, table);
                    this.#table_entities = table.entities();
                    this.#current_len = table.entity_count();
                    this.#current_row = 0;
                    continue
                }

                //! Safety: set_table was called prior.
                // `current_row` is a table row in range of the current table, because if it was not, the if statement above would have executed.
                const entity = this.#table_entities[this.#current_row];
                // if (!F::filter_fetch(this.#filter, entity, row)) {
                // this.#current_row += 1;
                // continue
                // }

                //! Safety
                // - set_table was called prior.
                // - `current_row` must be a table row in range of the current table,
                //   because if it was not, then the if above would have been executed.
                // - fetch is only called once for each `entity`.
                // const item = D:: fetch(this.#fetch, entity, row);
                // this.#current_row += 1;
                // return iter_item(item);
            }
        } else {
            while (true) {
                if (this.#current_row == this.#current_len) {
                    const archetype_id = this.#archetype_id_iter.next();
                    if (archetype_id.done) {
                        return done();
                    }
                    const archetype = archetypes.get(archetype_id.value);
                    const table = tables.get(archetype!.table_id());

                    // D:: set_archetype(this.#fetch, query_state.fetch_state, archetype, table);
                    // F:: set_archetype(this.#filter, query_state.filter_state, archetype, table);
                    this.#archetype_entities = archetype!.entities();
                    this.#current_len = archetype!.len();
                    this.#current_row = 0;
                    continue
                }

                //! SAFETY: set_archetype was called prior.
                // `current_row` is an archetype index row in range of the current archetype, because if it was not, then the if above would have been executed.
                const archetype_entity = this.#archetype_entities[this.#current_row];
                // if (!F::filter_fetch(this.#filter, archetype_entity.id(), archetype_entity.table_row)) {
                // this.#current_row += 1;
                // continue
                // }

                let item;
                // const item = D:: fetch(this.#fetch,
                //     archetype_entity.id(),
                //     archetype_entity.table_row
                // )
                this.#current_row += 1;
                return iter_item(item);
            }
        }
    }


}