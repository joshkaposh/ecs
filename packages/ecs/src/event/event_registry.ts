import { v4 } from "uuid";
import type { Events } from "./collections";
import type { ComponentId, Tick } from "../component";
import type { World } from "../world";
import type { Mut } from "../change_detection";
import type { Event } from "./event.type";

interface RegisteredEvent {
    component_id: ComponentId;
    /**
     * Required to flush the secondary buffer and drop events even if left unchanged.
     */
    previously_updated: boolean;
    /**
     * SAFETY: The component ID and the function must be used to fetch the Events<T> resource of the same type initialized in `register_event` or improper type casts will occur.
     */
    update: <T>(type: Mut<any>) => Mut<T>;
}

export class EventRegistry {
    static readonly type_id: UUID;
    static readonly storage_type: 0;
    static from_world: (world: World) => EventRegistry;

    should_update: ShouldUpdateEvents;
    event_updates: RegisteredEvent[];

    constructor(should_update: ShouldUpdateEvents = ShouldUpdateEvents.Always) {
        this.should_update = should_update;
        this.event_updates = [];
    }

    static registerEvent<T extends Event>(type: T, world: World) {
        const component_id = world.initResource(type);
        const registry = world.getResourceOrInit(EventRegistry)
        registry.v.event_updates.push({
            component_id,
            previously_updated: false,
            // @ts-expect-error
            update: (ptr: Mut<Events<T>>) => ptr.bypassChangeDetection().update()
        })
    }

    static deregisterEvents(type: Event, world: World) {
        const component_id = world.initResource(type);
        const registry = world.getResourceOrInit(EventRegistry).bypassChangeDetection() as unknown as InstanceType<typeof EventRegistry>;
        registry.event_updates = registry.event_updates.filter(e => e.component_id === component_id);
        world.removeResource(type);
    }

    runUpdates(world: World, last_change_tick: Tick) {
        const event_updates = this.event_updates;
        for (let i = 0; i < event_updates.length; i++) {
            const registered_event = event_updates[i];
            const events = world.getResourceMutById(registered_event.component_id);
            if (events) {
                const has_changed = events.hasChangedSince(last_change_tick);
                if (registered_event.previously_updated || has_changed) {
                    registered_event.update(events);
                    registered_event.previously_updated = has_changed || !registered_event.previously_updated;
                }
            }
        }
    }
}
// @ts-expect-error
EventRegistry.type_id = v4() as UUID;
// @ts-expect-error
EventRegistry.storage_type = 1;
EventRegistry.from_world ??= (_world: World) => {
    return new EventRegistry();
}

export type ShouldUpdateEvents = 0 | 1 | 2;
export const ShouldUpdateEvents = {
    // Without any fixed timestep, events should always be updated each frame.
    Always: 0,
    // We need to wait until at least one pass of the fixed update schedules to update the events.
    Waiting: 1,
    // At least one pass of the fixed update schedules has occured, and the events are ready to be updated.
    Ready: 2,
} as const

