import { v4 } from 'uuid';
import { Events, type Event, type WorldQuery, type RequiredWorldQuery, StorageType, World } from 'ecs';

export * from './component';
export * from './system';
export * from './set';

export function defineEvent<E extends new (...args: any[]) => any>(type: E & Partial<{
    type_id: UUID;
    storage_type: StorageType;
    from_world(world: World): any;
}>): Event<E> {
    type.type_id = v4() as UUID;
    type.storage_type = 1;
    type.from_world = function from_world(_world) {
        return new Events(type as unknown as Event<E>);
    }


    return type as unknown as Event<E>;
}

function set_access() { }
function set_archetype() { }
function set_table() { }

function matches_component_set() {
    return true;
}

function update_component_access() { }
function init_state<T>(): T {
    return undefined as unknown as T;
}
function get_state<T>(): T {
    return undefined as unknown as T;
}

export function defineWorldQuery<Item extends any, Fetch extends any, State extends any>(world_query: RequiredWorldQuery<Item, Fetch, State>): WorldQuery<Item, Fetch, State> {
    world_query.set_access ??= set_access;
    world_query.matches_component_set ??= matches_component_set;
    world_query.set_archetype ??= set_archetype;
    world_query.set_table ??= set_table;
    world_query.update_component_access ??= update_component_access;
    world_query.init_state ??= init_state;
    world_query.get_state ??= get_state;

    return world_query as WorldQuery<Item, Fetch, State>;
}
