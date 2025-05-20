import type { Resource } from "../component";
import type { Class, Instance } from "../util";

export type Event<T = new (...args: any[]) => any> = T extends Class ? Resource<T> : never;
export type EventId = number;

export interface EventInstance<E extends Event> {
    readonly event_id: EventId;
    readonly event: Instance<E>;
}
