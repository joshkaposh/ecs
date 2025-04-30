import type { Events, SendBatchIds } from "./collections";
import type { Event, EventId } from "./base";
import type { Iterator } from "joshkaposh-iterator";
import { defineParam, SystemMeta } from "../system";
import { ResMut } from "../change_detection";
import { World } from "../world";
import { ComponentId, Tick } from "../component";

class EventWriter<E extends Event> {
    #events: Events<E>;

    constructor(events: Events<E>) {
        this.#events = events;
    }

    static init_state<E extends Event>(world: World, system_meta: SystemMeta, event: E) {
        // @ts-expect-error
        return ResMut.init_state(world, system_meta, event.ECS_EVENTS_TYPE)
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        return ResMut.validate_param(component_id, _system_meta, world);
    }

    static get_param(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        return ResMut.get_param(component_id, system_meta, world, change_tick);
    }

    send(event: InstanceType<E>) {
        this.#events.send(event);
    }

    send_batch(events: Iterator<InstanceType<E>>): SendBatchIds<E> {
        return this.#events.send_batch(events);
    }

    send_default<T extends E extends { default(): InstanceType<E> } ? E : never>(): EventId<T> {
        return this.#events.send_default();
    }
}

defineParam(EventWriter);

export { EventWriter }

