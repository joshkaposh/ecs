import { Option } from "joshkaposh-iterator";
import { UNIT, Unit } from "../../util";
import { Archetype } from "../archetype";
import { Entity, EntityRef } from "../entity";
import { Table, TableRow } from "../storage/table";
import { EntityWorldMut, World } from "../world";
import { FilteredAccess } from "./access";
import { WorldQuery } from "./world-query";
import { assert } from "joshkaposh-iterator/src/util";
import { Component, ComponentId } from "../component";
import { ComponentSparseSet } from "../storage/sparse-set";
import { StorageType } from "../storage";

export type QueryData<Item extends {}, Fetch = Unit, State = Unit> = WorldQuery<Item, Fetch, State>;

export type ReadonlyQueryData<Item extends Readonly<{}>, Fetch = Unit, State = Unit> = QueryData<Item, Fetch, State>

//@ts-expect-error
export type QueryItem<T> = any;

// @ts-expect-error
export type ROQueryItem<T> = any;

class WorldQueryEntity extends WorldQuery<Entity, Unit, Unit> {
    readonly IS_DENSE = true;

    init_fetch(_world: World, _state: Unit): Unit {
        return UNIT
    }

    set_archetype(_fetch: Unit, _state: Unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: Unit, _state: Unit, _table: Table): void { }

    fetch(_fetch: Unit, entity: Entity, _table_row: number): Entity {
        return entity
    }

    update_component_access(_state: Unit, _access: FilteredAccess<number>): void { }

    init_state(_world: World) { }

    get_state(_world: World): Option<Unit> {
        return UNIT
    }

    matches_component_set(_state: Unit, _set_contains_id: (component_id: number) => boolean): boolean {
        return true
    }
}

class WorldQueryEntityRef extends WorldQuery<EntityRef, World, Unit> {
    readonly IS_DENSE = true;

    init_fetch(world: World, _state: Unit): World {
        return world
    }

    set_archetype(_fetch: World, _state: Unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: World, _state: Unit, _table: Table): void { }

    fetch(world: World, entity: Entity, _table_row: number): EntityRef {
        return world.get_entity(entity)!
    }

    update_component_access(_state: Unit, access: FilteredAccess<number>): void {
        assert(access.access().has_any_write());
        access.read_all();
    }

    init_state(_world: World) { }

    get_state(_world: World): Option<Unit> {
        return UNIT
    }

    matches_component_set(_state: Unit, _set_contains_id: (component_id: number) => boolean): boolean {
        return true
    }
}

class WorldQueryEntityMut extends WorldQuery<EntityWorldMut, World, Unit> {
    readonly IS_DENSE = true;

    init_fetch(world: World, _state: Unit): World {
        return world
    }

    set_archetype(_fetch: World, _state: Unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: World, _state: Unit, _table: Table): void { }

    fetch(world: World, entity: Entity, _table_row: number): EntityWorldMut {
        return world.get_entity_mut(entity)!
    }

    update_component_access(_state: Unit, access: FilteredAccess<number>): void {
        assert(!access.access().has_any_read());

        access.write_all();
    }

    init_state(_world: World) { }

    get_state(_world: World): Option<Unit> {
        return UNIT
    }

    matches_component_set(_state: Unit, _set_contains_id: (component_id: number) => boolean): boolean {
        return true
    }
}

export interface ReadFetch {
    table_components: Option<InstanceType<Component>>;
    sparse_set: Option<ComponentSparseSet>;
}

// TODO: make static
class WorldQueryComponent<T extends Component> extends WorldQuery<T, ReadFetch, ComponentId> {
    #type: Component;
    constructor(type: Component) {
        super();
        this.#type = type;
        this.IS_DENSE = this.#type.storage_type === StorageType.Table ? true : false
    }

    init_fetch(world: World, component_id: ComponentId) {
        const info = world.components().get_info(component_id)!;

        return {
            table_components: null,
            sparse_set: info.storage_type() === StorageType.SparseSet ? world.storages().sparse_sets.get(component_id) : null
        }
    }

    readonly IS_DENSE: boolean;
    //match T::Storage_Type {
    // StorageType::Table => true,
    // StorageType::SparseSet => false,
    // }

