import type { Option } from "joshkaposh-option";
import { Archetype, Component, ComponentId, Components, EntityRef, FilteredAccess, StorageType, World } from "..";
import { UNIT, Unit } from "../../util";
import { Entity } from "../entity";
import { Table } from "../storage/table";
import { is_dense, WorldQuery } from "./world-query";
import { assert } from "joshkaposh-iterator/src/util";
import { ComponentSparseSet } from "../storage/sparse-set";

export class WorldQueryEntity extends WorldQuery<Entity, Unit, Unit> {
    constructor() {
        super()
    }

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

export class WorldQueryEntityRef extends WorldQuery<EntityRef, World, Unit> {
    IS_DENSE = true;

    init_fetch(world: World, _state: Unit): World {
        return world
    }

    set_archetype(_fetch: World, _state: typeof UNIT, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: World, _state: typeof UNIT, _table: Table): void { }

    fetch(fetch: World, entity: Entity, _table_row: number): EntityRef {
        return fetch.get_entity(entity)!
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

export class ReadFetch<T extends Component> {
    __components: StorageSwitch<T>;
    constructor(components: StorageSwitch<T>) {
        this.__components = components;
    }

};

// @ts-expect-error
export class QueryComponent<T extends Component> extends WorldQuery<T, ReadFetch<T>, ComponentId> {
    #ty: Component;
    constructor(component: Component) {
        super()
        // @ts-expect-error
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
            (table) => table.get_data_slice_for(table_row) as unknown as Component,
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

export class QueryComponentsData<T extends Component[]> extends WorldQuery<any, any, any> {
    #data: T
    #queries: QueryComponent<Component>[]
    constructor(data: T) {
        super()
        this.#data = data;
        this.#queries = data.map(c => new QueryComponent(c));
        this.IS_DENSE = data.every(c => is_dense(c));
    }

    IS_DENSE: boolean;

    init_fetch(world: World, state: any[]): any {
        const f = state.map((s, i) => this.#queries[i].init_fetch(world, s))
        this.__fetch = f;
        return f
    }

    set_archetype(_fetch: any, _state: any, _archetype: Archetype, _table: Table): void {
        for (let i = 0; i < _fetch.length; i++) {
            const name = _fetch[i];
            const state = _state[i];
            _fetch[i] = name.matches_component_set(state, (id: any) => _archetype.contains(id))
            if (_fetch[i]) {
                name.set_archetype(_fetch[i], state, _archetype, _table)
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
            const name = _fetch[i] as ReadFetch<Component>;
            const state = this.__state[i]
            items.push(name.__components.extract(
                table => table.get_column(state)!.get_data(_table_row)!,
                sparse_set => sparse_set.get(_entity)!
            ))
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

