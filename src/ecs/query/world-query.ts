import { type Option } from "joshkaposh-option";
import { type Unit } from "../../util";
import { Archetype } from "../archetype";
import { Entity } from "../entity";
import { Table, type TableRow } from "../storage/table";
import { World } from "../world";
import { FilteredAccess } from "./access";
import { type ComponentId } from "../component";

export abstract class WorldQuery<Item, Fetch = Unit, State = Unit> {

    abstract readonly IS_DENSE: boolean;

    abstract init_fetch(world: World, state: State): Fetch;

    abstract set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: Table): void;

    abstract set_table(fetch: Fetch, state: State, table: Table): void;

    set_access(_state: State, _access: FilteredAccess<ComponentId>): void { };

    abstract fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    abstract update_component_access(state: State, access: FilteredAccess<ComponentId>): void;

    abstract init_state(world: World): any;

    abstract get_state(world: World): Option<State>;

    abstract matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};