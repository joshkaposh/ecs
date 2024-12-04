import type { Option } from "joshkaposh-option";
import { Archetype, Component, ComponentId, Components, EntityRef, FilteredAccess, is_component, StorageType, UnsafeEntityCell, World } from "..";
import { UNIT, Unit } from "../../util";
import { Entity } from "../entity";
import { Table, TableRow } from "../storage/table";
import { is_dense, QueryData, WorldQuery } from "./world-query";
import { assert } from "joshkaposh-iterator/src/util";
import { ComponentSparseSet } from "../storage/sparse-set";

export class QueryEntity extends WorldQuery<Entity, Unit, Unit> {
    readonly IS_DENSE = true;

    init_fetch(_world: World, _state: typeof UNIT): typeof UNIT {
        return UNIT;
    }

    set_archetype(_fetch: typeof UNIT, _state: typeof UNIT, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: typeof UNIT, _state: typeof UNIT, _table: Table): void { }

    update_component_access(_state: Unit, _access: FilteredAccess<ComponentId>): void { }


    init_state(_world: World): Unit {
        return UNIT;
    }

    get_state(_components: Components): Option<typeof UNIT> {
        return UNIT
    }

    matches_component_set(_state: typeof UNIT, _set_contains_id: (id: ComponentId) => boolean): boolean {
        return true;
    }

    fetch(_fetch: typeof UNIT, entity: Entity, _table_row: number): Entity {
        return entity;
    }
}

export class QueryEntityRef extends WorldQuery<EntityRef, World, Unit> {
    IS_DENSE = true;

    init_fetch(world: World, _state: Unit): World {
        this.__fetch = world;
        return world
    }

    set_archetype(_fetch: World, _state: typeof UNIT, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: World, _state: typeof UNIT, _table: Table): void { }

    fetch(world: World, entity: Entity, _table_row: number): EntityRef {
        return world.get_entity(entity)!;
    }

    update_component_access(_state: Unit, access: FilteredAccess<ComponentId>): void {

        assert(!access.access().has_any_component_write())
        access.read_all_components();
    }

    init_state(_world: World): Unit {
        return UNIT;
    }

    get_state(_components: Components): Option<typeof UNIT> {
        return UNIT;
    }

    matches_component_set(_state: typeof UNIT, _set_contains_id: (id: ComponentId) => boolean): boolean {
        return true;
    }
}

export class StorageSwitch<C extends Component> {
    C: Component;
    table?: Table
    sparse_set?: ComponentSparseSet;

    constructor(C: C) {
        this.C = C;
    }

    static new(C: Component, table: () => Option<Table>, sparse_set: () => Option<ComponentSparseSet>) {
        const sw = new StorageSwitch(C)
        sw.table = table()!;
        sw.sparse_set = sparse_set()!
        return sw;

    }

    extract<R>(table: (t: Table) => R, sparse_set: (s: ComponentSparseSet) => R): R {
        if (this.table) {
            return table(this.table!)
        } else if (this.sparse_set) {
            return sparse_set(this.sparse_set!);
        }
        return undefined as R
    }

    set_table(table: Table) {
        if (is_dense(this.C)) {
            this.table = table
        }
    }
}

class ReadFetch<T extends Component> {
    __components: StorageSwitch<T>;
    constructor(components: StorageSwitch<T>) {
        this.__components = components;
    }
};

type OptionFetch<T extends WorldQuery<any, any, any>> = {
    __option_fetch: T['__fetch'];
    __matches: boolean;
}

class QueryComponentMaybe<T extends WorldQuery<any, any, any>> extends WorldQuery<Option<T['__item']>, OptionFetch<T>, T['__state']> {
    #T: T
    IS_DENSE: boolean;
    constructor(component: Component) {
        super()
        const qc = new QueryComponent(component) as any;
        this.#T = qc;
        this.IS_DENSE = qc.IS_DENSE

    }

    init_fetch(world: World, state: any): any {
        return {
            __option_fetch: this.#T.init_fetch(world, state),
            __matches: false
        } satisfies OptionFetch<T>;
    }

    set_archetype(fetch: any, state: any, archetype: Archetype, table: Table): void {
        fetch.__matches = this.#T.matches_component_set(state, id => archetype.contains(id));
        if (fetch.__matches) {
            this.#T.set_archetype(fetch.__option_fetch, state, archetype, table)
        }
    }

    set_table(fetch: any, state: any, table: Table): void {
        fetch.__matches = this.#T.matches_component_set(state, id => table.has_column(id))
        if (fetch.__matches) {
            this.#T.set_table(fetch.__option_fetch, state, table)
        }
    }

    fetch(fetch: any, entity: Entity, table_row: TableRow) {
        if (fetch.__matches) {
            return this.#T.fetch(fetch.__option_fetch, entity, table_row)
        }
    }

