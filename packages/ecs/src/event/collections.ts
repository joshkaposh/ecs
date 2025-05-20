import { done, DoubleEndedIterator, drain, ExactSizeIterator, item, iter, Iterator } from "joshkaposh-iterator";
import type { Event, EventId, EventInstance } from "./event.type";
import type { Instance } from "../util";
import { type Option, u32 } from "joshkaposh-option";
import { ResMut } from "../change_detection";
import type { ComponentId, Tick } from "../component";
import { EventCursor } from "./event_cursor";
import { Default } from "../default";
import { SystemMeta, SystemParam, defineParam } from "../system";
import { World } from "../world";

interface Events<E extends Event> extends SystemParam<ComponentId, ResMut<Events<E>>> {
    send(event: Instance<E>): EventId;

}

class Events<E extends Event> {
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

    static init_state<E extends Event>(world: World, system_meta: SystemMeta, event: E) {
        // @ts-expect-error
        return ResMut.init_state(world, system_meta, event.ECS_EVENTS_TYPE)
    }

    static get_param(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        return ResMut.get_param(component_id, system_meta, world, change_tick);
    }

    /** the total amount of events in the buffer. */
    get eventCount() {
        return this.#event_count;
    }

    /** the index of the oldest event stored in the event buffer. */
    get oldestEventCount() {
        return this.__events_a.start_event_count;
    }

    /**
     * @description
     * "Sends" an `event` by writing it to the current event buffer. `EventReader`s can then read
     * the event.
     * This method returns the `EventId` of the sent `event`
     */
    send(event: Instance<E>): EventId {
        const event_id = this.eventCount;
        const event_instance = {
            event_id,
            event
        }

        this.__events_b.events.push(event_instance)
        this.#event_count += 1;
        return event_id
    }

    /**
     * Sends a list of `events` all at once, which can later be read by [`EventReader`]s.
     * This is more efficient than sending each event individually.
     * This method returns the [IDs](`EventId`) of the sent `events`. 
     */
    sendBatch(events: Iterator<Instance<E>> | InstanceType<E>[]): SendBatchIds {
        const last_count = this.#event_count;
        this.extend(events);

        return new SendBatchIds(last_count, this.#event_count);
    }

    sendDefault<T extends E extends Default<E> ? EventId : never>(): T {
        return this.send(new this.#ty()) as T;
    }

    /**
     * @summary Gets a new [`EventCursor`]. This will include all events already in the event buffers.
     */
    getCursor(): EventCursor<E> {
        return new EventCursor(this.#ty)
    }

    /**
     * @summary Gets a new [`EventCursor`]. This will ignore all events already in the event buffers.
     * It will read all future events.
     */
    getCursorCurrent(): EventCursor<E> {
        return new EventCursor(this.#ty, this.#event_count);
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

        // temp = this.__events_b.start_event_count;
        // this.__events_b.start_event_count = this.__events_a.start_event_count;
        // this.__events_a.start_event_count = temp;

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

    /**
     * Clears all events from the previous frame as well as this one.
     */
    clear(): void {
        this.reset_start_event_count();
        this.__events_a.events.length = 0;
        this.__events_b.events.length = 0;
    }

    get length(): number {
        return this.__events_a.events.length + this.__events_b.events.length;
    }

    get isEmpty(): boolean {
        return this.__events_a.events.length === 0 && this.__events_b.events.length === 0;
    }

    drain(): Iterator<Instance<E>> {
        this.reset_start_event_count();

        return drain(this.__events_a.events)
            .chain(drain(this.__events_b.events))
            .map(i => i.event) as any;
    }

    iter_current_update_events(): ExactSizeIterator<E> {
        return iter(this.__events_b.events).map(i => i.event) as unknown as ExactSizeIterator<Instance<E>>
    }

    getEvent(id: number): Option<[event: Instance<E>, index: number]> {
        if (id < this.oldestId) {
            return
        }

        const sequence = this.sequence(id);
        const index = u32.saturating_sub(id, sequence.start_event_count);

        const inst = sequence.events[index];
        return inst ? [inst.event, inst.event_id] : undefined;
    }

    get oldestId() {
        return this.__events_a.start_event_count;
    }

    sequence(id: number) {
        return id < this.__events_b.start_event_count ?
            this.__events_a :
            this.__events_b;
    }

    extend(iterable: Iterable<E>) {
        // const old_count = this.#event_count;
        let event_count = this.#event_count;
        const events = iter(iterable).map(event => {
            const event_id = this.#event_count
            event_count += 1;
            return { event_id, event } as EventInstance<E>;
        }).collect();

        this.#event_count = event_count;
        this.__events_b.events.push(...events);
        // extend(this.__events_b.events, events as any)
    }


}

defineParam(Events);


class SendBatchIds extends ExactSizeIterator<EventId> {
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

export { Events, SendBatchIds };

export interface EventSequence<E extends Event> {
    events: EventInstance<E>[];
    start_event_count: number;
}