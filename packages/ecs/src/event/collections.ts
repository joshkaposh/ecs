import { done, DoubleEndedIterator, drain, ExactSizeIterator, item, iter, Iterator, range } from "joshkaposh-iterator";
import { extend } from "../array-helpers";
import { Event, EventId, EventInstance } from "./base";
import { u32 } from "intrinsics";
import type { Option } from "joshkaposh-option";
import { EventCursor } from "./event_cursor";
import { Instance } from "../util";
import { Default } from "../default";
// import { Resource, StorageType, World } from "../../../../src";
// import { v4 } from "uuid";

export class Events<E extends Event> {
    __events_a: EventSequence<E>;
    __events_b: EventSequence<E>;
    #event_count: number;
    #ty: E;

    constructor(
        ty: E,
        event_count: number = 0,
        events_a: EventSequence<E> = { events: [], start_event_count: 0 },
        events_b: EventSequence<E> = { events: [], start_event_count: 0 },
    ) {
        this.__events_a = events_a;
        this.__events_b = events_b;
        this.#ty = ty;
        this.#event_count = event_count;
    }

    get event_count(): number {
        return this.#event_count
    }

    /**
     * @returns Returns the index of the oldest event stored in the event buffer.
     */
    oldest_event_count(): number {
        return this.__events_a.start_event_count;
    }

    /**
     * @description
     * "Sends" an `event` by writing it to the current event buffer. `EventReader`s can then read
     * the event.
     * This method returns the `EventId` of the sent `event`
     */
    send(event: Instance<E>): EventId<E> {
        return this.send_with_caller(event);

    }

    send_with_caller(event: Instance<E>): EventId<E> {
        const event_id = this.event_count;
        const event_instance = {
            event_id,
            event
        } as EventInstance<E>;

        this.__events_b.events.push(event_instance)
        this.#event_count += 1;
        return event_id
    }

    /**
     * Sends a list of `events` all at once, which can later be read by [`EventReader`]s.
     * This is more efficient than sending each event individually.
     * This method returns the [IDs](`EventId`) of the sent `events`. 
     */
    send_batch(events: Iterator<Instance<E>>): SendBatchIds<E> {
        const last_count = this.#event_count;

        this.extend(events);

        return new SendBatchIds(last_count, this.#event_count);
    }

    send_default<T extends E extends Default<E> ? EventId<E> : never>(): T {
        // @ts-expect-error
        return this.send(new this.#ty());
    }

    /**
     * @summary Gets a new [`ManualEventReader`]. This will include all events already in the event buffers.
     */
    get_cursor(): EventCursor<E> {
        return new EventCursor() as EventCursor<E>;
    }

    /**
     * @summary Gets a new [`ManualEventReader`]. This will ignore all events already in the event buffers.
     * It will read all future events.
     */
    get_cursor_current(): EventCursor<E> {
        return new EventCursor(this.#event_count, this.#ty);
    }

    /**
     * @deprecated `get_reader()` is deprecated. Please use `get_cursor()` instead.
     */
    get_reader(): EventCursor<E> {
        return new EventCursor();
    }

    /**
     * @deprecated `get_reader()` is deprecated. Please use `get_cursor()` instead.
     */
    get_reader_current(): EventCursor<E> {
        return new EventCursor(this.#event_count, this.#ty);
    }

    /**
     * @description
     * Swaps the event buffers and clears the oldest event buffer. In general, this should be
     * called once per frame/update
     * 
     * If you need access to the events that were removed, consider using `Events.update_drain`
     */
    update() {
        // swap events
        let temp: any = this.__events_b.events;
        this.__events_b.events = this.__events_a.events;
        this.__events_a.events = temp;

        temp = this.__events_b.start_event_count;
        this.__events_b.start_event_count = this.__events_a.start_event_count;
        this.__events_a.start_event_count = temp;

        this.__events_b.events.length = 0
        this.__events_b.start_event_count = this.#event_count;
    }

    update_drain(): DoubleEndedIterator<E> {
        // swap events
        const temp = this.__events_b;
        this.__events_b = this.__events_a;
        this.__events_a = temp;

        const iter = drain(this.__events_b.events)
        this.__events_b.start_event_count = this.#event_count;
        return iter.map(e => e.event) as any;
    }

    reset_start_event_count(): void {
        this.__events_a.start_event_count = this.#event_count;
        this.__events_b.start_event_count = this.#event_count;
    }

    clear(): void {
        this.reset_start_event_count();
        this.__events_a.events.length = 0;
        this.__events_b.events.length = 0;
    }

    len(): number {
        return this.__events_a.events.length + this.__events_b.events.length;
    }

    is_empty(): boolean {
        return this.len() === 0;
    }

    drain(): Iterator<E> {
        this.reset_start_event_count();

        return drain(this.__events_a.events)
            .chain(drain(this.__events_b.events))
            .map(i => i.event) as any;
    }

    iter_current_update_events(): ExactSizeIterator<E> {
        return iter(this.__events_b.events).map(i => i.event) as unknown as ExactSizeIterator<E>
    }

    get_event(id: number): Option<[event: E, index: number]> {
        if (id < this.oldest_id()) {
            return
        }

        const sequence = this.sequence(id);
        const index = u32.saturating_sub(id, sequence.start_event_count);

        const inst = sequence.events[index];
        return inst ? [inst.event, inst.event_id] : undefined;
    }

    oldest_id() {
        return this.__events_a.start_event_count;
    }

    sequence(id: number) {
        return id < this.__events_b.start_event_count ?
            this.__events_a :
            this.__events_b;
    }

    extend(iterable: Iterable<E>) {
        const old_count = this.#event_count;
        let event_count = this.#event_count;
        const events = iter(iterable).map(event => {
            const event_id = this.#event_count
            event_count += 1;
            return { event_id, event } as EventInstance<E>;
        }).collect();

        this.#event_count = event_count;
        extend(this.__events_b.events, events as any)
    }


}

export type EventSequence<E extends Event> = {
    events: EventInstance<E>[];
    start_event_count: number;
}

export class SendBatchIds<E extends Event> extends ExactSizeIterator<EventId<E>> {
    #last_count: number;
    #event_count: number;

    constructor(last_count: number, event_count: number) {
        super();
        this.#last_count = last_count;
        this.#event_count = event_count;
    }

    len(): number {
        return u32.saturating_sub(this.#event_count, this.#last_count);
    }

    next(): IteratorResult<number, any> {
        if (this.#last_count >= this.#event_count) {
            return done()
        }

        const elt = this.#last_count;
        this.#last_count += 1;
        return item(elt);
    }
}