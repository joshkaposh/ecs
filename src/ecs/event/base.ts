export type Event = new (...args: any[]) => any;

// @ts-ignore
export type EventId<T = any> = number;

export type EventInstance<E extends Event> = {
    event_id: EventId<E>;
    event: InstanceType<E>;
}
