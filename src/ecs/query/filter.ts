import { is_dense, WorldQuery } from "./world-query";
import { Entity } from "../entity";
import { Archetype, Component, ComponentId, Components, FilteredAccess, StorageSwitch, StorageType, Tick, World } from "..";
import { Table, TableRow } from "../storage/table";
import { Option } from "joshkaposh-option";
import { unit } from "../../util";
import { ComponentSparseSet } from "../storage/sparse-set";

export abstract class QueryFilter<Item = unit, Fetch = unit, State = unit> extends WorldQuery<Item, Fetch, State> {
    abstract readonly IS_ARCHETYPAL: boolean;
    abstract filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

type FilterFetch<T extends WorldQuery<any, any, any>> = {
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

type ChangedFetch<T extends Component> = {
    ticks: StorageSwitch<T, Option<Tick>, ComponentSparseSet>
    last_run: Tick;
    this_run: Tick;

}

class _Changed<T extends Component> extends QueryFilter<boolean, ChangedFetch<T>, ComponentId> {
    #ty: T
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;

    constructor(type: T) {
        super();
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = false;
    }

    init_fetch(world: World, id: number, last_run: Tick, this_run: Tick) {
        const f = {
            ticks: StorageSwitch.new(this.#ty, () => undefined, () => world.storages().sparse_sets.get(id)),
            last_run,
            this_run
        }
        this.__fetch = f;
        return f;
    }

    set_archetype(fetch: ChangedFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }

    }

    set_table(fetch: ChangedFetch<T>, component_id: number, table: Table): void {
        const table_ticks = table.get_changed_ticks_slice_for(component_id)!
        return fetch.ticks.set_table(table_ticks as any);
    }

    fetch(fetch: ChangedFetch<T>, entity: Entity, table_row: TableRow): boolean {
        return fetch.ticks.extract(
            // @ts-expect-error
            table => table[table_row]!.is_newer_than(fetch.last_run, fetch.this_run),
            sparse_set => sparse_set.get_changed_tick(entity)!.is_newer_than(fetch.last_run, fetch.this_run)
        )

    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        if (access.access().has_component_write(id)) {
            throw new Error(`state_name ${this.#ty.name} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.`)
        }
        access.add_component_read(id);
    }

    init_state(world: World) {
        const s = world.register_component(this.#ty);
        this.__state = s;
        return s;

    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id);
    }

    filter_fetch(fetch: ChangedFetch<T>, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}
type AddedFetch<T extends Component> = {
    ticks: StorageSwitch<T, Option<T>, ComponentSparseSet>;
    last_run: Tick;
    this_run: Tick;
}

class _Added<T extends Component> extends QueryFilter<boolean, AddedFetch<T>, ComponentId> {
    #ty: T
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;

    constructor(type: T) {
        super();
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = false;
    }

    init_fetch(world: World, component_id: ComponentId, last_run: Tick, this_run: Tick) {
        const fetch = {
            ticks: StorageSwitch.new(
                this.#ty,
                () => undefined,
                () => world.storages().sparse_sets.get(component_id)
            ),
            last_run,
            this_run

        }
        this.__fetch = fetch;
        return fetch;

    }

    set_archetype(fetch: AddedFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }

    }

    set_table(fetch: AddedFetch<T>, component_id: number, table: Table): void {
        const table_ticks = table.get_added_ticks_slice_for(component_id)!
        return fetch.ticks.set_table(table_ticks as unknown as T);
    }

    fetch(fetch: AddedFetch<T>, entity: Entity, table_row: TableRow): boolean {
        return fetch.ticks.extract(table => {
            // @ts-expect-error
            const tick = table[table_row] as Tick;
            return tick.is_newer_than(fetch.last_run, fetch.this_run)
        }, sparse_set => {
            const tick = sparse_set.get_added_tick(entity) as Tick;
            return tick.is_newer_than(fetch.last_run, fetch.this_run);
        })

    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        if (access.access().has_component_write(id)) {
            throw new Error(`state_name ${this.#ty.name} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.`)
        }
        access.add_component_read(id);
    }

    init_state(world: World) {
        const s = world.register_component(this.#ty);
        this.__state = s;
        return s;

    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id);
    }

    filter_fetch(fetch: AddedFetch<T>, entity: Entity, table_row: number): boolean {
        const f = this.fetch(fetch, entity, table_row);
        return f
    }
}

class _With extends QueryFilter<unit, unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): unit {
        this.__fetch = unit;
        return unit
    }

