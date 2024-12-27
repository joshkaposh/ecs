import { is_some, type Option } from "joshkaposh-option";
import { Archetype, Component, ComponentId, Components, EntityRef, FilteredAccess, StorageType, Tick, World } from "..";
import { DeepReadonly, unit } from "../../util";
import { Entity } from "../entity";
import { Table, TableRow } from "../storage/table";
import { is_dense, WorldQuery } from "./world-query";
import { assert } from "joshkaposh-iterator/src/util";
import { ComponentSparseSet } from "../storage/sparse-set";
import { TicksMut, Ticks, Ref, $read_and_write, $readonly } from "../change_detection";

export type QueryData<Item = unit, Fetch = unit, State = unit> = WorldQuery<Item, Fetch, State>

class QueryEntity extends WorldQuery<Entity, unit, unit> {
    readonly IS_DENSE = true;

    init_fetch(_world: World, _state: unit): unit {
        return unit;
    }

    set_archetype(_fetch: unit, _state: unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: unit, _state: unit, _table: Table): void { }

    update_component_access(_state: unit, _access: FilteredAccess<ComponentId>): void { }


    init_state(_world: World): unit {
        this.__state = unit
        return unit;
    }

    get_state(_components: Components): Option<unit> {
        return unit
    }

    matches_component_set(_state: unit, _set_contains_id: (id: ComponentId) => boolean): boolean {
        return true;
    }

    fetch(_fetch: unit, entity: Entity, _table_row: number): Entity {
        return entity;
    }
}

class QueryEntityRef extends WorldQuery<EntityRef, World, unit> {
    IS_DENSE = true;

    init_fetch(world: World, _state: unit, _last_run: Tick, _this_run: Tick): World {
        this.__fetch = world;
        return world
    }

    set_archetype(_fetch: World, _state: unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: World, _state: unit, _table: Table): void { }

    fetch(world: World, entity: Entity, _table_row: number): EntityRef {
        return world.get_entity(entity)!;
    }

    update_component_access(_state: unit, access: FilteredAccess<ComponentId>): void {

        assert(!access.access().has_any_component_write())
        access.read_all_components();
    }

    init_state(_world: World): unit {
        return unit;
    }

    get_state(_components: Components): Option<unit> {
        return unit;
    }

    matches_component_set(_state: unit, _set_contains_id: (id: ComponentId) => boolean): boolean {
        return true;
    }
}

export class StorageSwitch<
    C extends Component,
    T extends any, // T extends Copy
    S extends any // S extends Copy
> {
    _marker: Component;
    table!: T
    sparse_set!: S;

    private constructor(C: C) {
        this._marker = C;
    }

    static new<C extends Component, T extends any, S extends any>(C: C, table: () => Option<T>, sparse_set: () => Option<S>): StorageSwitch<C, T, S> {
        const sw = new StorageSwitch(C)
        sw.table = table()!;
        sw.sparse_set = sparse_set()!
        return sw as StorageSwitch<C, T, S>;
    }

    extract<R>(table: (t: T) => R, sparse_set: (s: S) => R): R {
        if (is_some(this.table)) {
            return table(this.table)
        } else if (is_some(this.sparse_set)) {

            return sparse_set(this.sparse_set);
        }
        return undefined as R
    }

    set_table(table: T) {
        if (is_dense(this._marker)) {
            this.table = table as T;
        }
    }
}

type RefFetch<T extends Component> = {
    components: StorageSwitch<T, Option<[InstanceType<T>, Tick, Tick]>, ComponentSparseSet>
    last_run: Tick;
    this_run: Tick;
}

class RefComponent<T extends Component, R extends Ref<T>> extends WorldQuery<InstanceType<T>, RefFetch<T>, ComponentId> {
    #ty: T;
    readonly IS_DENSE: boolean;
    constructor(component: T) {
        super()
        this.IS_DENSE = is_dense(component);
        this.#ty = component;
    }

