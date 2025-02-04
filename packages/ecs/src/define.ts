import { define_resource } from 'define';
import type { Class } from './util';
import { type Event, Events } from './event';

export { define_system } from './system';
export { set } from "./schedule/set";

export const ECS_EVENTS_TYPE = 'ECS_EVENTS_TYPE';

export function define_event<E extends Class>(type: E): E {
    define_resource(type);
    class EventDefinition extends Events<E> {
        constructor() {
            super(type);
        }
    }

    const descriptor = {
        get() {
            return EventDefinition;
        },
        enumerable: false,
        configurable: false,
    }

    // Object.defineProperty(type, ECS_EVENTS_TYPE, descriptor);
    // Object.defineProperty(type.prototype, ECS_EVENTS_TYPE, descriptor);

    // @ts-expect-error
    type[ECS_EVENTS_TYPE] = EventDefinition;
    type.prototype[ECS_EVENTS_TYPE] = EventDefinition;



    return type as Event<E>;
}