import { TODO } from "joshkaposh-iterator/src/util";
import { Component, ComponentId } from "./component";
import { Entity } from "./entity";
import { SparseSet } from "./storage/sparse-set";
import { extend } from "../array-helpers";
import { DoubleEndedIterator, ExactSizeIterator, Iterator, Option, done, drain, is_none, is_some, iter, iter_item, range } from "joshkaposh-iterator";
import { u32 } from "../Intrinsics";

type Res<T> = any;
type ResMut<T> = any;

export type Event = new (...args: any[]) => any;

export type EventId<T = any> = number;

export type ComponentIdFor<T> = any;
export type Local<T> = T;


type EventInstance<E extends Event> = {
    event_id: EventId<E>;
    event: E;
}

export class ManualEventReader<E extends Event> {
    #type: E;
    __last_event_count: number;
    constructor(last_event_count: number, type: E) {
        this.#type = type;
        this.__last_event_count = last_event_count;
    }

    read(events: Events<E>): EventIterator<E> {
        return this.read_with_id(events).without_id();
    }

    read_with_id(events: Events<E>): EventIteratorWithId<E> {
        return new EventIteratorWithId(this, events);
    }

    len(events: Events<E>): number {
        const ec = events.event_count;
        const lec = this.__last_event_count;
        const evl = events.len();
        console.log('event_count: %d, last_event_count: %d, events.len() %d, result: %d', ec, lec, evl, Math.min(u32.saturating_sub(events.event_count, this.__last_event_count), events.len()));

        return Math.min(u32.saturating_sub(events.event_count, this.__last_event_count), events.len());
    }

    missed_events(events: Events<E>): number {
        return u32.saturating_sub(events.oldest_event_count(), this.__last_event_count)
    }

    is_empty(events: Events<E>): boolean {
        return this.len(events) === 0;
    }

    clear(events: Events<E>): void {
        this.__last_event_count = events.event_count;
    }
};

export class EventReader<E extends Event> {
    #reader: Local<ManualEventReader<E>>;
    #events: Res<Events<E>>;

