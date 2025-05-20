import { type Option } from "joshkaposh-option";
import { defineWorldQuery } from "define";
import { unit } from "../util";
import { Archetype } from "../archetype";
import { Entity } from "../entity";
import { Table, type TableRow } from "../storage/table";
import { ThinWorld, World } from "../world";
import { FilteredAccess } from "./access";
import { Component, Components, ThinComponents, Tick, type ComponentId } from "../component";
import { StorageType, ThinTable } from "../storage";

export function is_dense(ty: Component) {
    return ty.storage_type === StorageType.Table
}

export interface RequiredWorldQuery<Item extends any = any, Fetch extends any = any, State extends any = any> {
    readonly [$WorldQuery]: true;
    readonly IS_DENSE: boolean;

    init_fetch(world: World, state: State, last_run: Tick, this_run: Tick): Fetch;
    fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    init_state?(world: World): State;

    get_state?(components: Components): Option<State>;

    set_archetype?(fetch: Fetch, state: State, archetype: Archetype, table: Table): void;

    set_table?(fetch: Fetch, state: State, table: Table): void;

    set_access?(_state: State, _access: FilteredAccess): void;

    update_component_access?(state: State, access: FilteredAccess): void;

    matches_component_set?(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;

}

export interface WorldQuery<Item extends any = any, Fetch extends any = any, State extends any = any> extends RequiredWorldQuery<Item, Fetch, State> {

    init_state(world: World): State;

    get_state(components: Components): Option<State>;

    set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: Table): void;

    set_table(fetch: Fetch, state: State, table: Table): void;

    set_access(_state: State, _access: FilteredAccess): void;

    update_component_access(state: State, access: FilteredAccess): void;

    matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};

export interface ThinWorldQuery<Item extends any = any, Fetch extends any = any, State extends any = any> {
    readonly [$WorldQuery]: true;
    readonly IS_DENSE: boolean;

    init_fetch(world: ThinWorld, state: State, last_run: Tick, this_run: Tick): Fetch;

    set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: ThinTable): void;

    set_table(fetch: Fetch, state: State, table: ThinTable): void;

    set_access(_state: State, _access: FilteredAccess): void;

    fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    update_component_access(state: State, access: FilteredAccess): void;

    init_state(world: ThinWorld): any;

    get_state(components: ThinComponents): Option<State>;

    matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};

export type $WorldQuery = typeof $WorldQuery;
export const $WorldQuery = Symbol('WorldQuery');

class NoopWorldQuery implements RequiredWorldQuery<unit, unit, unit> {
    readonly [$WorldQuery] = true;
    readonly IS_DENSE = true;

    init_state(): unit {
        return unit;
    }

    init_fetch(_world: World, _state: unit): unit { return unit }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit { return unit };
}

defineWorldQuery(NoopWorldQuery.prototype);

export { NoopWorldQuery }

