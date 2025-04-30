import { type Option, is_none } from "joshkaposh-option";
import { type World, type Component, type ComponentId, type Entity, type EntityLocation, type RemapQueryTupleToQueryData, type Tick, ComponentTicks, QueryDataTuple, StorageType, RemapToQueryItem } from "..";
import { $readonly, Mut, Ref, Ticks, TicksMut } from "../change_detection";
import { fetchTable, fetchSparseSet } from "./world";

export function get_mut_using_ticks<T extends Component>(
    world: World,
    entity: Entity,
    location: EntityLocation,
    type: T,
    last_change_tick: Tick,
    change_tick: Tick
): Option<Mut<T>> {
    const component_id = world.components.getId(type);
    if (typeof component_id !== 'number') {
        return
    }
    const tuple = get_component_and_ticks_inner<T>(world, component_id, type.storage_type, entity, location);
    if (!tuple) {
        return
    }
    const [value, cells] = tuple;
    return new Mut(value, TicksMut.fromTickCells(cells, last_change_tick, change_tick))
}

export function unsafe_entity_cell_get_mut_by_id<T extends Component>(world: World, entity: Entity, location: EntityLocation, component_id: ComponentId): Option<Mut<T>> {
    const info = world.components.getInfo(component_id);
    if (!info) {
        return null
    }

    const tuple = get_component_and_ticks_inner<T>(
        world,
        component_id,
        info.storageType,
        entity,
        location
    );
    if (!tuple) {
        return null
    }

    const [value, cells] = tuple;
    return new Mut(value, TicksMut.fromTickCells(cells, world.lastChangeTick, world.changeTick))
}

export function unsafe_entity_cell_get_change_ticks_by_id(world: World, entity: Entity, loc: EntityLocation, component_id: ComponentId): Option<ComponentTicks> {
    const info = world.components.getInfo(component_id)!;
    return get_ticks_inner(world, component_id, info.storageType, entity, loc);

}

export function unsafe_entity_cell_contains_type_id(world: World, loc: EntityLocation, type_id: UUID): boolean {
    const id = world.components.getIdTypeId(type_id);
    if (id == null) {
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
    return unsafe_entity_cell_archetype(world, loc).has(component_id);

}

export function unsafe_entity_cell_archetype(world: World, loc: EntityLocation) {
    return world.archetypes.get(loc.archetype_id)!;

}

export function unsafe_entity_cell_get_change_ticks(world: World, entity: Entity, loc: EntityLocation, type: Component): Option<ComponentTicks> {
    const component_id = world.components.getId(type)!;

    return get_ticks_inner(world, component_id, type.storage_type, entity, loc);

}

export function unsafe_entity_cell_get_ref<T extends Component>(world: World, entity: Entity, loc: EntityLocation, component: T) {
    const last_change_tick = world.lastChangeTick;
    const change_tick = world.changeTick;
    const component_id = world.components.getId(component);
    if (is_none(component_id)) {
        return
    }

    const tuple = get_component_and_ticks_inner(world, component_id, component.storage_type, entity, loc);
    if (!tuple) {
        return
    }
    const [value, cells] = tuple;

    return new Ref(value as InstanceType<T>, Ticks.fromTickCells(cells, last_change_tick, change_tick));
}

export function unsafe_entity_cell_components<Q extends readonly any[]>(world: World, entity: Entity, loc: EntityLocation, query: Q): RemapToQueryItem<Q> {
    const components = unsafe_entity_cell_get_components(world, entity, loc, query);
    if (!components) throw new Error('Query Mismatch Error');
    return components;
}

export function unsafe_entity_cell_get_components<Q extends readonly any[]>(world: World, entity: Entity, location: EntityLocation, query: Q): Option<RemapToQueryItem<Q>> {
    const q = new QueryDataTuple(query);

    const state = q.get_state(world.components);

    const archetype = world.archetypes.get(location.archetype_id)!;

    if (q.matches_component_set(state, id => archetype.has(id))) {
        const fetch = q.init_fetch(
            world,
            state,
            world.lastChangeTick,
            world.changeTick
        );

        const table = world
            .storages
            .tables
            .get(location.table_id)!;

        q.set_archetype(fetch, state, archetype, table);

        return q.fetch(fetch, entity, location.table_row) as RemapToQueryItem<Q>;
    }
    return
}

export function unsafe_entity_cell_get<T extends Component>(world: World, entity: Entity, loc: EntityLocation, type: T): Option<InstanceType<T>> {
    const component_id = world.components.getId(type);

    if (component_id == null) {
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

    return $readonly(component as Component) as InstanceType<T>;
}

export function unsafe_entity_cell_get_by_id<T extends Component>(world: World, entity: Entity, loc: EntityLocation, component_id: ComponentId): Option<InstanceType<T>> {
    const info = world.components.getInfo(component_id);
    if (!info) {
        return null;
    }

    return get_component_inner(
        world,
        component_id,
        info.storageType,
        entity,
        loc
    ) as InstanceType<T>;
}

export function unsafe_entity_cell_get_mut<T extends Component>(world: World, entity: Entity, loc: EntityLocation, type: T): Option<Mut<T>> {
    const component_id = world.components.getId(type);
    if (typeof component_id !== 'number') {
        return;
    }
    const last_change_tick = world.lastChangeTick;
    const change_tick = world.changeTick;

    const tup = get_component_and_ticks_inner<T>(
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

    return new Mut(value, TicksMut.fromTickCells(cells, last_change_tick, change_tick))
    // return $read_and_write(value,
    // new TicksMut(
    //     cells.added,
    //     cells.changed,
    //     last_change_tick,
    //     change_tick
    // )) as InstanceType<T>;
}

function get_component_inner<T extends Component>(
    world: World,
    component_id: ComponentId,
    storage_type: StorageType,
    entity: Entity,
    location: EntityLocation
): Option<InstanceType<T>> {
    if (storage_type === StorageType.Table) {
        return world
            .storages
            .tables
            .get(location.table_id)?.getComponent(component_id, location.table_row) as Option<InstanceType<T>>
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages
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
        return world
            .storages
            .tables
            .get(location.table_id)
            ?.getColumn(component_id)
            ?.getTicks(location.table_row)
    } else if (storage_type === StorageType.SparseSet) {
        return world
            .storages
            .sparse_sets
            .get(component_id)
            ?.getTicks(entity);
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
): Option<[InstanceType<T>, ComponentTicks]> {
    if (storage_type === StorageType.Table) {
        const table = fetchTable(world, location);
        if (!table) {
            return
        }

        const table_row = location.table_row;
        const value = table.getComponent(component_id, table_row);

        if (!value) {
            return
        }

        return [value as InstanceType<T>, new ComponentTicks(
            table.getAddedTick(component_id, table_row)!,
            table.getChangedTick(component_id, table_row)!
        )]
    } else {
        return fetchSparseSet(world, component_id)?.getWithTicks(entity);
    }
}