    constructor(reader: Local<ManualEventReader<E>>, events: Res<Events<E>>) {
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

export class EventWriter<E extends Event> {
    #events: ResMut<Events<E>>;

    constructor(events: ResMut<Events<E>>) {
        this.#events = events;
    }

    send(event: E) {
        this.#events.send(event);
    }

    send_batch(events: Iterator<E>): SendBatchIds<E> {
        return this.#events.send_batch(events);
    }

    send_default(): E extends { default(): E } ? EventId<E> : never {
        return this.#events.send_default();
    }
}

type EventSequence<E extends Event> = {
    events: EventInstance<E>[];
    start_event_count: number;
}

// the events for a given type
export class Events<E extends new (...args: any[]) => any> {
    #events_a: EventSequence<InstanceType<E>>;
    #events_b: EventSequence<InstanceType<E>>;
    #event_count: number;
    #ty: E;
    private constructor(events_a: EventSequence<InstanceType<E>>, events_b: EventSequence<InstanceType<E>>, event_count: number, ty: E) {
        this.#events_a = events_a;
        this.#events_b = events_b;
        this.#event_count = event_count;
        this.#ty = ty;
    }

    get __events_a() {
        return this.#events_a
    }

    get __events_b() {
        return this.#events_b
    }


    static default<E extends Event>(ty: E): Events<E> {
        return new Events<E>(
            { events: [], start_event_count: 0 },
            { events: [], start_event_count: 0 },
            0,
            ty
        );
    }

    get event_count(): number {
        return this.#event_count
    }

    /**
     * @returns Returns the index of the oldest event stored in the event buffer.
     */
    oldest_event_count(): number {
        return Math.min(this.#events_a.start_event_count, this.#events_b.start_event_count)
        // return this.#events_a.start_event_count.min(this.#events_b.start_event_count)
    }

    /**
     * @description
     * "Sends" an `event` by writing it to the current event buffer. `EventReader`s can then read
     * the event.
     * This method returns the `EventId` of the sent `event`
     */
    send(event: InstanceType<E>): EventId<E> {
        const event_id: EventId<E> = this.#event_count

        const event_instance: EventInstance<InstanceType<E>> = {
            event_id, event
        }

        this.#events_b.events.push(event_instance);
        this.#event_count += 1;

        return event_id;
    }

    /**
     * Sends a list of `events` all at once, which can later be read by [`EventReader`]s.
     * This is more efficient than sending each event individually.
     * This method returns the [IDs](`EventId`) of the sent `events`. 
     */
    send_batch(events: Iterator<E>): SendBatchIds<E> {
        const last_count = this.#event_count;

        this.extend(events);

        return new SendBatchIds(last_count, this.#event_count);
    }

    send_default(): EventId<E> {
        // @ts-expect-error;
        return this.send(this.#ty.default() as E);
    }

    /**
     * @summary Gets a new [`ManualEventReader`]. This will include all events already in the event buffers.
     */
    get_reader(): ManualEventReader<E> {
        return new ManualEventReader(0, this.#ty)
    }

    /**
     * @summary Gets a new [`ManualEventReader`]. This will ignore all events already in the event buffers.
     * It will read all future events.
     */
    get_reader_current(): ManualEventReader<E> {
        return new ManualEventReader(this.#event_count, this.#ty);
    }

    /**
     * @description
     * Swaps the event buffers and clears the oldest event buffer. In general, this should be
     * called once per frame/update
     * 
     * If you need access to the events that were removed, consider using `Events.update_drain`
     */
    update() {
        this.update_drain().for_each(() => { });



        // if (drained.length === this.len()) {
        // this.clear();
        // }
    }

    update_drain(): DoubleEndedIterator<E> {
        const temp = this.#events_b;
        this.#events_b = this.#events_a;
        this.#events_a = temp;

        const iter = drain(this.#events_b.events, range(0, this.#events_b.events.length))
        this.#events_b.start_event_count = this.#event_count;
        // @ts-expect-error
        return iter.map(e => e.event);
    }

    reset_start_event_count(): void {
        this.#events_a.start_event_count = this.#event_count;
        this.#events_b.start_event_count = this.#event_count;
    }

    clear(): void {
        this.reset_start_event_count();
        this.#events_a.events.length = 0;
        this.#events_b.events.length = 0;
    }

    debug() {
        return [
            this.#events_a.events,
            this.#events_b.events
        ]
    }

    len(): number {
        const a = this.#events_a.events;
        const b = this.#events_b.events;

        let len_a = a.length, len_b = b.length;

        if (len_a > 0 && !a[a.length - 1]) {
            for (let i = a.length - 1; i >= 0; i--) {
                if (is_some(a[i])) {
                    len_a = i;
                    break;
                }
            }
        }

        if (len_b > 0 && !b[b.length - 1]) {
            for (let i = b.length - 1; i >= 0; i--) {
                if (is_some(b[i])) {
                    len_b = i;
                    break;
                }
            }
        }

        return len_a + len_b;
    }

    is_empty(): boolean {
        const a = this.#events_a.events;
        const b = this.#events_b.events;

        if (a.length === 0 && b.length === 0) {
            return true
        }

        return is_none(a[0]) && is_none(b[0])
    }

    drain(): Iterator<E> {
        this.reset_start_event_count();

        return drain(this.#events_a.events, range(0, this.#events_a.events.length))
            .chain(drain(this.#events_b.events, range(0, this.#events_b.events.length)))
            // @ts-expect-error
            .map(i => i.event);
    }

    iter_current_update_events(): ExactSizeIterator<E> {
        // @ts-expect-error
        return iter(this.#events_b.events).map(i => i.event)
    }

    get_event(id: number): Option<[event: E, index: number]> {
        if (id < this.oldest_id()) {
            return null
        }

        const sequence = this.sequence(id);
        const index = u32.saturating_sub(id, sequence.start_event_count);

        const inst = sequence.events[index];
        return inst ? [inst.event, inst.event_id] : null;
    }

    oldest_id() {
        return this.#events_a.start_event_count;
    }

    sequence(id: number) {
        return id < this.#events_b.start_event_count ?
            this.#events_a :
            this.#events_b;
    }

    extend(iterable: Iterable<E>) {
        const old_count = this.#event_count;
        let event_count = this.#event_count;
        const events = iter(iterable).map(event => {
            const event_id = this.#event_count
            event_count += 1;
            return { event_id, event } as EventInstance<E>;
        }).collect();

        extend(this.#events_b.events, events as any)
        this.#event_count = event_count;
    }
}

export class EventIterator<E extends Event> extends ExactSizeIterator<E> {
    #iter: EventIteratorWithId<E>;

    constructor(it: EventIteratorWithId<E>) {
        super()
        this.#iter = it;
    }

    into_iter(): ExactSizeIterator<E> {
        this.#iter.into_iter();
        return this;
    }

    next(): IteratorResult<E, any> {
        const n = this.#iter.next();
        return n.done ? done() : iter_item(n.value[0]);
    }

    size_hint(): [number, number] {
        return this.#iter.size_hint();
    }

    count() {
        return this.#iter.count();
    }

    nth(n: number): IteratorResult<E, any> {
        const el = this.#iter.nth(n);
        return el.done ? done() : iter_item(el.value[0]);
    }

    len(): number {
        return this.#iter.len();
    }
}

export class EventIteratorWithId<E extends Event> extends ExactSizeIterator<[E, number]> {
    #reader: ManualEventReader<E>
    #chain: Iterator<EventInstance<E>>;
    #unread: number;
    constructor(reader: ManualEventReader<E>, events: Events<E>) {
        super();
        const a_index = u32.saturating_sub(reader.__last_event_count, events.__events_a.start_event_count);
        const b_index = u32.saturating_sub(reader.__last_event_count, events.__events_b.start_event_count);
        const a: EventInstance<E>[] = events.__events_a.events.slice(a_index, events.__events_a.events.length);
        const b: EventInstance<E>[] = events.__events_b.events.slice(b_index, events.__events_b.events.length);

        const unread_count = a.length + b.length;
        const chain = iter(a).chain(b as unknown as DoubleEndedIterator<EventInstance<E>>);

        this.#reader = reader;
        this.#chain = chain;
        this.#unread = unread_count;
    }

    without_id(): EventIterator<E> {
        return new EventIterator(this);
    }

    into_iter(): ExactSizeIterator<[E, number]> {
        this.#chain.into_iter();
        return this;
    }

    next(): IteratorResult<[E, number]> {
        const n = this.#chain.next();

        if (!n.done) {
            const item = [n.value.event, n.value.event_id] as [E, number];
            this.#reader.__last_event_count += 1;
            this.#unread -= 1;
            return iter_item(item);
        }

        return done()
    }
    size_hint(): [number, number] {
        return this.#chain.size_hint() as [number, number];
    }

    last(): Option<[E, number]> {
        const n = this.#chain.last();
        if (!is_some(n)) {
            return null
        }
        const { event_id, event } = n;
        this.#reader.__last_event_count += this.#unread;
        return [event, event_id];
    }

    nth(n: number): IteratorResult<[E, number], any> {
        const next = this.#chain.nth(n);
        if (!next.done) {
            const { event_id, event } = next.value;
            this.#reader.__last_event_count += n + 1;
            this.#unread -= n + 1;
            return iter_item([event, event_id] as [E, number])
        } else {
            this.#reader.__last_event_count += this.#unread;
            this.#unread = 0;
            return done();
        }
    }

    len(): number {
        return this.#unread;
    }
}

export class SendBatchIds<E extends Event> extends ExactSizeIterator<EventId<E>> {
    #last_count: number;
    #event_count: number;

    constructor(last_count: number, event_count: number) {
        super();
        this.#last_count = last_count;
        this.#event_count = event_count;
    }

    next(): IteratorResult<number, any> {
        if (this.#last_count >= this.#event_count) {
            return done()
        }

        const result = this.#last_count;

        this.#last_count += 1;

        return iter_item(result);
    }
}