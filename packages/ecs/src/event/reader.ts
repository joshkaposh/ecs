import { Res, Ticks } from "../change_detection";
import type { ComponentId, ComponentTicks } from "../component";
import { type SystemMeta, defineParam } from "../system";
import type { Tick } from "../tick";
import type { World } from "../world";
import type { Event } from "./event.type";
import type { Events } from "./collections";
import type { EventCursor } from "./event_cursor";
import type { EventIterator, EventIteratorWithId } from "./iterators";

class EventReader<E extends Event> {
    #reader: EventCursor<E>;
    #events: Events<E>;

    constructor(reader: EventCursor<E>, events: Events<E>) {
        this.#reader = reader;
        this.#events = events;
    }

    static init_state<E extends Event>(world: World, system_meta: SystemMeta, event: E) {
        return Res.init_state(world, system_meta, event);
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        return Res.validate_param(component_id, _system_meta, world);
    }

    static get_param<E extends Event>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        const tuple = world.getResourceWithTicks(component_id) as [Events<E>, ComponentTicks];
        if (!tuple) {
            throw new Error(`Resource requested by ${system_meta.name} does not exist`);
        }

        const [ptr, ticks] = tuple;

        return new Res<EventReader<E>>(new EventReader(ptr.getCursor(), ptr), new Ticks(ticks, system_meta.last_run, change_tick))
    }

    get length(): number {
        return this.#reader.length(this.#events);
    }

    get isEmpty(): boolean {
        return this.#reader.is_empty(this.#events);
    }

    read(): EventIterator<E> {
        return this.#reader.read(this.#events);
    }

    readWithId(): EventIteratorWithId<E> {
        return this.#reader.readWithId(this.#events);
    }

    clear(): void {
        return this.#reader.clear(this.#events);
    }
}

defineParam(EventReader);

export {
    EventReader
}