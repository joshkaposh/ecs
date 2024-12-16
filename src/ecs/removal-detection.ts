import { Option } from "joshkaposh-option";
import { Component, ComponentId, Tick } from "./component";
import { Entity } from "./entity";
import { SparseSet } from "./storage/sparse-set";
import { EventCursor, EventId, Events } from "./event";
import { SystemMeta, SystemParam } from "./system";
import { unit } from "../util";
import { World } from "./world";
import { iter } from "joshkaposh-iterator";


class RemovedComponentEntity {
    constructor(public entity: Entity) { }
    clone() {
        return new RemovedComponentEntity(this.entity);
    }

    into() {
        return this.entity;
    }
}

export class RemovedComponentEvents extends SystemParam<unit, RemovedComponentEvents> {
    State!: unit;
    Item!: RemovedComponentEvents;
    #events_sets: SparseSet<ComponentId, Events<typeof RemovedComponentEntity>>;

    constructor(event_sets: SparseSet<ComponentId, Events<typeof RemovedComponentEntity>>) {
        super();
        this.#events_sets = event_sets;
    }

    static default() {
        return new RemovedComponentEvents(SparseSet.default());
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
            .get_or_insert_with(component_id, () => Events.default(RemovedComponentEntity))
            .send(new RemovedComponentEntity(entity));
    }

    init_state(_world: World, _system_meta: SystemMeta): unit { return unit }

    get_param(_state: unit, _system_meta: SystemMeta, world: World, _change_tick: Tick): RemovedComponentEvents {
        return world.removed_components()
    }


}

// @ts-expect-error
export class RemovedComponentReader<T extends Component> {
    constructor(public reader: EventCursor<typeof RemovedComponentEntity>) { }

    static default<T extends Component>() {
        return new RemovedComponentReader<T>(EventCursor.default())
    }
}
export class RemovedComponents<T extends Component> extends SystemParam<any, any> {
    State!: any;
    Item!: any;
    #component_id: ComponentId;
    #reader: RemovedComponentReader<T>;
    #event_sets: RemovedComponentEvents;

    constructor(component_id: ComponentId, reader: RemovedComponentReader<T>, event_sets: RemovedComponentEvents) {
        super()
        this.#component_id = component_id;
        this.#reader = reader;
        this.#event_sets = event_sets;
    }

    //* SystemParam methods

    init_state(_world: World, _system_meta: SystemMeta) {

    }

    get_param(_state: any, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return this;
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
                .flatten()
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