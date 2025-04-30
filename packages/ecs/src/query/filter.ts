import type { Option } from "joshkaposh-option";
import { $WorldQuery, is_dense, ThinWorldQuery, WorldQuery } from "./world-query";
import { Entity } from "../entity";
import { Archetype, Component, ComponentId, Components, FilteredAccess, is_newer_than, AsQueryItem, AsQueryFetch, AsQueryState, StorageSwitch, StorageType, Tick, World } from "ecs";
import { Table, TableRow } from "../storage/table";
import { unit } from "../util";
import { ComponentSparseSet } from "../storage/sparse-set";

export interface QueryFilter<Item = any, Fetch = any, State = any> extends WorldQuery<Item, Fetch, State> {
    readonly IS_ARCHETYPAL: boolean;
    filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

export interface ThinQueryFilter<Item = any, Fetch = any, State = any> extends ThinWorldQuery<Item, Fetch, State> {
    readonly IS_ARCHETYPAL: boolean;
    filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

export type RemapQueryTupleToQueryFilter<T extends readonly any[]> = QueryFilter<AsQueryItem<T>, AsQueryFetch<T>, AsQueryState<T>>

interface FilterFetch<T extends WorldQuery<any, any, any>> {
    fetch: T;
    matches: boolean;
}

function is_dense_arch(filter: QueryFilter[]) {
    let is_archetypal = 1;
    let is_dense = 1;
    filter.forEach(f => {
        // @ts-expect-error
        is_archetypal &= f.IS_ARCHETYPAL
        // @ts-expect-error
        is_dense &= f.IS_DENSE;
    })
    return [Boolean(is_dense), Boolean(is_archetypal)] as const;
}

interface ChangedFetch<T extends Component> {
    ticks: StorageSwitch<T, Option<Tick[]>, ComponentSparseSet>
    last_run: Tick;
    this_run: Tick;
}

class _Changed<T extends Component> implements QueryFilter<boolean, ChangedFetch<T>, ComponentId> {
    readonly [$WorldQuery]: true;
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;

    __item!: boolean;
    __fetch!: ChangedFetch<T>;
    __state!: ComponentId;

    #ty: T
    constructor(type: T) {
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = false;
        this[$WorldQuery] = true;
    }

    init_fetch(world: World, id: number, last_run: Tick, this_run: Tick) {
        return {
            ticks: new StorageSwitch(
                this.#ty,
                () => undefined,
                () => world.storages.sparse_sets.get(id)
            ),
            last_run,
            this_run
        }
    }

    set_archetype(fetch: ChangedFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }

    }

    set_table(fetch: ChangedFetch<T>, component_id: number, table: Table): void {
        fetch.ticks.set_table(table.getChangedTicksSliceFor(component_id)! as any);
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: ChangedFetch<T>, entity: Entity, table_row: TableRow): boolean {
        return fetch.ticks.extract(
            table => is_newer_than(table![table_row], fetch.last_run, fetch.this_run),
            sparse_set => is_newer_than(sparse_set.getChangedTick(entity)!, fetch.last_run, fetch.this_run)
        )
    }

    update_component_access(id: number, access: FilteredAccess): void {
        if (access.access().has_component_write(id)) {
            throw new Error(`state_name ${this.#ty.name} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.`)
        }
        access.add_component_read(id);
    }

