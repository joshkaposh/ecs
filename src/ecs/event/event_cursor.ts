import { u32 } from "../../Intrinsics";
import { Event } from "./base";
import { Events } from './collections'
import { EventIteratorWithId } from "./iterators";
export class EventCursor<E extends Event> {
    __last_event_count: number;
    #marker: any;

    constructor(last_event_count: number, marker: any) {
        this.__last_event_count = last_event_count;
        this.#marker = marker;
    }

    static default<E extends Event>() {
        return new EventCursor<E>(0, undefined);
    }

    clone() {
        return new EventCursor(this.__last_event_count, this.#marker);
    }

    read(events: Events<E>) {
        return this.read_with_id(events).without_id();
    }

    read_mut(events: Events<E>) {
        return this.read_mut_with_id(events).without_id();
    }

    read_with_id(events: Events<E>) {
        return new EventIteratorWithId(this, events)
    }

    read_mut_with_id(events: Events<E>) {
        return new EventIteratorWithId(this, events)
    }

    len(events: Events<E>) {
        /**
         The number of events in this reader is the difference between the most recent event
         and the last event seen by it. This will be at most the number of events contained with the events (any others have already been dropped)
         */

        return Math.min(
            u32.saturating_sub(events.event_count, this.__last_event_count),
            events.len()
        )
    }

    missed_events(events: Events<E>) {
        return u32.saturating_sub(events.oldest_event_count(), this.__last_event_count);
    }

    is_empty(events: Events<E>) {
        return this.len(events) === 0
    }

    clear(events: Events<E>) {
        this.__last_event_count = events.event_count
    }

}