import { Option } from "joshkaposh-option";
import { UNIT, type Unit } from "../../util";
import { Archetype } from "../archetype";
import { Component, ComponentId } from "../component";
import { Entity } from "../entity";
import { StorageType } from "../storage";
import { Table, TableRow } from "../storage/table";
import { World } from "../world";
import { FilteredAccess } from "./access";
import { type WorldQuery } from "./world-query";
import { ComponentSparseSet } from "../storage/sparse-set";

export interface QueryFilter<Item extends {}, Fetch = Unit, State = Unit> extends WorldQuery<Item, Fetch, State> {
    readonly IS_ARCHETYPAL: boolean;

    filter_fetch(fetch: Fetch, entity: Entity, table_row: TableRow): boolean;
}

export class With<T extends Component> implements QueryFilter<Unit, Unit, ComponentId> {

    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;

    #type: T;

    constructor(type: T) {
        this.#type = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = true;
    }

    init_fetch(_world: World, _state: number): Unit {
        return UNIT
    }

    set_archetype(_fetch: Unit, _state: number, _archetype: Archetype, _table: Table): void {

    }

    set_table(_fetch: Unit, _state: number, _table: Table): void {

    }

    set_access(_state: number, _access: FilteredAccess<number>): void {

    }

    fetch(_fetch: Unit, _entity: Entity, _table_row: number): Unit {
        return UNIT;
    }

    update_component_access(id: number, access: FilteredAccess<number>): void {
        access.and_with(id);
    }

    init_state(world: World) {
        world.init_component(this.#type)
    }

    get_state(world: World): Option<ComponentId> {
        return world.component_id(this.#type)
    }

    matches_component_set(id: ComponentId, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(id)
    }

    filter_fetch(_fetch: Unit, _entity: Entity, _table_row: number): boolean {
        return true;
    }

}

export class Without<T extends Component> implements QueryFilter<Unit, Unit, ComponentId> {

    readonly IS_DENSE: boolean;
    readonly IS_ARCHETYPAL: boolean;
    #type: T;

    constructor(type: T) {
        this.IS_DENSE = type.storage_type === StorageType.Table;
        this.IS_ARCHETYPAL = true;
        this.#type = type;
    }

    init_fetch(_world: World, _state: ComponentId): Unit {
        return UNIT;
    }

    set_archetype(_fetch: Unit, _state: ComponentId, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: Unit, _state: ComponentId, _table: Table): void { }

    set_access(_state: ComponentId, _access: FilteredAccess<number>): void { }

    fetch(_fetch: Unit, _entity: Entity, _table_row: number): Unit {
        return UNIT
    }

    update_component_access(id: ComponentId, access: FilteredAccess<number>): void {
        access.and_without(id)
    }

    init_state(world: World) {
        world.init_component(this.#type);
    }

    get_state(world: World): Option<number> {
        return world.component_id(this.#type)
    }

    matches_component_set(id: ComponentId, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return !set_contains_id(id);
    }

    filter_fetch(_fetch: Unit, _entity: Entity, _table_row: TableRow): boolean {
        return true;
    }
}

class Or<T> { }

class OrFetch<T extends WorldQuery<{}>> {
    #fetch: any //T::Fetch;
    #matches: boolean;

    constructor(fetch: any, matches: boolean) {
        this.#fetch = fetch;
        this.#matches = matches;
    }

    clone(): OrFetch<T> {
        return new OrFetch(this.#fetch.clone(), this.#matches);
    }
}

class Added<T extends Component> {

}

class AddedFetch {
    #sparse_set: Option<ComponentSparseSet>;
    constructor(sparse_set: Option<ComponentSparseSet>) {
        this.#sparse_set = sparse_set;
    }
}
