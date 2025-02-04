import { ResMut } from "../change_detection";
import { Events, SendBatchIds } from "./collections";
import type { Event, EventId } from "./base";
import { Iterator } from "joshkaposh-iterator";

// TODO: use ResMut<Events<E>>
export class EventWriter<E extends Event> {
    #events: Events<E>;

    constructor(events: Events<E>) {
        this.#events = events;
    }

    send(event: InstanceType<E>) {
        this.#events.send(event);
    }

    send_batch(events: Iterator<InstanceType<E>>): SendBatchIds<E> {
        return this.#events.send_batch(events);
    }

    send_default<T extends E extends { default(): InstanceType<E> } ? T : never>(): EventId<T> {
        return this.#events.send_default();
    }
}
