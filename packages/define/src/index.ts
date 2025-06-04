import { v4 } from 'uuid';
import { Events, StorageType, type Event, type WorldQuery, type Tick, type RequiredWorldQuery, type World, type SystemParam, type SystemMeta, type DeferredWorld, type Archetype, EntityFetchError, HookContext } from 'ecs';
import type { Plugin, App } from 'ecs-app';
import { RelationshipHookMode, type Relationship, type RelationshipProps } from 'ecs/src/relationship';

export * from './component';
export * from './system';
export * from './set';

export function defineRelationship<T>(relationship: RelationshipProps<T>): Relationship<T> {
    relationship.onInsert ??= function onInsert(world: DeferredWorld, context: HookContext) {
        const { entity, relationship_hook_mode } = context;
        if (relationship_hook_mode === RelationshipHookMode.Run) {

        } else if (relationship_hook_mode === RelationshipHookMode.Skip) {
            return;
        } else {
            // RelationshipHookMode.RunIfNotLinked
            if (this.RelationshipTarget.LINKED_SPAWN) {
                return
            }
        }

        const target_entity = world.entity(entity);
        if (target_entity.id === entity) {
            console.warn(`The ({${this}}) ${target_entity} relationship on entity ${entity} points to itself.  The invalid `);
            world.commands.entity(entity).remove(this as any);
            return
        }

        const target_entity_mut = world.getEntityMut(target_entity as any) as any;

        if (!(target_entity_mut instanceof EntityFetchError)) {
            const relationship_target = target_entity_mut.getMut(this.RelationshipTarget);
            relationship_target.collection_mut_risky().add(entity);
        }

    }

    relationship.onReplace ??= function onReplace(_world: DeferredWorld, _context: HookContext) {

    }

    return relationship as Relationship<T>;
}


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

const $PARAM_INTERNAL = Symbol('SystemParam');

export function defineSystemParam<T extends Record<PropertyKey, any>>(type: T & Partial<SystemParam>): T & Required<SystemParam> {
    if (!(type && typeof type === 'object')) {
        throw new Error(`Invalid \`SystemParam\` type: expected a class or object`);
    }

    const fields = Object.values(type).filter(v => $PARAM_INTERNAL in v);
    type.init_state ??= function init_state(world: World, system_meta: SystemMeta) {
        for (let i = 0; i < fields.length; i++) {
            fields[i].init_state(world, system_meta);
        }
    }
    type.get_param ??= function get_param(state: any, meta: SystemMeta, world: World, change_tick: Tick) {
        for (let i = 0; i < fields.length; i++) {
            fields[i].get_param(state, meta, world, change_tick);
        }

    }
    type.new_archetype ??= function new_archetype(state: any, archetype: Archetype, meta: SystemMeta) {
        for (let i = 0; i < fields.length; i++) {
            fields[i].new_archetype(state, archetype, meta);
        }

    }
    type.validate_param ??= function validate_param(state: any, meta: SystemMeta, world: World) {
        for (let i = 0; i < fields.length; i++) {
            const ret = fields[i].validate_param(state, meta, world);
            if (ret) {
                return ret;
            }
        }

        return

    }
    type.exec ??= function exec(state: any, meta: SystemMeta, world: World) {
        for (let i = 0; i < fields.length; i++) {
            fields[i].exec!(state, meta, world);
        }

    }
    type.queue ??= function queue(state: any, meta: SystemMeta, world: DeferredWorld) {
        for (let i = 0; i < fields.length; i++) {
            fields[i].queue(state, meta, world);
        }
    }

    return type as T & Required<SystemParam>;
}

export function definePlugin<T extends Plugin>(plugin: Partial<T> & { build(app: App): void; name: string }): Required<Plugin> & T {
    // @ts-expect-error
    plugin.type_id ??= v4() as UUID;

    plugin.ready ??= function ready(_app: App) {
        return true
    }

    plugin.finish ??= function finish(_app: App) { }

    plugin.cleanup ??= function cleanup(_app: App) { }

    plugin.isUnique ??= function isUnique() {
        return true;
    }
    plugin.addToApp ??= function addToApp(app: App) {
        try {
            app.addPlugin(this as Required<Plugin>);
        } catch (error) {
            throw new Error(`Error adding plugin ${this.name} : plugin was already added in application`);
        }
    }

    return plugin as Required<Plugin> & T;
}