import { ResMut } from "../../../../src/ecs/change_detection";
import { Event, EventId, Events, SendBatchIds } from "./event";

export class EventWriter<E extends Event> {
    // @ts-expect-error
    #events: ResMut<Events<E>>;

    // @ts-expect-error
    constructor(events: ResMut<Events<E>>) {
        this.#events = events;
    }

    send(event: E) {
        this.#events.value.send(event);
    }

    send_batch(events: Iterator<E>): SendBatchIds<E> {
        return this.#events.value.send_batch(events);
    }

    send_default(): E extends { default(): E } ? EventId<E> : never {
        return this.#events.value.send_default();
    }
}
