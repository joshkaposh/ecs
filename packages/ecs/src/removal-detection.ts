import { Option } from "joshkaposh-option";
import { Component, ComponentId, Tick } from "./component";
import { Entity } from "./entity";
import { SparseSet } from "./storage/sparse-set";
import { EventCursor, EventId, Events } from "./event";
import { SystemMeta } from "./system";
import { unit } from "./util";
import { World } from "./world";
import { iter, Iterator } from "joshkaposh-iterator";
import { Archetype } from "./archetype";
import { define_event } from "define";
import type { StorageType } from "./storage";

class RemovedComponentEntity {
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
define_event(RemovedComponentEntity)

export class RemovedComponentEvents {
    State!: unit;
    Item!: RemovedComponentEvents;
    #events_sets: SparseSet<ComponentId, Events<typeof RemovedComponentEntity>>;

    constructor(event_sets: SparseSet<ComponentId, Events<typeof RemovedComponentEntity>> = new SparseSet()) {
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
            .get_or_insert_with(component_id, () => new Events(RemovedComponentEntity))
            .send(new RemovedComponentEntity(entity));
    }

    static init_state(_world: World, _system_meta: SystemMeta): unit { return unit }

    static get_param(_state: unit, _system_meta: SystemMeta, world: World, _change_tick: Tick): RemovedComponentEvents {
        return world.removed_components()
    }

    static apply(_state: typeof unit, _system_meta: SystemMeta, _world: World): void {

    }

    static new_archetype(_state: typeof unit, _archetype: Archetype, _system_meta: SystemMeta): void {

    }

    static queue(_state: typeof unit, _system_meta: SystemMeta, _world: World): void {

    }

    static validate_param(_state: typeof unit, _system_meta: SystemMeta, _world: World): boolean {
        return true;
    }
}

// @ts-expect-error
export class RemovedComponentReader<T extends Component> {
    constructor(public reader: EventCursor<typeof RemovedComponentEntity>) { }

    static default<T extends Component>() {
        return new RemovedComponentReader<T>(new EventCursor())
    }
}
export class RemovedComponents<T extends Component> {
    State!: any;
    Item!: any;
    #component_id: ComponentId;
    #reader: RemovedComponentReader<T>;
    #event_sets: RemovedComponentEvents;

    constructor(component_id: ComponentId, reader: RemovedComponentReader<T>, event_sets: RemovedComponentEvents) {
        this.#component_id = component_id;
        this.#reader = reader;
        this.#event_sets = event_sets;
    }

    //* SystemParam methods

    static init_state(_world: World, _system_meta: SystemMeta) {

    }

    static get_param(_state: any, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return this;
    }

    static apply(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    static new_archetype(_state: any, _archetype: Archetype, _system_meta: SystemMeta): void {

    }

    static queue(_state: any, _system_meta: SystemMeta, _world: World): void {

    }

    static validate_param(_state: any, _system_meta: SystemMeta, _world: World): boolean {
        return true;
    }

    //* SystemParam methods end


    reader(): EventCursor<typeof RemovedComponentEntity> {
        return this.#reader.reader
    }

    events(): Option<Events<typeof RemovedComponentEntity>> {
        return this.#event_sets.get(this.#component_id);
    }

    reader_mut_with_events(): Option<[RemovedComponentReader<T>, Events<typeof RemovedComponentEntity>]> {
        const events = this.#event_sets.get(this.#component_id);
        return events ? [this.#reader, events] as const : undefined
    }

    read(): Iterator<Entity> {
        const tuple = this.reader_mut_with_events();
        if (tuple) {
            const [reader, events] = tuple;
            return reader
                .reader
                .read(events)
                // .flatten()
                .map(e => e.entity);
        }
        return iter.of();
    }

    read_with_id() {
        const tup = this.reader_mut_with_events();
        if (tup) {
            const [reader, events] = tup
            return reader
                .reader
                .read_with_id(events)
                .flatten()
                .map(map_id_events)
        }
        return;
    }

    len() {
        const events = this.events();
        return events ? this.#reader.reader.len(events) : 0
    }

    is_empty() {
        const events = this.events()
        return events ? this.#reader.reader.is_empty(events) : true;
    }

    clear() {
        const tuple = this.reader_mut_with_events();
        if (tuple) tuple[0].reader.clear(tuple[1]);
    }
}

function map_id_events([entity, id]: [RemovedComponentEntity, EventId<Entity>]): [Entity, EventId<RemovedComponentEntity>] {
    return [entity.clone().into(), id];
}