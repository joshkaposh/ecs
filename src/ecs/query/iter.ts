import { Iterator, done, iter, item, range, ArrayLike } from "joshkaposh-iterator";
import { ArchetypeEntity, Archetypes, Entity, QueryData, QueryFilter, QueryState, StorageId, StorageIdArchetype, StorageIdTable, World } from "..";
import { Tables } from "../storage/table";



export class QueryIter<D extends QueryData<any>, F extends QueryFilter<any>> extends Iterator<any> {
    #world: World;
    #tables: Tables;
    #archetypes: Archetypes;
    #query_state: QueryState<any, any>;
    #cursor: QueryCursor<D, F>;
    #D: D;
    #F: F;

    constructor(world: World, state: QueryState<D, F>) {
        super()
        this.#world = world;
        this.#tables = world.storages().tables;
        this.#archetypes = world.archetypes();
        this.#cursor = QueryCursor.init(world, state);
        this.#query_state = state;
        this.#D = state.D;
        this.#F = state.F
    }

    next(): IteratorResult<any, any> {
        return this.#cursor.next(this.#tables, this.#archetypes, this.#query_state)
    }

    into_iter(): Iterator<any> {
        return this;
    }
}

class QueryCursor<D extends QueryData, F extends QueryFilter> {

    readonly is_dense: boolean;
    #storage_id_iter: Iterator<StorageId>;
    #table_entities: Entity[];
    #archetype_entites: ArchetypeEntity[];
    #fetch: D['__fetch'];
    #filter: F['__fetch'];
    #current_len: number;
    #current_row: number;

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
        this.#storage_id_iter = iter(storage_id_iter);
        this.#table_entities = table_entities;
        this.#archetype_entites = archetype_entites;
        this.#fetch = fetch;
        this.#filter = filter;
        this.#current_len = current_len;
        this.#current_row = current_row;
    }

    clone() {
        return new QueryCursor(
            this.#fetch,
            this.#filter,
            this.#table_entities,
            this.#archetype_entites,
            this.#storage_id_iter,
            this.is_dense,
            this.#current_len,
            this.#current_row,
        )

    }

    static init_empty(world: World, query_state: QueryState<any, any>) {
        // return new QueryCursor(

        // )
    }

    static init<D extends QueryData, F extends QueryFilter>(world: World, query_state: QueryState<D, F>) {
        const fetch = query_state.D.init_fetch(world, query_state.__fetch_state);
        const filter = query_state.F.init_fetch(world, query_state.__filter_state);
        const cursor = new QueryCursor(
            fetch as D['__fetch'],
            filter as F['__fetch'],
            [],
            [],
            iter(query_state.__matched_storage_ids),
            query_state.is_dense,
            0,
            0
        );
        return cursor
    }

    next(tables: Tables, archetypes: Archetypes, query_state: QueryState<any, any>) {
        const D = query_state.D;
        const F = query_state.F;

        if (this.is_dense) {
            while (true) {
                // we are on the beginning of the query, or finished processing a table, so skip to the next
                if (this.#current_row === this.#current_len) {
                    const sid = this.#storage_id_iter.next()
                    if (sid.done) {
                        return done()
                    }

                    // @ts-expect-error
                    const table_id = sid.value.table_id ?? sid.value.archetype_id;
                    const table = tables.get(table_id)!;
                    if (table.is_empty()) {
                        continue
                    }

                    D.set_table(this.#fetch, query_state.__fetch_state, table)
                    F.set_table(this.#filter, query_state.__filter_state, table)
                    this.#table_entities = table.entities();
                    this.#current_len = table.entity_count();
                    this.#current_row = 0;
                }

                const entity = this.#table_entities[this.#current_row];
                const row = this.#current_row;
                if (!F.filter_fetch(this.#filter, entity, row)) {
                    this.#current_row += 1;
                    continue;
                }


                const elt = D.fetch(this.#fetch, entity, row);
                this.#current_row += 1;
                return item(elt);
            }
        } else {
            while (true) {
                if (this.#current_row === this.#current_len) {
                    const sid = this.#storage_id_iter.next() as IteratorResult<StorageIdArchetype>;
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
                        this.#fetch,
                        query_state.__fetch_state,
                        archetype,
                        table
                    )
                    F.set_archetype(
                        this.#filter,
                        query_state.__filter_state,
                        archetype,
                        table
                    )
                    this.#archetype_entites = archetype.entities();
                    this.#current_len = archetype.len();
                    this.#current_row = 0;
                }

                const archetype_entity = this.#archetype_entites[this.#current_row];
                if (!F.filter_fetch(this.#filter,
                    archetype_entity.id(),
                    archetype_entity.table_row
                )) {
                    this.#current_row += 1;
                    continue
                }

                const elt = D.fetch(
                    this.#fetch,
                    archetype_entity.id(),
                    archetype_entity.table_row
                )

                this.#current_row += 1;
                return item(elt)
            }
        }
    }

}