import type { Events, SendBatchIds } from "./collections";
import type { Event, EventId } from "./event.type";
import type { Iterator } from "joshkaposh-iterator";
import { type SystemMeta, defineParam } from "../system";
import { ResMut, TicksMut } from "../change_detection";
import type { World } from "../world";
import type { ComponentId, ComponentTicks, Tick } from "../component";
import { Default } from "../default";

class EventWriter<E extends Event> {
    #events: Events<E>;

    constructor(events: Events<E>) {
        this.#events = events;
    }

    static init_state<E extends Event>(world: World, system_meta: SystemMeta, event: E) {
        return ResMut.init_state(world, system_meta, event)
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        return ResMut.validate_param(component_id, _system_meta, world);
    }

    static get_param<E extends Event>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {

        const tuple = world.getResourceWithTicks(component_id) as [Events<E>, ComponentTicks];
        if (!tuple) {
            throw new Error(`Resource requested by ${system_meta.name} does not exist`);
        }

        const [ptr, ticks] = tuple;

        return new ResMut(new EventWriter(ptr), new TicksMut(ticks, system_meta.last_run, change_tick))
    }

    send(event: InstanceType<E>) {
        this.#events.send(event);
    }

    send_batch(events: Iterator<InstanceType<E>>): SendBatchIds {
        return this.#events.sendBatch(events);
    }

    send_default<T extends E extends Default<E> ? EventId : never>(): T {
        return this.#events.sendDefault() as T;
    }
}

defineParam(EventWriter);

export { EventWriter }

