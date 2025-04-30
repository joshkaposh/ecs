import type { Event } from "./base";
import type { Events } from "./collections";
import type { EventCursor } from "./event_cursor";
import type { EventIterator, EventIteratorWithId } from "./iterators";

export class EventReader<E extends Event> {
    #reader: EventCursor<E>;
    #events: Events<E>;

    constructor(reader: EventCursor<E>, events: Events<E>) {
        this.#reader = reader;
        this.#events = events;
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
