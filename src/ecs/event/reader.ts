import { Res } from "../change_detection";
import { Event, EventIterator, EventIteratorWithId, Events, ManualEventReader } from "./event";

export class EventReader<E extends Event> {
    #reader: ManualEventReader<E>;
    // @ts-expect-error
    #events: Res<Events<E>>;

    constructor(reader: ManualEventReader<E>, events: Res<Events<E>>) {
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
