import { Event } from "./base";
import { Events } from "./collections";
import { EventCursor } from "./event_cursor";
import { EventIterator, EventIteratorWithId } from "./iterators";


// TODO: use Res<Events<E>>
export class EventReader<E extends Event> {
    #reader: EventCursor<E>;
    #events: Events<E>;

    constructor(reader: EventCursor<E>, events: Events<E>) {
        this.#reader = reader;
        this.#events = events;
    }

    read(): EventIterator<E> {
        return this.#reader.read(this.#events);
    }

    read_with_id(): EventIteratorWithId<E> {
        return this.#reader.read_with_id(this.#events);
    }

    len(): number {
        return this.#reader.len(this.#events);
    }

    is_empty(): boolean {
        return this.#reader.is_empty(this.#events);
    }

    clear(): void {
        return this.#reader.clear(this.#events);
    }
}