    update_component_access(state: typeof UNIT, access: FilteredAccess<ComponentId>): void {
        const intermediate = access.clone();
        this.#T.update_component_access(state, intermediate);
        access.extend_access(intermediate);
    }

    init_state(world: World) {
        return this.#T.init_state(world);
    }

    get_state(components: Components): Option<typeof UNIT> {
        return this.#T.get_state(components)
    }

    matches_component_set(_state: any, _set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true
    }
}

export class QueryComponent<T extends Component> extends WorldQuery<T, ReadFetch<T>, ComponentId> {
    #ty: Component;
    readonly IS_DENSE: boolean;
    constructor(component: Component) {
        super()
        this.IS_DENSE = is_dense(component);
        this.#ty = component;
    }

    init_fetch(world: World, component_id: number) {
        const fetch = new ReadFetch(
            StorageSwitch.new(this.#ty, () => null, () => world.storages().sparse_sets.get(component_id)!)
        )

        this.__fetch = fetch;
        return fetch

    }

    set_archetype(fetch: ReadFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: ReadFetch<T>, _component_id: number, table: Table): void {
        fetch.__components.set_table(table);
    }

    fetch(fetch: ReadFetch<T>, entity: Entity, table_row: number): T {
        return fetch.__components.extract(
            (table) => table.get_column(this.__state)!.get_data(table_row) as unknown as Component,
            (sparse_set) => sparse_set.get(entity)
        ) as T
    }

    update_component_access(component_id: number, access: FilteredAccess<ComponentId>): void {
        assert(!access.access().has_component_write(component_id));
        access.add_component_read(component_id);
    }

    init_state(world: World): number {
        const state = world.init_component(this.#ty);
        this.__state = state;
        return state
    }

    get_state(_components: Components): Option<number> {
        return this.__state;
    }

    matches_component_set(state: number, set_contains_id: (id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

export function EntRef() {
    return new QueryEntityRef();
}

export function Ent() {
    return new QueryEntity();
}

export function Maybe<T extends Component>(component: T) {
    const qc = new QueryComponentMaybe(component);
    return qc;
}

/**
 * 
 * query([A, B])
 * query([A, B], [Without(C)])
 * query([Entity, A, B], [Without(C)])
 * 
 * 
 * 
 */

function to_query_data(ty: any): QueryData<any, any, any> {
    if (ty instanceof WorldQuery) {
        return ty
    }

    return new QueryComponent(ty);
}

function evaluate_query_data(data: any[]) {
    return data.map(c => to_query_data(c))
}

export class QueryComponentsData extends WorldQuery<any, any, any> {
    #data: any[]
    #queries: QueryData<any, any, any>[]
    constructor(data: any[]) {
        super()
        this.#data = data;
        this.#queries = evaluate_query_data(data);

        this.IS_DENSE = data.every(c => is_dense(c));
    }

    IS_DENSE: boolean;

    init_fetch(world: World, state: any[]): any {
        const f = state.map((s, i) => this.#queries[i].init_fetch(world, s))
        this.__fetch = f;
        return f
    }

    set_archetype(fetch: any, _state: any, _archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const name = this.#queries[i];
            const state = _state[i];
            const should_set_archetype = name.matches_component_set(state, (id: any) => _archetype.contains(id))
            if (should_set_archetype) {
                name.set_archetype(fetch[i], state, _archetype, table)
            }
        }
    }

    set_table(_fetch: any, _state: any, _table: Table): void {

        for (let i = 0; i < _fetch.length; i++) {
            const name = this.#queries[i];
            const state = _state[i];
            name.set_table(_fetch[i], state, _table)
        }
    }

    fetch(_fetch: any, _entity: Entity, _table_row: number): any[] {
        const items: any[] = [];
        for (let i = 0; i < _fetch.length; i++) {
            const name = this.#queries[i]
            items.push(name.fetch(_fetch[i], _entity, _table_row))
        }
        return items
    }

    update_component_access(_state: any, access: FilteredAccess<ComponentId>): void {
        const _new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < _state.length; i++) {
            const name = this.#queries[i];
            const intermediate = access.clone();
            name.update_component_access(_state[i], intermediate);
            _new_access.append_or(intermediate);
        }

        access.__filter_sets = _new_access.__filter_sets;
    }

    init_state(world: World): any {
        const state: any[] = [];
        this.__state = state as any;
        for (let i = 0; i < this.#data.length; i++) {
            state.push(this.#queries[i].init_state(world));
        }
        return state;
    }

    get_state(_components: Components): Option<any> {
        return this.__state;
    }

    matches_component_set(state: any, set_contains_id: (id: ComponentId) => boolean): boolean {
        for (let i = 0; i < state.length; i++) {
            const name = this.#queries[i];
            if (!name.matches_component_set(state[i], set_contains_id)) {
                return false
            }
        }

        return true
    }
}

