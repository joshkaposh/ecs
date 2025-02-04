import { ResMut } from "../change_detection";
import { Events, SendBatchIds } from "./collections";
import type { Event, EventId } from "./base";
import { Iterator } from "joshkaposh-iterator";

export class EventWriter<E extends Event> {
    #events: ResMut<Events<E>>;

    constructor(events: ResMut<Events<E>>) {
        this.#events = events;
    }

    send(event: E) {
        this.#events.value.send(event);
    }

    send_batch(events: Iterator<InstanceType<E>>): SendBatchIds<E> {
        return this.#events.value.send_batch(events);
    }

    send_default<T extends E extends { default(): InstanceType<E> } ? T : never>(): EventId<T> {
        return this.#events.value.send_default();
    }
}
