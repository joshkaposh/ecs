import { Unit } from "joshkaposh-index-map";
import { is_dense, WorldQuery } from "./world-query";
import { Entity } from "../entity";
import { Archetype, Component, ComponentId, Components, FilteredAccess, StorageType, World } from "..";
import { Table, TableRow } from "../storage/table";
import { Option } from "joshkaposh-option";
import { iter } from "joshkaposh-iterator";

export type QueryFilterType<Fetch> = {
    readonly IS_ARCHETYPAL: boolean;
    filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

export abstract class QueryFilter<Item = Unit, Fetch = Unit, State = Unit> extends WorldQuery<Item, Fetch, State> {
    abstract readonly IS_ARCHETYPAL: boolean;
    abstract filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

export class EmptyQueryFilter extends QueryFilter<Unit, Unit, Unit> {
    readonly IS_ARCHETYPAL: boolean;
    readonly IS_DENSE: boolean;
    constructor() {
        super()
        this.IS_DENSE = true
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: null): null {
        this.__fetch = null;
        return null
    }

    set_archetype(_fetch: null, _state: null, _archetype: Archetype, _table: Table): void {

    }

    set_table(_fetch: null, _state: null, _table: Table): void {

    }

    fetch(_fetch: null, _entity: Entity, _table_row: TableRow): null {
        return _fetch
    }

    update_component_access(_state: null, _access: FilteredAccess<ComponentId>): void { }

    init_state(_world: World) {
        this.__state = null;
        return null
    }

    get_state(_components: Components): Option<null> {
        return null
    }

    matches_component_set(_state: null, _set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true;
    }

    filter_fetch(_fetch: null, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

export class QueryFilterWith extends QueryFilter<Unit, Unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): null {
        return null
    }

    set_archetype(_fetch: null, _state: number, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: null, _state: number, _table: Table): void { }

    fetch(_fetch: null, _entity: Entity, _table_row: TableRow): null {
        return _fetch
    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        access.and_with(id);
    }

    init_state(world: World) {
        const id = world.init_component(this.#ty);
        this.__state = id
        return id
    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return !set_contains_id(id)
    }

    filter_fetch(_fetch: null, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

export class QueryFilterWithout extends QueryFilter<Unit, Unit, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = is_dense(type)
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): null {
        return null
    }

    set_archetype(_fetch: null, _state: number, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: null, _state: number, _table: Table): void { }

    fetch(_fetch: null, _entity: Entity, _table_row: TableRow): null {
        return _fetch
    }

    update_component_access(id: number, access: FilteredAccess<ComponentId>): void {
        access.and_without(id);
    }

    init_state(world: World) {
        const id = world.init_component(this.#ty);
        this.__state = id
        return id
    }

    get_state(components: Components): Option<number> {
        return components.component_id(this.#ty);
    }

    matches_component_set(id: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id)
    }

    filter_fetch(_fetch: null, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

type OrFetch<T extends WorldQuery<any>> = {
    fetch: T['__fetch'];
    matches: boolean;
}

export class QueryComponentsFilter<F extends QueryFilter[]> extends QueryFilter<any> {
    #data: F
    constructor(filters: F) {
        super()

        this.#data = filters;
        let is_a = 1;
        let is_d = 1;
        filters.forEach(f => {
            // @ts-expect-error
            is_a &= f.IS_ARCHETYPAL
            // @ts-expect-error
            is_d &= f.IS_DENSE;

        })
        this.IS_ARCHETYPAL = Boolean(is_a);
        this.IS_DENSE = Boolean(is_d);
    }

    IS_ARCHETYPAL: boolean;
    IS_DENSE: boolean;

    init_fetch(world: World, state: any): any {
        const filters: any[] = []
        for (let i = 0; i < state.length; i++) {
            const filter = this.#data[i];
            filters.push({
                fetch: filter.init_fetch(world, state),
                matches: false
            })
        }
        this.__fetch = filters as any;
        return filters;
    }

    set_table(fetch: any, state: any, table: Table): void {
        for (let i = 0; i < state.length; i++) {
            const filter = this.#data[i];
            fetch[i].matches = filter.matches_component_set(state[i], id => table.has_column(id))
            if (fetch[i].matches) {
                filter.set_table(filter.__fetch, state[i], table)
            }
        }
    }

    set_archetype(fetch: any, state: any, archetype: Archetype, table: Table): void {
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
            if (!this.#data[i].filter_fetch(fetch[i], entity, table_row)) {
                return false
            }
        }

        return true
    }

    update_component_access(state: any, access: FilteredAccess<ComponentId>): void {
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
            state.push(this.#data[i].init_state(world))
        }

        return state;
    }

    get_state(components: Components): Option<null> {
        const s = [];
        for (let i = 0; i < this.#data.length; i++) {
            s.push(this.#data[i].get_state(components))
        }
        return s as any;
    }

    matches_component_set(state: any, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        // filter is a no op, so it matches everything
        if (this.#data.length === 0) {
            return true;
        }

        let matches = false;

        for (let i = 0; i < state.length; i++) {
            // @ts-expect-error
            matches ^= this.#data[i].matches_component_set(state[i], set_contains_id)
        }
        return Boolean(!matches);
    }


    filter_fetch(fetch: any, entity: Entity, table_row: number): boolean {
        return this.fetch(fetch, entity, table_row);
    }
}

export function Without<T extends Component>(type: T) {
    return new QueryFilterWithout(type)
}

export function With<T extends Component>(type: T) {
    return new QueryFilterWith(type);
}