import { Option, is_some } from "joshkaposh-option";
import { Archetype, Component, ComponentId, ComponentTicks, Entity, EntityLocation, StorageType, World } from "..";
import { $read_and_write, $readonly, TicksMut } from "../change_detection";

export class UnsafeEntityCell {
    #world: World;
    #entity: Entity;
    #location: EntityLocation;
    constructor(
        world: World, // ReadonlyUnsafeWorldCell
        entity: Entity,
        location: EntityLocation
    ) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    clone(): UnsafeEntityCell {
        return new UnsafeEntityCell(this.#world, this.#entity.clone(), structuredClone(this.#location))
    }

    __internal_set_location(new_location: EntityLocation) {
        this.#location = new_location;
    }

    id(): Entity {
        return this.#entity
    }

    location(): EntityLocation {
        return this.#location;
    }

    archetype(): Archetype {
        return this.#world.archetypes().get(this.#location.archetype_id)!;
    }

    world() {
        return this.#world
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId): boolean {
        return this.archetype().contains(component_id);
    }

    contains_type_id(type_id: UUID): boolean {
        const id = this.#world.components().get_id_type_id(type_id);
        if (!is_some(id)) {
            return false;
        }

        return this.contains_id(id);
    }

    get_change_ticks(type: Component): Option<ComponentTicks> {
        const component_id = this.#world.components().get_id(type)!;

        return get_ticks(this.#world, component_id, type.storage_type, this.#entity, this.#location);
    }

    get_change_ticks_by_id(component_id: ComponentId): Option<ComponentTicks> {
        const info = this.#world.components().get_info(component_id)!;
        return get_ticks(this.#world, component_id, info.storage_type(), this.#entity, this.#location);
    }


    get<T extends Component>(type: T): Option<InstanceType<T>> {
        const component_id = this.#world.components().get_id(type);
        if (!is_some(component_id)) {
            return null;
        }

        return $readonly(get_component(
            this.#world,
            component_id,
            type.storage_type,
            this.#entity,
            this.#location
        )) as InstanceType<T>;
    }

    get_mut<T extends Component>(type: T): Option<InstanceType<T>> {
        const component_id = this.#world.components().get_id(type);
        if (!is_some(component_id)) {
            return null;
        }
        const [elt, ticks] = get_component_with_ticks(
            this.#world,
            component_id,
            type.storage_type,
            this.#entity,
            this.#location
        )!

        return $read_and_write(elt, new TicksMut(ticks.added, ticks.changed, this.#world.last_change_tick(), this.#world.change_tick())) as InstanceType<T>;
    }

    get_by_id(component_id: ComponentId): Option<{}> {
        const info = this.#world.components().get_info(component_id);
        if (!info) {
            return null;
        }

        return get_component(
            this.#world,
            component_id,
            info.storage_type(),
            this.#entity,
            this.#location
        )
    }

}

export class UnsafeWorldCell { }

function get_component(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<object> {
    if (storage_type === StorageType.Table) {
        return world.storages()
            .tables
            .get(location.table_id)
            ?.get_column(component_id)
            ?.get_data_unchecked(location.table_row)
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages()
            .sparse_sets
            .get(component_id)
            ?.get(entity);
    } else {
        throw new Error(`Unreachable: ${storage_type} has to be either StorageType::Table - ${StorageType.Table} or StorageType::SparseSet - ${StorageType.SparseSet}`)
    }
}

function get_ticks(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<ComponentTicks> {
    if (storage_type === StorageType.Table) {
        return world.storages()
            .tables
            .get(location.table_id)
            ?.get_column(component_id)
            ?.get_ticks(location.table_row)
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages()
            .sparse_sets
            .get(component_id)
            ?.get_ticks(entity);
    } else {
        throw new Error(`Unreachable: ${storage_type} has to be either StorageType::Table - ${StorageType.Table} or StorageType::SparseSet - ${StorageType.SparseSet}`)
    }
}


function get_component_with_ticks(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<[{}, ComponentTicks]> {
    if (storage_type === StorageType.Table) {
        return world.storages()
            .tables
            .get(location.table_id)
            ?.get_column(component_id)
            ?.get_with_ticks(location.table_row)
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages()
            .sparse_sets
            .get(component_id)
            ?.get_with_ticks(entity);
    } else {
        throw new Error(`Unreachable: ${storage_type} has to be either StorageType::Table - ${StorageType.Table} or StorageType::SparseSet - ${StorageType.SparseSet}`)
    }
}
