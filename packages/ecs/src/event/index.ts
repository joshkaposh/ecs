import { type Class } from 'define';
import type { Event } from './base';
import { Events } from './collections';
import { defineResource } from '../storage';

export * from './base';
export * from './event_registry';
export * from './collections';
export * from './iterators';
export * from './reader';
export * from './writer';
export * from './event_cursor';
export * from './update';

export function defineEvent<E extends Class>(type: E): Event<E> {
    defineResource(type);
    // @ts-expect-error;
    const type_id = type.type_id;
    // const Events = (await import('./collections')).Events;
    class EventDefinition extends Events<Event<E>> {
        static readonly storage_type = 1;
        static readonly type_id = type_id;
        constructor() {
            super(type as unknown as Event<E>);
        }

        static from_world() {
            return new EventDefinition();
        }
    }
    // @ts-expect-error
    type['ECS_EVENTS_TYPE'] = EventDefinition;
    return type as Event<E>;
}