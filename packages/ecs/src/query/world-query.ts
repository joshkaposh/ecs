import { type Option } from "joshkaposh-option";
import { unit } from "../util";
import { Archetype } from "../archetype";
import { Entity } from "../entity";
import { Table, type TableRow } from "../storage/table";
import { World } from "../world";
import { FilteredAccess } from "./access";
import { Component, Components, Tick, type ComponentId } from "../component";
import { StorageType } from "../storage";

export function is_dense(ty: Component) {
    return ty.storage_type === StorageType.Table
}

export abstract class WorldQuery<Item, Fetch = any, State = any> {
    __item!: Item;
    __fetch!: Fetch;
    __state!: State;

    abstract readonly IS_DENSE: boolean;

    abstract init_fetch(world: World, state: State, last_run: Tick, this_run: Tick): Fetch;

    abstract set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: Table): void;

    abstract set_table(fetch: Fetch, state: State, table: Table): void;

    set_access(_state: State, _access: FilteredAccess<ComponentId>): void { };

    abstract fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    abstract update_component_access(state: State, access: FilteredAccess<ComponentId>): void;

    abstract init_state(world: World): any;

    abstract get_state(components: Components): Option<State>;

    abstract matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};

export class NoopWorldQuery extends WorldQuery<unit, unit, unit> {

    readonly IS_DENSE = true;

    init_fetch(_world: World, _state: unit): unit {
        this.__fetch = unit;
        return unit
    }

    set_archetype(_fetch: unit, _state: unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: unit, _state: unit, _table: Table): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit {
        return unit;
    };

    update_component_access(_state: unit, _access: FilteredAccess<ComponentId>) { }

    init_state(_world: World): unit {
        this.__state = unit;
        return unit
    };

    get_state(_components: Components): unit {
        return unit
    };

    matches_component_set(_state: unit, _set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true;
    };


}