    set_table(_fetch: unit, _state: number, _table: Table): void { }

    set_archetype(_fetch: unit, _state: number, _archetype: Archetype, _table: Table): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit {
        return _fetch
    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        access.and_with(id);
    }

    init_state(world: World) {
        const id = world.register_component(this.#ty);
        this.__state = id
        return id
    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id)
    }

    filter_fetch(_fetch: unit, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

class _Without extends QueryFilter<unit, unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): unit {
        this.__fetch = unit;
        return unit
    }

    set_archetype(_fetch: unit, _state: number, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: unit, _state: number, _table: Table): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit {
        this.__item = _fetch;
        return _fetch
    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        access.and_without(id);
    }

    init_state(world: World) {
        const id = world.register_component(this.#ty);
        this.__state = id
        return id;
    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return !set_contains_id(id);
    }

    filter_fetch(_fetch: unit, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

class _Or<F extends QueryFilter<any, any, any>[]> extends QueryFilter<any, FilterFetch<any>[], any[]> {
    #data: F
    private constructor(filters: F, is_dense: boolean, is_archetypal: boolean) {
        super()
        this.#data = filters as F;
        this.IS_ARCHETYPAL = is_archetypal;
        this.IS_DENSE = is_dense;
    }

    static from_filter<F extends QueryFilter<any, any, any>[]>(filters: F) {
        const [d, a] = is_dense_arch(filters);
        return new _Or(filters, d, a)
    }

    IS_ARCHETYPAL: boolean;
    IS_DENSE: boolean;

    init_fetch(world: World, state: any, last_run: Tick, this_run: Tick): FilterFetch<any>[] {
        const filters = Array.from({ length: state.length }, (_, i) => {
            const filter = this.#data[i];
            return {
                fetch: filter.init_fetch(world, state, last_run, this_run),
                matches: false
            }
        });

        this.__fetch = filters;
        return filters;
    }

    set_table(fetch: any, state: any[], table: Table): void {
        for (let i = 0; i < state.length; i++) {
            const filter = this.#data[i];
            fetch[i].matches = filter.matches_component_set(state[i], id => table.has_column(id))
            if (fetch[i].matches) {
                filter.set_table(filter.__fetch, state[i], table)
            }
        }
    }

    set_archetype(fetch: any, state: any[], archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const filter = this.#data[i];
            fetch[i].matches = filter.matches_component_set(state, id => archetype.contains(id))
            if (fetch[i].matches) {
                filter.set_archetype(filter.__fetch, state[i], archetype, table)
            }
        }
    }

    fetch(fetch: any, entity: Entity, table_row: number): boolean {
        let b = false;
        for (let i = 0; i < this.#data.length; i++) {
            // @ts-expect-error
            b &= fetch.matches && this.#data[i].filter_fetch(fetch.fetch[i].fetch, entity, table_row);
        }
        return Boolean(b);
    }

    update_component_access(state: any[], access: FilteredAccess<ComponentId>): void {

        const _new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < this.#data.length; i++) {
            const filter = this.#data[i];
            const intermediate = access.clone();
            filter.update_component_access(state[i], intermediate);
            _new_access.append_or(intermediate);
            _new_access.extend_access(intermediate);
        }

        _new_access.__required = access.__required;
        access.set_to_access(_new_access)
    }

    init_state(world: World): any[] {
        const state: any[] = []
        this.__state = state as any;
        for (let i = 0; i < this.#data.length; i++) {
            const s = this.#data[i].init_state(world);
            state.push(s);
        }

        return state;
    }

    get_state(components: Components): Option<any[]> {
        const s: any[] = [];
        for (let i = 0; i < this.#data.length; i++) {
            s.push(this.#data[i].get_state(components))
        }
        return s;
    }

    matches_component_set(state: any[], set_contains_id: (component_id: ComponentId) => boolean): boolean {
        // filter is a no op, so it matches everything
        if (this.#data.length === 0) {
            return true;
        }

        let matches = false;
        for (let i = 0; i < state.length; i++) {
            // @ts-expect-error
            matches &= this.#data[i].matches_component_set(state[i], set_contains_id)
        }
        return Boolean(matches);
    }

    filter_fetch(fetch: any, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}

class _All<F extends QueryFilter<any, any, any>[]> extends QueryFilter<any, FilterFetch<any>[], any[]> {
    #data: F
    private constructor(filters: F, is_dense: boolean, is_archetypal: boolean) {
        super()
        this.#data = filters;
        this.IS_ARCHETYPAL = is_archetypal;
        this.IS_DENSE = is_dense;
    }

    static from_filter<F extends QueryFilter<any, any, any>[]>(filters: F) {
        const [is_dense, is_archetypal] = is_dense_arch(filters)
        return new _All(filters, is_dense, is_archetypal)
    }

    IS_ARCHETYPAL: boolean;
    IS_DENSE: boolean;

    init_fetch(world: World, state: any, last_run: Tick, this_run: Tick): FilterFetch<any>[] {
        const filters = Array.from({ length: state.length }, (_, i) => {
            const filter = this.#data[i];
            return {
                fetch: filter.init_fetch(world, state, last_run, this_run),
                matches: false
            }
        });
        this.__fetch = filters;

        return filters;
    }

    set_table(fetch: any, state: any[], table: Table): void {
        for (let i = 0; i < state.length; i++) {
            const filter = this.#data[i];
            fetch[i].matches = filter.matches_component_set(state[i], id => table.has_column(id))
            if (fetch[i].matches) {
                filter.set_table(filter.__fetch, state[i], table)
            }
        }
    }

    set_archetype(fetch: any, state: any[], archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const filter = this.#data[i];
            fetch[i].matches = filter.matches_component_set(state, id => archetype.contains(id))
            if (fetch[i].matches) {
                filter.set_archetype(filter.__fetch, state[i], archetype, table)
            }
        }
    }

    fetch(fetch: any, entity: Entity, table_row: number): boolean {
        for (let i = 0; i < fetch.length; i++) {
            if (!this.#data[i].filter_fetch(fetch[i].fetch, entity, table_row)) {
                return false
            }
        }
        return true
    }

    update_component_access(state: any[], access: FilteredAccess<ComponentId>): void {

        const _new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < this.#data.length; i++) {
            const filter = this.#data[i];
            const intermediate = access.clone();
            filter.update_component_access(state[i], intermediate);
            _new_access.append_or(intermediate);
            _new_access.extend_access(intermediate);
        }

        _new_access.__required = access.__required;
        access.set_to_access(_new_access)
    }

    init_state(world: World): any[] {
        const state: any[] = []
        this.__state = state as any;
        for (let i = 0; i < this.#data.length; i++) {
            const s = this.#data[i].init_state(world);
            state.push(s);
        }

        return state;
    }

    get_state(components: Components): Option<any[]> {
        const s: any[] = [];
        for (let i = 0; i < this.#data.length; i++) {
            s.push(this.#data[i].get_state(components))
        }
        return s;
    }

    matches_component_set(state: any[], set_contains_id: (component_id: ComponentId) => boolean): boolean {
        // filter is a no op, so it matches everything
        if (this.#data.length === 0) {
            return true;
        }

        for (let i = 0; i < state.length; i++) {
            if (!this.#data[i].matches_component_set(state[i], set_contains_id)) {
                return false
            }

        }
        return true;
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

export type With<T extends Component> = InstanceType<typeof _With>
export function With<T extends Component>(type: T) {
    return new _With(type)
}

export type Without<T extends Component> = InstanceType<typeof _Without>
export function Without<T extends Component>(type: T) {
    return new _Without(type)
}

export function Or(...filters: QueryFilter<any, any, any>[]) {
    return _Or.from_filter(filters);
}