    init_fetch(world: World, component_id: number, last_run: Tick, this_run: Tick) {
        const fetch = {
            components: StorageSwitch.new(this.#ty, () => undefined, () => world.storages().sparse_sets.get(component_id)!),
            last_run,
            this_run,
        } as RefFetch<T>
        this.__fetch = fetch;
        return fetch
    }

    set_archetype(fetch: RefFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: RefFetch<T>, component_id: number, table: Table): void {
        const column = table.get_column(component_id)!;
        const table_data = [
            column.get_data_slice()!,
            column.get_added_ticks_slice()!,
            column.get_changed_ticks_slice()!,
        ] as const;
        fetch.components.set_table(table_data as any);
    }

    fetch(fetch: RefFetch<T>, entity: Entity, table_row: number): InstanceType<T> {
        return fetch.components.extract(
            (table) => {
                const [table_components, added_ticks, changed_ticks] = table!;
                const component = table_components[table_row];
                // @ts-expect-error
                const added = added_ticks[table_row];
                // @ts-expect-error
                const changed = changed_ticks[table_row];
                return new Ref(component, new Ticks(added, changed, fetch.this_run, fetch.last_run))
            },
            (sparse_set) => {
                const [component, ticks] = sparse_set.get_with_ticks(entity)!;
                return new Ref(component, Ticks.from_tick_cells(ticks, fetch.last_run, fetch.this_run))
            }
        ) as any
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

type OptionFetch<T extends WorldQuery<any, any, any>> = {
    fetch: T['__fetch'];
    matches: boolean;
}

class OptionComponent<T extends Component> extends WorldQuery<Option<InstanceType<T>>, OptionFetch<WorldQuery<any, any, any>>, ComponentId> {
    #T: WorldQuery<any, any, any>
    IS_DENSE: boolean;
    constructor(component: Component) {
        super()
        this.#T = new ReadComponent(component);
        this.IS_DENSE = this.#T.IS_DENSE

    }

    init_fetch(world: World, state: any, last_run: Tick, this_run: Tick): any {
        return {
            fetch: this.#T.init_fetch(world, state, last_run, this_run),
            matches: false
        };
    }

    set_archetype(fetch: any, state: any, archetype: Archetype, table: Table): void {
        fetch.matches = this.#T.matches_component_set(state, id => archetype.contains(id));
        if (fetch.matches) {
            this.#T.set_archetype(fetch.fetch, state, archetype, table)
        }
    }

    set_table(fetch: any, state: any, table: Table): void {
        fetch.matches = this.#T.matches_component_set(state, id => table.has_column(id))
        if (fetch.matches) {
            this.#T.set_table(fetch.fetch, state, table)
        }
    }

    fetch(fetch: any, entity: Entity, table_row: TableRow) {
        if (fetch.matches) {
            return this.#T.fetch(fetch.fetch, entity, table_row)
        }
    }

    update_component_access(state: number, access: FilteredAccess<ComponentId>): void {
        const intermediate = access.clone();
        this.#T.update_component_access(state, intermediate);
        access.extend_access(intermediate);
    }

    init_state(world: World) {
        return this.#T.init_state(world);
    }

    get_state(components: Components): Option<number> {
        return this.#T.get_state(components)
    }

    matches_component_set(_state: any, _set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true
    }
}

type ReadFetch<T extends Component> = {
    components: StorageSwitch<T, Option<InstanceType<T>>, ComponentSparseSet>;
};

class ReadComponent<T extends Component> extends WorldQuery<DeepReadonly<T>, ReadFetch<T>, ComponentId> {
    #ty: T;
    readonly IS_DENSE: boolean;
    constructor(component: T) {
        super()
        this.IS_DENSE = is_dense(component);
        this.#ty = component;
    }

    init_fetch(world: World, component_id: number, _last_run: Tick, _this_run: Tick) {
        const fetch = {
            components: StorageSwitch.new(this.#ty, () => undefined, () => world.storages().sparse_sets.get(component_id)!)
        } as ReadFetch<T>
        this.__fetch = fetch;
        return fetch
    }

    set_archetype(fetch: ReadFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: ReadFetch<T>, component_id: number, table: Table): void {
        const table_data = table.get_data_slice_for(component_id)!;
        fetch.components.set_table(table_data as any);
    }

    fetch(fetch: ReadFetch<T>, entity: Entity, table_row: number): InstanceType<T> {
        return $readonly(fetch.components.extract(
            (table) => {
                return table![table_row]
            },
            (sparse_set) => sparse_set.get(entity)
        )) as InstanceType<T>;
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

type WriteFetch<T extends Component> = {
    components: StorageSwitch<T, Option<[T, Tick, Tick]>, ComponentSparseSet>;
    last_run: Tick;
    this_run: Tick;
}

class WriteComponent<T extends Component> extends WorldQuery<InstanceType<T>, WriteFetch<T>, ComponentId> {
    #ty: T
    readonly IS_DENSE: boolean;
    constructor(ty: T) {
        super();
        this.#ty = ty;
        this.IS_DENSE = ty.storage_type === StorageType.Table;
    }

    init_fetch(world: World, component_id: number, last_run: Tick, this_run: Tick): WriteFetch<T> {
        return {
            components: StorageSwitch.new(this.#ty, () => undefined, () => world.storages().sparse_sets.get(component_id)!),
            last_run,
            this_run
        }
    }

    set_archetype(fetch: WriteFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: WriteFetch<T>, component_id: number, table: Table): void {
        const column = table.get_column(component_id)!;
        const table_data = [
            // @ts-expect-error
            column.get_data_slice(table.entity_count()),
            // @ts-expect-error
            column.get_added_ticks_slice(table.entity_count()),
            // @ts-expect-error
            column.get_changed_ticks_slice(table.entity_count()),
        ] as const
        fetch.components.set_table(table_data as any)
    }

    fetch(fetch: WriteFetch<T>, entity: Entity, table_row: TableRow): InstanceType<T> {
        return fetch.components.extract(table => {
            const [table_components, added_ticks, changed_ticks] = table as any;
            const component = table_components[table_row];
            const added = added_ticks[table_row];
            const changed = changed_ticks[table_row];
            return $read_and_write(component, new TicksMut(added, changed, fetch.last_run, fetch.this_run))
        }, sparse_set => {
            const [component, ticks] = sparse_set.get_with_ticks(entity)!;
            return {
                value: component,
                ticks: new TicksMut(
                    ticks.added,
                    ticks.changed,
                    fetch.last_run,
                    fetch.this_run
                )
            }

        }) as InstanceType<T>;
    }

    update_component_access(component_id: number, access: FilteredAccess<ComponentId>): void {
        assert(!access.access().has_component_read(component_id))
        access.add_component_write(component_id);
    }

    init_state(world: World) {
        const s = world.register_component(this.#ty);
        this.__state = s;
        return s;
    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(state: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

export class QueryDataTuple extends WorldQuery<any, any, any> {
    #queries: QueryData<any, any, any>[]
    constructor(queries: QueryData<any, any, any>[]) {
        super()
        this.#queries = queries;
        this.IS_DENSE = queries.every(q => q.IS_DENSE);
    }

    static from_data(data: any[]) {
        return new QueryDataTuple(evaluate_query_data(data))
    }

    IS_DENSE: boolean;

    init_fetch(world: World, state: any[], last_run: Tick, this_run: Tick): any {
        const f = state.map((s, i) => this.#queries[i].init_fetch(world, s, last_run, this_run))
        this.__fetch = f;
        return f
    }

    set_archetype(fetch: any, state: any, archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const name = this.#queries[i];
            const s = state[i];
            if (name.matches_component_set(s, (id: any) => archetype.contains(id))) {
                name.set_archetype(fetch[i], s, archetype, table)
            }
        }
    }

    set_table(fetch: any, state: any, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const name = this.#queries[i];
            name.set_table(fetch[i], state[i], table)
        }
    }

    fetch(fetch: any, entity: Entity, table_row: number): any[] {
        const f = Array.from({ length: this.#queries.length }, (_, i) => this.#queries[i].fetch(fetch[i], entity, table_row))
        this.__fetch = f;
        return f;
    }

    update_component_access(state: any, access: FilteredAccess<ComponentId>): void {
        const _new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < state.length; i++) {
            const name = this.#queries[i];
            const intermediate = access.clone();
            name.update_component_access(state[i], intermediate);
            _new_access.append_or(intermediate);
        }

        access.__filter_sets = _new_access.__filter_sets;
    }

    init_state(world: World): any {
        const state = Array.from({ length: this.#queries.length }, (_, i) => this.#queries[i].init_state(world))
        this.__state = state as any;
        return state;
    }

    get_state(components: Components): Option<any> {
        return Array.from({ length: this.#queries.length }, (_, i) => this.#queries[i].get_state(components))
    }

    matches_component_set(state: any[], set_contains_id: (id: ComponentId) => boolean): boolean {
        return state.every((s, i) => this.#queries[i].matches_component_set(s, set_contains_id))
    }
}

export type Read<T extends Component> = ReadComponent<T>;
export function Read<T extends Component>(type: T) {
    return new ReadComponent(type);
}

export function ReadRef<T extends Component>(type: T) {
    return new RefComponent(type);
}

export type Write<T extends Component> = WriteComponent<T>;
export function Write<T extends Component>(type: T) {
    return new WriteComponent(type);
}

export type Maybe<T extends Component> = OptionComponent<T>
export function Maybe<T extends Component>(component: T) {
    return new OptionComponent<T>(component);
}

function to_query_data(ty: any): QueryData<any, any, any> {
    if (ty instanceof WorldQuery) {
        return ty
    } else if (ty === Entity) {
        return new QueryEntity();
    } else if (ty === EntityRef) {
        return new QueryEntityRef();
    } else {
        return new ReadComponent(ty);
    }

}

function evaluate_query_data(data: any[]) {
    return data.map(c => to_query_data(c))
}
