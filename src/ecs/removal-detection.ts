import { Option } from "joshkaposh-iterator";
import { Component, ComponentId } from "./component";
import { Entity } from "./entity";
import { SparseSet } from "./storage/sparse-set";
import { ComponentIdFor, EventId, Events, Local, ManualEventReader } from "./event";

export class RemovedComponentReader<T extends Component> {
    #reader: ManualEventReader<typeof Entity>;
    #ty: T;
    constructor(reader: ManualEventReader<typeof Entity>, ty: T) {
        this.#reader = reader;
        this.#ty = ty;
    }

    // events: Events<typeof Entity>
    clear(events: Events<typeof Entity>) {
        this.#reader.clear(events);
    }

    is_empty(events: Events<typeof Entity>) {
        return this.#reader.is_empty(events);
    }

    len(events: Events<typeof Entity>) {
        return this.#reader.len(events);
    }

    missed_events(events: Events<typeof Entity>) {
        return this.#reader.missed_events(events)
    }

    read(events: Events<typeof Entity>) {
        return this.#reader.read(events)
    }

    read_with_id(events: Events<typeof Entity>): EventIter<typeof Entity> {
        return this.#reader.read_with_id(events)
    }




    static default<T extends Component>(ty: T) {
        return new RemovedComponentReader(new ManualEventReader(0, Entity), ty);
    }
}

export class RemovedComponentEvents {
    #events_sets: SparseSet<ComponentId, Events<typeof Entity>>;

    constructor(event_sets: SparseSet<ComponentId, Events<typeof Entity>>) {
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

    get(component_id: ComponentId): Option<Events<typeof Entity>> {
        return this.#events_sets.get(component_id);
    }

    send(component_id: ComponentId, entity: Entity) {
        this.#events_sets
            .get_or_insert_with(component_id, () => Events.default(Entity))
            .send(entity);
    }
}

export class RemovedComponents<T extends Component> {
    #component_id: ComponentIdFor<T>;
    #reader: Local<RemovedComponentReader<T>>;
    #event_sets: RemovedComponentEvents;

    constructor(component_id: ComponentIdFor<T>, reader: Local<RemovedComponentReader<T>>, event_sets: RemovedComponentEvents) {
        this.#component_id = component_id;
        this.#reader = reader;
        this.#event_sets = event_sets;
    }

    reader(): ManualEventReader<typeof Entity> {
        return this.#reader as unknown as ManualEventReader<typeof Entity>;
    }

    events(): Option<Events<typeof Entity>> {
        return this.#event_sets.get(this.#component_id);
    }

    reader_mut_with_events(): Option<[RemovedComponentReader<T>, Events<typeof Entity>]> {
        const events = this.#event_sets.get(this.#component_id);
        if (events) {
            return [this.#reader, events];
        }
        return null;
    }

    read() {
        const tuple = this.reader_mut_with_events();
        if (tuple) {
            const [reader, events] = tuple;
            return reader.reader
                .read(events)
                .flatten()
                .map((e: Entity) => e.clone());
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
        if (tuple) {
            const [reader, events] = tuple;
            reader.reader.clear(events);
        }
    }

}

function map_id_events([entity, id]: [Entity, EventId<Entity>]) {
    return [entity.clone(), id];
}