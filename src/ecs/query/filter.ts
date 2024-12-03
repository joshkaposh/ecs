import { Unit } from "joshkaposh-index-map";
import { WorldQuery } from "./world-query";
import { Entity } from "../entity";
import { Archetype, Component, ComponentId, Components, FilteredAccess, StorageType, World } from "..";
import { Table, TableRow } from "../storage/table";
import { Option } from "joshkaposh-option";

export type QueryFilterType<Fetch> = {
    readonly IS_ARCHETYPAL: boolean;
    filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}
export interface QueryFilter<Item = Unit, Fetch = Unit, State = Unit> extends WorldQuery<Item, Fetch, State> {
    readonly IS_ARCHETYPAL: boolean;
    filter_fetch(fetch: Fetch, entity: Entity, table_row: number): boolean;
}

export class EmptyQueryFilter extends WorldQuery<Unit, Unit, Unit> {
    readonly IS_ARCHETYPAL = true
    readonly IS_DENSE: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table
    }

    init_fetch(_world: World, _state: null): null {
        return null
    }

    set_archetype(_fetch: null, _state: null, _archetype: Archetype, _table: Table): void {

    }

    set_table(_fetch: null, _state: null, _table: Table): void {

    }

    fetch(_fetch: null, _entity: Entity, _table_row: TableRow): null {
        return _fetch
    }

    update_component_access(_state: null, _access: FilteredAccess<ComponentId>): void {

    }

    init_state(_world: World) {
        this.__state = null;
        return null
    }

    get_state(_components: Components): Option<null> {
        return null
    }

    matches_component_set(state: null, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true;
    }

    filter_fetch(_fetch: null, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

export class With extends WorldQuery<Unit, Unit, ComponentId> implements QueryFilter<Unit, Unit, ComponentId> {
    readonly IS_ARCHETYPAL = true
    readonly IS_DENSE: boolean;
    #ty: Component;
    constructor(type: Component) {
        super()
        this.#ty = type;
        this.IS_DENSE = type.storage_type === StorageType.Table
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
        return set_contains_id(id)
    }

    filter_fetch(_fetch: null, _entity: Entity, _table_row: number): boolean {
        return true
    }
}

export class QueryComponentsFilter<F extends QueryFilter[]> extends WorldQuery<F[number]> implements QueryFilterType<any> {
    #data: F
    constructor(data: Component[]) {
        super()
        this.#data = data as any;
    }

    IS_ARCHETYPAL = true;
    IS_DENSE = true;


    filter_fetch(_fetch: any, _entity: Entity, _table_row: number): boolean {
        return true
    }

    init_fetch(_world: World, _state: any): any {
        return [] as any;
    }

    set_archetype(_fetch: any, _state: any, _archetype: Archetype, _table: Table): void {
        for (let i = 0; i < _fetch.length; i++) {
            const name = _fetch[i];
            const state = _state[i];
            // @ts-expect-error
            name[1] = name[0].matches_component_set(state, (id) => _archetype.contains(id))
            if (name[1]) {
                name[0].set_archetype(name[0], state, _archetype, _table)
            }
        }
    }

    set_table(_fetch: any, _state: any, _table: Table): void {
        for (let i = 0; i < _fetch.length; i++) {
            const name = _fetch[i];
            const state = _state[i];
            name[1] = name[0].matches_component_set(state)
            if (name[1]) {
                name[0].set_table(name[0], state, _table)
            }
        }
    }

    // @ts-expect-error
    fetch(_fetch: any, _entity: Entity, _table_row: number): [any, boolean][] {
        return [];
        // const items: [any, boolean][] = [];
        // for (let i = 0; i < _fetch.length; i++) {
        //     const name = _fetch[i];
        //     if (name[1]) {
        //         items.push(name[0].fetch(name[0], _entity, _table_row));
        //     }
        // }
        // return items
    }

    update_component_access(_state: any, access: FilteredAccess<ComponentId>): void {

        // const _new_access = FilteredAccess.matches_nothing();
        // for (let i = 0; i < _state.length; i++) {
        //     const [name] = _state;
        //     const intermediate = access.clone();
        //     name[0].update_component_access(name[0], intermediate);
        //     _new_access.append_or(intermediate);
        // }

        // access.__filter_sets = _new_access.__filter_sets;
    }

    init_state(world: World): any[] {
        // const state: any[] = [];
        // this.__state = state as any;
        // for (let i = 0; i < this.__state.length; i++) {
        //     state.push(this.__state[i].init_state(world));
        // }
        // return state;
        return [];
    }

    // @ts-expect-error
    get_state(components: Components): Option<typeof UNIT> {
        return null
    }

    matches_component_set(state: any, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true
    }
}