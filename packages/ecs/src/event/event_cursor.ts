import { u32 } from "joshkaposh-option";
import { Event } from "./event.type";
import { Events } from './collections'
import { EventIteratorWithId } from "./iterators";

export class EventCursor<E extends Event> {
    __last_event_count: number;
    #type: E;

    constructor(type: E, last_event_count: number = 0) {
        this.__last_event_count = last_event_count;
        this.#type = type;
    }

    clone() {
        return new EventCursor(this.#type, this.__last_event_count);
    }

    read(events: Events<E>) {
        return this.readWithId(events).without_id();
    }

    readMut(events: Events<E>) {
        return this.readMutWithId(events).without_id();
    }

    readWithId(events: Events<E>) {
        return new EventIteratorWithId(this, events)
    }

    readMutWithId(events: Events<E>) {
        return new EventIteratorWithId(this, events)
    }

    length(events: Events<E>) {
        /**
         The number of events in this reader is the difference between the most recent event
         and the last event seen by it. This will be at most the number of events contained with the events (any others have already been dropped)
         */

        return Math.min(
            u32.saturating_sub(events.eventCount, this.__last_event_count),
            events.length
        )
    }

    missed_events(events: Events<E>) {
        return u32.saturating_sub(events.oldestEventCount, this.__last_event_count);
    }

    is_empty(events: Events<E>) {
        return this.length(events) === 0
    }

    clear(events: Events<E>) {
        this.__last_event_count = events.eventCount
    }
}