    set_archetype(fetch: ReadFetch, component_id: ComponentId, archetype: Archetype, table: Table) {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: ReadFetch, component_id: ComponentId, table: Table) {
        // TODO WorldQueryComponent::set_table()
        fetch.table_components = table
            // @ts-expect-error
            .get_column(component_id)!.get_data_slice().into()
    }

    fetch(fetch: ReadFetch, entity: Entity, table_row: TableRow): InstanceType<T> {
        return this.#type.storage_type === StorageType.Table ?
            fetch.table_components!.get(table_row)! :
            fetch.sparse_set!.get(entity)!
    }

    update_component_access(component_id: ComponentId, access: FilteredAccess<ComponentId>): void {
        assert(!access.access().has_write(component_id));
        // "&{} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.",
        access.add_read(component_id);
    }

    init_state(world: World): void {
        world.init_component(this.#type);
    }

    get_state(world: World): Option<number> {
        return world.component_id(this.#type);
    }

    matches_component_set(component_id: ComponentId, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(component_id)
    }

}

interface WriteFetch<T> {
    table_data: Option<T>;
    sparse_set: Option<ComponentSparseSet>;
}

class WorldQueryComponentMut<T extends Component> extends WorldQuery<T, WriteFetch<T>, ComponentId> {
    #type: T;
    constructor(type: T) {
        super();
        this.#type = type;
        this.IS_DENSE = this.#type.storage_type === StorageType.Table ? true : false
    }

    init_fetch(world: World, component_id: ComponentId): WriteFetch<T> {
        return {
            table_data: null,
            sparse_set: this.#type.storage_type === StorageType.SparseSet ? world
                .storages()
                .sparse_sets
                .get(component_id)! : null
        }
    }

    readonly IS_DENSE: boolean;

    set_archetype(fetch: WriteFetch<T>, component_id: ComponentId, archetype: Archetype, table: Table) {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: WriteFetch<T>, component_id: ComponentId, table: Table) {
        const column = table.get_column(component_id)!;
        fetch.table_data = column as any;
    }

    fetch(fetch: WriteFetch<T>, entity: Entity, table_row: TableRow): T {
        if (this.#type.storage_type === StorageType.Table) {
            const table_components = fetch.table_data;
            // @ts-expect-error
            //TODO: Mut
            return new Mut(table_components.get_data(table_row))
        } else {
            const component = fetch.sparse_set!.get(entity)
            // @ts-expect-error
            return new Mut(component)
        }

        // return this.#type.storage_type === StorageType.Table ?
        //     fetch.table_components!.get(table_row)! :
        //     fetch.sparse_set!.get(entity)!
    }

    update_component_access(component_id: ComponentId, access: FilteredAccess<ComponentId>): void {
        assert(!access.access().has_read(component_id));
        // "&{} conflicts with a previous access in this query. Shared access cannot coincide with exclusive access.",
        access.add_write(component_id);
    }

    init_state(world: World): void {
        world.init_component(this.#type);
    }

    get_state(world: World): Option<number> {
        return world.component_id(this.#type);
    }

    matches_component_set(component_id: ComponentId, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(component_id)
    }
}

export class Has<T extends Component> extends WorldQuery<boolean, { value: boolean }, ComponentId> {
    #type: T;
    readonly IS_DENSE: boolean;
    constructor(type: T) {
        super()
        this.#type = type;
        this.IS_DENSE = type.storage_type === StorageType.Table;
    }

    init_fetch(_world: World, _component_id: number): { value: boolean } {
        return { value: false };
    }

    set_archetype(fetch: { value: boolean }, component_id: number, archetype: Archetype, _table: Table): void {
        fetch.value = archetype.contains(component_id);
    }

    set_table(_fetch: { value: boolean; }, _state: number, _table: Table): void {

    }

    fetch(fetch: { value: boolean; }, _entity: Entity, _table_row: number): boolean {
        return fetch.value
    }

    update_component_access(component_id: number, access: FilteredAccess<number>): void {
        access.access().add_archetypal(component_id);
    }

    init_state(world: World): ComponentId {
        return world.init_component(this.#type)
    }

    get_state(world: World): Option<number> {
        return world.component_id(this.#type);
    }

    matches_component_set(_component_id: number, _set_contains_id: (component_id: number) => boolean): boolean {
        // Has<T> always matches
        return true;
    }
}



