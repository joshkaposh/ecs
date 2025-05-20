import { type Iterator, iter } from "joshkaposh-iterator";
import type { Option } from "joshkaposh-option";
import { defineEvent } from "define";
import type { ComponentId, Tick } from "./component/component.types";
import type { Entity } from "./entity";
import type { SystemMeta } from "./system";
import type { World } from "./world";
import type { Archetype } from "./archetype";
import { type StorageType, SparseSet } from "./storage";
import { EventCursor, Events } from "./event";
import { unit } from "./util";

export class RemovedComponentEntity {
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => InstanceType<typeof RemovedComponentEntity>
    constructor(public entity: Entity) { }
    clone() {
        return new RemovedComponentEntity(this.entity);
    }

    into() {
        return this.entity;
    }
}

defineEvent(RemovedComponentEntity)

export class RemovedComponentEvents {
    State!: unit;
    Item!: RemovedComponentEvents;
    #events_sets: SparseSet<Events<typeof RemovedComponentEntity>>;

    constructor(event_sets: SparseSet<Events<typeof RemovedComponentEntity>> = new SparseSet()) {
        this.#events_sets = event_sets;
    }

    update() {
        for (const [_component_id, events] of this.#events_sets.iter()) {
            events.update();
        }
    }

    iter() {
        return this.#events_sets.iter();
    }

    get(component_id: ComponentId): Option<Events<typeof RemovedComponentEntity>> {
        return this.#events_sets.get(component_id);
    }

    send(component_id: ComponentId, entity: Entity) {
        this.#events_sets
            .getOrSetWith(component_id, () => new Events(RemovedComponentEntity))
            .send(new RemovedComponentEntity(entity));
    }

    static init_state(_world: World, _system_meta: SystemMeta): unit { return unit }

    static get_param(_state: unit, _system_meta: SystemMeta, world: World, _change_tick: Tick): RemovedComponentEvents {
        return world.removedComponents;
    }

    static exec(_state: typeof unit, _system_meta: SystemMeta, _world: World): void {

    }

    static new_archetype(_state: typeof unit, _archetype: Archetype, _system_meta: SystemMeta): void {

    }

    static queue(_state: typeof unit, _system_meta: SystemMeta, _world: World): void {

    }

    static validate_param(_state: typeof unit, _system_meta: SystemMeta, _world: World) {
    }
}

export type RemovedComponentReader = EventCursor<typeof RemovedComponentEntity>
// export class RemovedComponentReader<T extends Component> {
//     constructor(reader: EventCursor<typeof RemovedComponentEntity>) { }
// }

export class RemovedComponents {
    #component_id: ComponentId;
    #reader: RemovedComponentReader;
    #event_sets: RemovedComponentEvents;

    constructor(component_id: ComponentId, reader: RemovedComponentReader, event_sets: RemovedComponentEvents) {
        this.#component_id = component_id;
        this.#reader = reader;
        this.#event_sets = event_sets;
    }

    static init_state(world: World, _system_meta: SystemMeta, component_id: ComponentId) {
        return world.removedComponents.get(component_id);
    }

    static get_param(_state: Option<Events<typeof RemovedComponentEntity>>, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return this;
    }

    static exec(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    static new_archetype(_state: any, _archetype: Archetype, _system_meta: SystemMeta): void {

    }

    static queue(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    static validate_param(_state: any, _system_meta: SystemMeta, _world: World) {
    }

    get length() {
        const events = this.events();
        return events ? this.#reader.length(events) : 0
    }

    get isEmpty() {
        const events = this.events();
        return events ? this.#reader.is_empty(events) : true;
    }

    reader(): EventCursor<typeof RemovedComponentEntity> {
        return this.#reader
    }

    events(): Option<Events<typeof RemovedComponentEntity>> {
        return this.#event_sets.get(this.#component_id);
    }

    reader_mut_with_events(): Option<[RemovedComponentReader, Events<typeof RemovedComponentEntity>]> {
        const events = this.#event_sets.get(this.#component_id);
        return events ? [this.#reader, events] as const : undefined
    }

    read(): Iterator<Entity> {
        const tuple = this.reader_mut_with_events();
        if (tuple) {
            const [reader, events] = tuple;
            return reader
                .read(events)
                .map(e => e.entity);
        }
        return iter.of();
    }

    read_with_id() {
        const tup = this.reader_mut_with_events();
        if (tup) {
            const [reader, events] = tup
            return reader
                .readWithId(events)
                .map(([entity, id]) => [entity.entity, id])
        }
        return;
    }

    clear() {
        const tuple = this.reader_mut_with_events();
        if (tuple) tuple[0].clear(tuple[1]);
    }
}

// function map_id_events([entity, id]: [RemovedComponentEntity, EventId<Entity>]): [Entity, EventId<RemovedComponentEntity>] {
//     return [entity.into(), id];
// }