    init_state(world: World) {
        return world.registerComponent(this.#ty);
    }

    get_state(components: Components): Option<number> {
        return components.componentId(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id);
    }

    filter_fetch(fetch: ChangedFetch<T>, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}
interface AddedFetch<T extends Component> {
    ticks: StorageSwitch<T, Option<T>, ComponentSparseSet>;
    last_run: Tick;
    this_run: Tick;
}

class _Added<T extends Component> implements QueryFilter<boolean, AddedFetch<T>, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    readonly [$WorldQuery]: true;

    __item!: boolean;
    __fetch!: AddedFetch<T>;
    __state!: ComponentId;

    #ty: T
    constructor(type: T) {
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = false;
        this[$WorldQuery] = true;
    }

    init_fetch(world: World, component_id: ComponentId, last_run: Tick, this_run: Tick) {
        return {
            ticks: new StorageSwitch(
                this.#ty,
                () => undefined,
                () => world.storages.sparse_sets.get(component_id)
            ),
            last_run,
            this_run
        }
    }

    set_archetype(fetch: AddedFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    set_table(fetch: AddedFetch<T>, component_id: number, table: Table): void {
        fetch.ticks.set_table(table.getAddedTicksSliceFor(component_id) as any);
    }

    fetch(fetch: AddedFetch<T>, entity: Entity, table_row: TableRow): boolean {
        return fetch.ticks.extract(
            // @ts-expect-error
            (table) => is_newer_than(table![table_row], fetch.last_run, fetch.this_run),
            sparse_set => is_newer_than(sparse_set.getAddedTick(entity)!, fetch.last_run, fetch.this_run)
        )

    }

    update_component_access(id: number, access: FilteredAccess): void {
        if (access.access().has_component_write(id)) {
            throw new Error(`state_name ${this.#ty.name} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.`)
        }
        access.add_component_read(id);
    }

    init_state(world: World) {
        return world.registerComponent(this.#ty);

    }

    get_state(components: Components): Option<number> {
        return components.componentId(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id);
    }

    filter_fetch(fetch: AddedFetch<T>, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}

class _With implements QueryFilter<unit, unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    readonly [$WorldQuery]: true;

    __item!: unit;
    __fetch!: unit;
    __state!: ComponentId;
    #ty: Component;
    constructor(type: Component) {
        this.#ty = type;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
        this[$WorldQuery] = true;
    }

    init_fetch(_world: World, _state: number): unit {
        return unit
    }

    set_table(_fetch: unit, _state: number, _table: Table): void { }

    set_access(_state: number, _access: FilteredAccess): void { }

    set_archetype(_fetch: unit, _state: number, _archetype: Archetype, _table: Table): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit {
        return _fetch
    }

    update_component_access(id: number, access: FilteredAccess): void {
        access.and_with(id);
    }

    init_state(world: World) {
        return world.registerComponent(this.#ty)
    }

    get_state(components: Components): Option<number> {
        return components.componentId(this.#ty)
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id);
    }

    filter_fetch(_fetch: unit, _entity: Entity, _table_row: number): boolean {
        return true;
    }
}

class _Without implements QueryFilter<unit, unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    readonly [$WorldQuery]: true;

    #ty: Component;
    constructor(type: Component) {
        this.#ty = type;
        this[$WorldQuery] = true;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): unit { return unit }

    set_archetype(_fetch: unit, _state: number, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: unit, _state: number, _table: Table): void { }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit { return _fetch }

    update_component_access(id: number, access: FilteredAccess): void { access.and_without(id) }

    init_state(world: World) { return world.registerComponent(this.#ty) }

    get_state(components: Components): Option<number> { return components.componentId(this.#ty) }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean { return !set_contains_id(id) }

    filter_fetch(_fetch: unit, _entity: Entity, _table_row: number): boolean { return true }
}

class _Or<F extends QueryFilter<boolean, FilterFetch<WorldQuery>, any>[]> implements QueryFilter<boolean, AsQueryFetch<F>, AsQueryState<F>> {
    readonly IS_ARCHETYPAL: boolean;
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery]: true;

    #filters: F;

    constructor(filters: F) {
        let is_archetypal = 1;
        let is_dense = 1;
        filters.forEach(f => {
            // @ts-expect-error
            is_archetypal &= f.IS_ARCHETYPAL
            // @ts-expect-error
            is_dense &= f.IS_DENSE;
        })

        this.#filters = filters;
        this[$WorldQuery] = true;
        this.IS_ARCHETYPAL = Boolean(is_archetypal);
        this.IS_DENSE = Boolean(is_dense);
    }

    init_fetch(world: World, state: AsQueryState<F[]>, last_run: Tick, this_run: Tick): AsQueryFetch<F> {
        return state.map((state, i) => {
            return {
                fetch: this.#filters[i].init_fetch(world, state, last_run, this_run),
                matches: false
            }
        }) as AsQueryFetch<F>
    }

    set_table(fetch: AsQueryFetch<F>, state: AsQueryState<F>, table: Table): void {
        for (let i = 0; i < state.length; i++) {
            const filter = this.#filters[i];
            const filter_fetch = fetch[i];
            filter_fetch.matches = filter.matches_component_set(state[i], id => table.hasColumn(id))
            if (filter_fetch.matches) {
                filter.set_table(filter_fetch, state[i], table)
            }
        }
    }

    set_archetype(fetch: AsQueryFetch<F>, state: AsQueryState<F>, archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const filter = this.#filters[i];
            const filter_fetch = fetch[i] as FilterFetch<WorldQuery>;
            filter_fetch.matches = filter.matches_component_set(state, id => archetype.has(id))
            if (filter_fetch.matches) {
                filter.set_archetype(filter_fetch, state[i], archetype, table)
            }
        }
    }


    set_access(_state: any[], _access: FilteredAccess): void { }

    fetch(fetch: AsQueryFetch<F>, entity: Entity, table_row: TableRow): boolean {
        let b = false;
        for (let i = 0; i < this.#filters.length; i++) {
            // @ts-expect-error
            b &= fetch.matches && this.#filters[i].filter_fetch(fetch.fetch[i].fetch, entity, table_row);
        }
        return Boolean(b);
    }

    update_component_access(state: any[], access: FilteredAccess): void {
        const new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < this.#filters.length; i++) {
            const f = this.#filters[i];
            const intermediate = access.clone();
            f.update_component_access(state[i], intermediate);
            new_access.append_or(intermediate);
            new_access.extend_access(intermediate);
        }

        new_access.__required = access.__required;
        access.set_to_access(new_access)
    }

    init_state(world: World): any[] {
        return this.#filters.map(f => f.init_state(world));
    }

    get_state(components: Components): Option<AsQueryState<F>> {
        return this.#filters.map(f => f.get_state(components)) as AsQueryState<F>;
    }

    matches_component_set(state: any[], set_contains_id: (component_id: ComponentId) => boolean): boolean {
        const filters = this.#filters
        // filter is a no op, so it matches everything
        if (filters.length === 0) {
            return true;
        }

        let matches = false;

        for (let i = 0; i < state.length; i++) {
            // @ts-expect-error
            matches &= filters[i].matches_component_set(state[i], set_contains_id)
        }

        return Boolean(matches);
    }

    filter_fetch(fetch: AsQueryFetch<F>, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}

class _All<F extends QueryFilter<any[], any[], any>[]> implements QueryFilter<boolean, FilterFetch<any>[], any[]> {

    readonly IS_ARCHETYPAL: boolean;
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery]: true;
    #filters: F;

    private constructor(filters: F, is_dense: boolean, is_archetypal: boolean) {
        this.#filters = filters;
        this[$WorldQuery] = true;
        this.IS_ARCHETYPAL = is_archetypal;
        this.IS_DENSE = is_dense;
    }

    static from_filter<F extends QueryFilter<any, any, any>[]>(filters: F) {
        const [is_dense, is_archetypal] = is_dense_arch(filters);
        return new _All(filters, is_dense, is_archetypal)
    }

    init_fetch(world: World, state: any[], last_run: Tick, this_run: Tick): FilterFetch<any>[] {
        return state.map((s, i) => {
            return {
                fetch: this.#filters[i].init_fetch(world, s, last_run, this_run),
                matches: false
            }
        })
    }

    set_table(fetch: any[], state: any[], table: Table): void {
        for (let i = 0; i < state.length; i++) {
            const filter = this.#filters[i];
            const filter_fetch = fetch[i];
            filter_fetch.matches = filter.matches_component_set(state[i], id => table.hasColumn(id));
            if (filter_fetch.matches) {
                filter.set_table(filter_fetch.fetch, state[i], table)
            }
        }
    }

    set_archetype(fetch: any, state: any[], archetype: Archetype, table: Table): void {
        const data = this.#filters;
        for (let i = 0; i < fetch.length; i++) {
            const filter_fetch = fetch[i];
            const filter = data[i];
            filter_fetch.matches = filter.matches_component_set(state, id => archetype.has(id))
            if (filter_fetch.matches) {
                filter.set_archetype(filter_fetch.fetch, state[i], archetype, table)
            }
        }
    }

    set_access(_state: any[], _access: FilteredAccess): void { }

    fetch(fetch: any[], entity: Entity, table_row: number): boolean {
        const filters = this.#filters;
        return fetch.every((f, i) => filters[i].filter_fetch(f.fetch, entity, table_row));
    }

    update_component_access(state: any[], access: FilteredAccess): void {

        const new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < this.#filters.length; i++) {
            const filter = this.#filters[i];
            const intermediate = access.clone();
            filter.update_component_access(state[i], intermediate);
            new_access.append_or(intermediate);
            new_access.extend_access(intermediate);
        }

        new_access.__required = access.__required;
        access.set_to_access(new_access)
    }

    init_state(world: World): any[] {
        return this.#filters.map(f => f.init_state(world));
    }

    get_state(components: Components): Option<any[]> {
        return this.#filters.map(f => f.get_state(components));
    }

    matches_component_set(state: any[], set_contains_id: (component_id: ComponentId) => boolean): boolean {
        const filters = this.#filters;
        return filters.length === 0 ? true : // filter is a no op, so it matches everything
            filters.every((f, i) => f.matches_component_set(state[i], set_contains_id))
    }

    filter_fetch(fetch: any, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}

export function Added<T extends Component>(type: T) {
    return new _Added(type)
}

export function Changed<T extends Component>(type: T) {
    return new _Changed(type);
}

export function All(...filter: QueryFilter<any, any, any>[]) {
    return _All.from_filter(filter);
}

export type With = InstanceType<typeof _With>
export function With<T extends Component>(type: T) {
    return new _With(type)
}

export type Without = InstanceType<typeof _Without>
export function Without<T extends Component>(type: T) {
    return new _Without(type)
}

export function Or(...filters: QueryFilter<any, any, any>[]) {
    return new _Or(filters);
}