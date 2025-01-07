export type Event<T = new () => any> = T extends new () => any ? T : never;

// @ts-ignore
export type EventId<T = any> = number;

export type EventInstance<E extends Event> = {
    event_id: EventId<E>;
    event: E extends new (...args: any[]) => any ? InstanceType<E> : E;
}
