import { ShouldUpdateEvents, EventRegistry } from "ecs";
import { set, defineSystem, defineCondition } from "define";

export const EventUpdates = set();

export const signal_event_update_system = defineSystem((b) => b.optResMut(EventRegistry), function signal_event_update_system(registry) {
    if (registry) {
        registry.v.should_update = ShouldUpdateEvents.Ready;
    }
})

export const event_update_system = defineSystem((b) => b.world().lastChangeTick(), function event_update_system(world, last_change_tick) {
    if (world.hasResource(EventRegistry)) {
        world.resourceScope(EventRegistry, (world, registry) => {
            const r = registry.bypassChangeDetection();
            r.runUpdates(world, last_change_tick.value);

            const registry_should_update = r.should_update;

            r.should_update = registry_should_update === ShouldUpdateEvents.Always ?
                // If we're always updating, keep doing so
                registry_should_update :
                // Disable the system until signal_event_update_system runs again.
                ShouldUpdateEvents.Waiting;
            return registry;
        })
    }
    last_change_tick.value = world.changeTick;
})

export const event_update_condition = defineCondition((b) => b.optRes(EventRegistry), function event_update_condition(maybe_signal) {
    if (maybe_signal) {
        return ShouldUpdateEvents.Waiting !== maybe_signal.v.should_update;
    } else {
        return true;
    }
})