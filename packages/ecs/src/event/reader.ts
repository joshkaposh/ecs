import { Res } from "../change_detection";
import { ComponentId } from "../component";
import { defineParam, type SystemMeta } from "../system";
import type { Tick } from "../tick";
import type { World } from "../world";
import type { Event } from "./base";
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
        // @ts-expect-error
        return Res.init_state(world, system_meta, event.ECS_EVENTS_TYPE);
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        return Res.validate_param(component_id, _system_meta, world);
    }

    static get_param<E extends Event>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        return Res.get_param<E>(component_id, system_meta, world, change_tick)
    }

    get length(): number {
        return this.#reader.len(this.#events);
    }

    get isEmpty(): boolean {
        return this.#reader.is_empty(this.#events);
    }

    read(): EventIterator<E> {
        return this.#reader.read(this.#events);
    }

    read_with_id(): EventIteratorWithId<E> {
        return this.#reader.read_with_id(this.#events);
    }

    clear(): void {
        return this.#reader.clear(this.#events);
    }
}

defineParam(EventReader)

export {
    EventReader
}