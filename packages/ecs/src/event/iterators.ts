import { iter, item, done, Iterator, ExactSizeIterator } from "joshkaposh-iterator";
import { Event, EventInstance, Events, EventCursor } from ".";
import { u32 } from "intrinsics";
import { is_some, Option } from "joshkaposh-option";
import { Instance } from "../util";

export class EventIterator<E extends Event> extends ExactSizeIterator<Instance<E>> {
    #iter: EventIteratorWithId<E>;

    constructor(it: EventIteratorWithId<E>) {
        super()
        this.#iter = it;
    }

    into_iter(): ExactSizeIterator<Instance<E>> {
        this.#iter.into_iter();
        return this;
    }

    next(): IteratorResult<Instance<E>, any> {
        const n = this.#iter.next();
        return n.done ? done() : item(n.value[0]);
    }

    size_hint(): [number, number] {
        return this.#iter.size_hint();
    }

    count() {
        return this.#iter.count();
    }

    last() {
        const l = this.#iter.last();
        return is_some(l) ? l[0] : undefined
    }

    nth(n: number): IteratorResult<Instance<E>> {
        const el = this.#iter.nth(n);
        return el.done ? done() : item(el.value[0]);
    }

    len(): number {
        return this.#iter.len();
    }
}

export class EventIteratorWithId<E extends Event> extends ExactSizeIterator<[Instance<E>, number]> {
    #reader: EventCursor<E>
    #chain: Iterator<EventInstance<E>>;
    #unread: number;
    constructor(reader: EventCursor<E>, events: Events<E>) {
        super();
        const a_index = u32.saturating_sub(reader.__last_event_count, events.__events_a.start_event_count);
        const b_index = u32.saturating_sub(reader.__last_event_count, events.__events_b.start_event_count);
        const a: EventInstance<E>[] = events.__events_a.events.slice(a_index);
        const b: EventInstance<E>[] = events.__events_b.events.slice(b_index);
        // console.log('iter_with_id', reader.__last_event_count, a_index, b_index);

        const unread_count = a.length + b.length;

        const chain = iter(a).chain(b);

        this.#reader = reader;
        this.#chain = chain;
        this.#unread = unread_count;
    }

    without_id(): EventIterator<E> {
        return new EventIterator(this);
    }

    into_iter(): ExactSizeIterator<[Instance<E>, number]> {
        this.#chain.into_iter();
        return this;
    }

    next(): IteratorResult<[Instance<E>, number]> {
        const n = this.#chain.next();

        if (!n.done) {
            const elt = [n.value.event, n.value.event_id] as [Instance<E>, number]
            this.#reader.__last_event_count += 1;
            this.#unread -= 1;
            return item(elt);
        }

        return done()
    }
    size_hint(): [number, number] {
        return this.#chain.size_hint() as [number, number];
    }

    last(): Option<[Instance<E>, number]> {
        const n = this.#chain.last();
        if (!is_some(n)) {
            return
        }
        const { event_id, event } = n;
        this.#reader.__last_event_count += this.#unread;
        return [event, event_id];
    }

    nth(n: number): IteratorResult<[Instance<E>, number]> {
        const next = this.#chain.nth(n);
        if (!next.done) {
            const { event_id, event } = next.value;
            this.#reader.__last_event_count += n + 1;
            this.#unread -= n + 1;
            return item<[Instance<E>, number]>([event, event_id])
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