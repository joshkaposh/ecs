import { Events } from "./collections";
import { type ComponentId, Tick } from "../component";
import { World } from "../world";
import { Mut } from "../change_detection";
import { define_resource } from "../define";
import { Event } from "./base";

type RegisteredEvent = {
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

export const EventRegistry = define_resource(class EventRegistry {
    should_update: ShouldUpdateEvents;
    #event_updates: RegisteredEvent[];
    constructor(should_update: ShouldUpdateEvents = ShouldUpdateEvents.Always) {
        this.should_update = should_update;
        this.#event_updates = [];
    }

    register_event<T extends Event>(type: T, world: World) {
        const component_id = world.init_resource(type as any);
        const registry = world.get_resource_or_init(EventRegistry as any) as EventRegistry;
        registry.#event_updates.push({
            component_id,
            previously_updated: false,
            // @ts-expect-error
            update: (ptr: Mut<Events<T>>) => ptr.bypass_change_detection().update()
        })
    }

    run_updates(world: World, last_change_tick: Tick) {
        const event_updates = this.#event_updates;
        for (let i = 0; i < event_updates.length; i++) {
            const registered_event = event_updates[i];
            const events = world.get_resource_mut_by_id(registered_event.component_id);
            if (events) {
                const has_changed = events.has_changed_since(last_change_tick);
                if (registered_event.previously_updated || has_changed) {
                    registered_event.update(events);
                    registered_event.previously_updated = has_changed || !registered_event.previously_updated;
                }
            }
        }
    }

    deregister_events(type: Event, world: World) {
        const events_type = type;
        const component_id = world.init_resource(events_type as any);
        const registry = world.get_resource_or_init(EventRegistry as any) as EventRegistry;
        registry.#event_updates = registry.#event_updates.filter(e => e.component_id === component_id);
        world.remove_resource(events_type);
    }
})

export type ShouldUpdateEvents = 0 | 1 | 2;
export const ShouldUpdateEvents = {
    // Without any fixed timestep, events should always be updated each frame.
    Always: 0,
    // We need to wait until at least one pass of the fixed update schedules to update the events.
    Waiting: 1,
    // At least one pass of the fixed update schedules has occured, and the events are ready to be updated.
    Ready: 2,
} as const

