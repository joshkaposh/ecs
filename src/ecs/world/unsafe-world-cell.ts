import { Option, is_none, is_some } from "joshkaposh-option";
import { Archetype, Component, ComponentId, ComponentTicks, Entity, EntityLocation, QueryDataTuple, RemapToInstance, StorageType, TickCells, World } from "..";
import { $read_and_write, $readonly, Ref, Ticks, TicksMut } from "../change_detection";
import { fetch_table, fetch_sparse_set } from "./world";

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

        return get_ticks_inner(this.#world, component_id, type.storage_type, this.#entity, this.#location);
    }

    get_change_ticks_by_id(component_id: ComponentId): Option<ComponentTicks> {
        const info = this.#world.components().get_info(component_id)!;
        return get_ticks_inner(this.#world, component_id, info.storage_type(), this.#entity, this.#location);
    }


    get<T extends Component>(type: T): Option<InstanceType<T>> {
        const component_id = this.#world.components().get_id(type);
        if (!is_some(component_id)) {
            return;
        }

        const component = get_component_inner(
            this.#world,
            component_id,
            type.storage_type,
            this.#entity,
            this.#location
        )

        if (!component) {
            return
        }

        return $readonly(component) as InstanceType<T>;
    }

    get_mut<T extends Component>(type: T): Option<InstanceType<T>> {
        const world = this.#world;
        const component_id = world.components().get_id(type);
        if (typeof component_id !== 'number') {
            return;
        }
        const last_change_tick = world.last_change_tick();
        const change_tick = world.change_tick();

        const tup = get_component_and_ticks_inner(
            world,
            component_id,
            type.storage_type,
            this.#entity,
            this.#location
        )
        if (!tup) {
            return
        }
        const [value, cells] = tup;

        return $read_and_write(value,
            new TicksMut(
                cells.added,
                cells.changed,
                last_change_tick,
                change_tick
            )) as InstanceType<T>;
    }

    get_by_id<T extends Component>(component_id: ComponentId): Option<InstanceType<T>> {
        const info = this.#world.components().get_info(component_id);
        if (!info) {
            return null;
        }

        return get_component_inner(
            this.#world,
            component_id,
            info.storage_type(),
            this.#entity,
            this.#location
        ) as InstanceType<T>;
    }

    get_mut_by_id<T extends Component>(component_id: ComponentId): Option<InstanceType<T>> {
        const info = this.#world.components().get_info(component_id);
        if (!info) {
            return null;
        }

        return get_component_inner(
            this.#world,
            component_id,
            info.storage_type(),
            this.#entity,
            this.#location
        )
    }

    get_components<Q extends readonly any[]>(query: Q): Option<RemapToInstance<Q>> {
        const world = this.#world;
        const q = QueryDataTuple.from_data(query)
        const state = q.get_state(world.components());

        const location = this.#location;
        const archetype = world.archetypes().get(location.archetype_id)!;

        if (q.matches_component_set(state, id => archetype.contains(id))) {
            const fetch = q.init_fetch(
                world,
                state,
                world.last_change_tick(),
                world.change_tick()
            );

            const table = world
                .storages()
                .tables
                .get(location.table_id)!;

            q.set_archetype(fetch, state, archetype, table);

            return q.fetch(fetch, this.#entity, location.table_row) as RemapToInstance<Q>;
        }
        return
    }

    get_ref<T extends Component>(type: T): Option<Ref<InstanceType<T>>> {
        const world = this.#world;
        const last_change_tick = world.last_change_tick();
        const change_tick = world.change_tick();
        const component_id = world.components().get_id(type);
        if (is_none(component_id)) {
            return
        }

        const tuple = get_component_and_ticks_inner(world, component_id, type.storage_type, this.#entity, this.#location);
        if (!tuple) {
            return
        }
        const [value, cells] = tuple;

        return new Ref(value as InstanceType<T>, Ticks.from_tick_cells(cells, last_change_tick, change_tick));
    }
}


export function unsafe_entity_cell_get_mut_by_id<T extends Component>(world: World, entity: Entity, loc: EntityLocation, component_id: ComponentId): Option<InstanceType<T>> {
    const info = world.components().get_info(component_id);
    if (!info) {
        return null;
    }

    return get_component_inner(
        world,
        component_id,
        info.storage_type(),
        entity,
        loc
    )
}

export function unsafe_entity_cell_get_change_ticks_by_id(world: World, entity: Entity, loc: EntityLocation, component_id: ComponentId): Option<ComponentTicks> {
    const info = world.components().get_info(component_id)!;
    return get_ticks_inner(world, component_id, info.storage_type(), entity, loc);

}

export function unsafe_entity_cell_contains_type_id(world: World, loc: EntityLocation, type_id: UUID): boolean {
    const id = world.components().get_id_type_id(type_id);
    if (!is_some(id)) {
        return false;
    }

    return unsafe_entity_cell_contains_id(world, loc, id);
}

export function unsafe_entity_cell_contains(world: World, loc: EntityLocation, component: Component): boolean {
    return unsafe_entity_cell_contains_type_id(world, loc, component.type_id);
}

export function unsafe_entity_cell_contains_id(
    world: World,
    loc: EntityLocation,
    component_id: ComponentId
): boolean {
    return unsafe_entity_cell_archetype(world, loc).contains(component_id);

}

export function unsafe_entity_cell_archetype(world: World, loc: EntityLocation) {
    return world.archetypes().get(loc.archetype_id)!;

}

export function unsafe_entity_cell_get_change_ticks(world: World, entity: Entity, loc: EntityLocation, type: Component): Option<ComponentTicks> {
    const component_id = world.components().get_id(type)!;

    return get_ticks_inner(world, component_id, type.storage_type, entity, loc);

}

export function unsafe_entity_cell_get_ref<T extends Component>(world: World, entity: Entity, loc: EntityLocation, component: T) {
    const last_change_tick = world.last_change_tick();
    const change_tick = world.change_tick();
    const component_id = world.components().get_id(component);
    if (is_none(component_id)) {
        return
    }

    const tuple = get_component_and_ticks_inner(world, component_id, component.storage_type, entity, loc);
    if (!tuple) {
        return
    }
    const [value, cells] = tuple;

    return new Ref(value as InstanceType<T>, Ticks.from_tick_cells(cells, last_change_tick, change_tick));
}

export function unsafe_entity_cell_components<Q extends readonly any[]>(world: World, entity: Entity, loc: EntityLocation, query: Q): RemapToInstance<Q> {
    const components = unsafe_entity_cell_get_components(world, entity, loc, query);
    if (!components) throw new Error('Query Mismatch Error')
    return components;
}

export function unsafe_entity_cell_get_components<Q extends readonly any[]>(world: World, entity: Entity, location: EntityLocation, query: Q): Option<RemapToInstance<Q>> {
    const q = QueryDataTuple.from_data(query)
    const state = q.get_state(world.components());

    const archetype = world.archetypes().get(location.archetype_id)!;

    if (q.matches_component_set(state, id => archetype.contains(id))) {
        const fetch = q.init_fetch(
            world,
            state,
            world.last_change_tick(),
            world.change_tick()
        );

        const table = world
            .storages()
            .tables
            .get(location.table_id)!;

        q.set_archetype(fetch, state, archetype, table);

        return q.fetch(fetch, entity, location.table_row) as RemapToInstance<Q>;
    }
    return
}

export function unsafe_entity_cell_get<T extends Component>(world: World, entity: Entity, loc: EntityLocation, type: T): Option<InstanceType<T>> {
    const component_id = world.components().get_id(type);
    if (!is_some(component_id)) {
        return;
    }

    const component = get_component_inner(
        world,
        component_id,
        type.storage_type,
        entity,
        loc
    )

    if (!component) {
        return
    }

    return $readonly(component) as InstanceType<T>;
}

export function unsafe_entity_cell_get_by_id<T extends Component>(world: World, entity: Entity, loc: EntityLocation, component_id: ComponentId): Option<InstanceType<T>> {
    const info = world.components().get_info(component_id);
    if (!info) {
        return null;
    }

    return get_component_inner(
        world,
        component_id,
        info.storage_type(),
        entity,
        loc
    ) as InstanceType<T>;
}

export function unsafe_entity_cell_get_mut<T extends Component>(world: World, entity: Entity, loc: EntityLocation, type: T): Option<InstanceType<T>> {
    const component_id = world.components().get_id(type);
    if (typeof component_id !== 'number') {
        return;
    }
    const last_change_tick = world.last_change_tick();
    const change_tick = world.change_tick();

    const tup = get_component_and_ticks_inner(
        world,
        component_id,
        type.storage_type,
        entity,
        loc
    )
    if (!tup) {
        return
    }
    const [value, cells] = tup;

    return $read_and_write(value,
        new TicksMut(
            cells.added,
            cells.changed,
            last_change_tick,
            change_tick
        )) as InstanceType<T>;
}


function get_component_inner<T extends Component>(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<InstanceType<T>> {
    if (storage_type === StorageType.Table) {
        return world.storages()
            .tables
            .get(location.table_id)?.get_component(component_id, location.table_row) as Option<InstanceType<T>>
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages()
            .sparse_sets
            .get(component_id)
            ?.get(entity) as Option<InstanceType<T>>;
    }

    throw new Error(`Unreachable: ${storage_type} has to be either StorageType::Table - ${StorageType.Table} or StorageType::SparseSet - ${StorageType.SparseSet}`)
}

function get_ticks_inner(
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

function get_component_and_ticks_inner<T extends Component>(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<[InstanceType<T>, TickCells]> {
    if (storage_type === StorageType.Table) {
        const table = fetch_table(world, location);
        if (!table) {
            return
        }
        const value = table.get_component(component_id, location.table_row);
        if (!value) {
            return
        }


        return [value as InstanceType<T>, new TickCells(
            table.get_added_tick(component_id, location.table_row)!,
            table.get_changed_tick(component_id, location.table_row)!
        )]
    } else {
        return fetch_sparse_set(world, component_id)?.get_with_ticks(entity);
    }
}
