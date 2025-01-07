import { Res } from "../change_detection";
import { Event } from "./base";
import { Events } from "./collections";
import { EventCursor } from "./event_cursor";
import { EventIterator, EventIteratorWithId } from "./iterators";

export class EventReader<E extends Event> {
    #reader: EventCursor<E>;
    #events: Res<Events<E>>;

    constructor(reader: EventCursor<E>, events: Res<Events<E>>) {
        this.#reader = reader;
        this.#events = events;
    }

    read(): EventIterator<E> {
        return this.#reader.read(this.#events.value);
    }

    read_with_id(): EventIteratorWithId<E> {
        return this.#reader.read_with_id(this.#events.value);
    }

    len(): number {
        return this.#reader.len(this.#events.value);
    }

    is_empty(): boolean {
        return this.#reader.is_empty(this.#events.value);
    }

    clear(): void {
        return this.#reader.clear(this.#events.value);
    }
}
