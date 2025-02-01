import type { Resource } from "..";

export type Event<T = any> = Resource<T>
// @ts-ignore
export type EventId<T = any> = number;

export type EventInstance<E extends Event> = {
    event_id: EventId<E>;
    event: E extends new (...args: any[]) => any ? InstanceType<E> : E;
}
