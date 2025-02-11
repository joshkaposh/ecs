import { define_system, set } from "../define";
import { define_condition } from "../system";
import { EventRegistry, ShouldUpdateEvents } from "./event_registry";

export const EventUpdates = set();

export const signal_event_update_system = define_system((b) => b.res_mut_opt(EventRegistry), (registry) => {
    if (registry) {
        registry.v.should_update = ShouldUpdateEvents.Ready;
    }
})

export const event_update_system = define_system((b) => b.world().last_change_tick(), (world, last_change_tick) => {
    if (world.contains_resource(EventRegistry)) {
        world.resource_scope(EventRegistry, (world, registry) => {
            registry.v.run_updates(world, last_change_tick.value);

            const registry_should_update = registry.v.should_update;

            registry.v.should_update = registry_should_update === ShouldUpdateEvents.Always ?
                // If we're always updating, keep doing so
                registry_should_update :
                // Disable the system until signal_event_update_system runs again.
                ShouldUpdateEvents.Waiting;
            return registry;
        })
    }
    last_change_tick.value.set(world.change_tick().get());
})

export const event_update_condition = define_condition((b) => b.res_opt(EventRegistry), (maybe_signal) => {
    if (maybe_signal) {
        return ShouldUpdateEvents.Waiting !== maybe_signal.v.should_update;
    } else {
        return true;
    }
})