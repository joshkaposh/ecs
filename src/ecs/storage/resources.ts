import { Iterator } from "joshkaposh-iterator";
import { Option, is_some } from "joshkaposh-option";
import { Component, ComponentId, Components, ComponentTicks, Resource, Tick } from "../component";
import { SparseSet } from "./sparse-set";
import { ArchetypeComponentId } from "../archetype";
import { $read_and_write, $readonly, Ticks, TicksMut } from "../change_detection";
import { World } from "../world";

class ResourceData {
    #data: Option<InstanceType<Resource>>;
    #added_ticks: Tick;
    #changed_ticks: Tick;
    #type_name: string;
    #id: ArchetypeComponentId;

    constructor(id: ArchetypeComponentId, data: any, type_name: string, added_ticks: Tick, changed_ticks: Tick) {
        this.#id = id;
        this.#data = data;
        this.#type_name = type_name;
        this.#added_ticks = added_ticks;
        this.#changed_ticks = changed_ticks;
    }

    name() {
        return this.#type_name;
    }

    is_present(): boolean {
        return is_some(this.#data);
    }

    id() {
        return this.#id;
    }

    get(): Option<InstanceType<Resource>> {
        if (is_some(this.#data)) {
            return $readonly(this.#data);
        }
    }

    get_mut(last_run: Tick, this_run: Tick): Option<InstanceType<Resource>> {
        const data = this.get_with_ticks();
        return data ? $read_and_write(data[0], TicksMut.from_tick_cells(data[1], last_run, this_run)) : undefined
    }

    get_ticks() {
        return this.is_present() ? new ComponentTicks(this.#added_ticks, this.#changed_ticks) : undefined;
    }

    get_with_ticks(): Option<[InstanceType<Resource>, ComponentTicks]> {
        if (this.is_present()) {
            return [this.#data, new ComponentTicks(this.#added_ticks, this.#changed_ticks)]
        }
        return;
    }

    insert(value: InstanceType<Resource>, change_tick: Tick) {
        if (this.is_present()) {
            this.#data = value
        } else {
            this.#data = value;
            this.#added_ticks = change_tick;
        }
        this.#changed_ticks = change_tick;
    }

    insert_with_ticks(value: InstanceType<Resource>, change_ticks: ComponentTicks) {
        this.#data = value;
        this.#added_ticks = change_ticks.added;
        this.#changed_ticks = change_ticks.changed;
    }

    remove(): Option<[InstanceType<Component>, ComponentTicks]> {
        if (!this.is_present()) {
            return;
        }

        const res = this.#data;
        this.#data = null;
        return [res, new ComponentTicks(this.#added_ticks, this.#changed_ticks)];
    }

    remove_and_drop() {
        this.#data = null;
    }
}

export class Resources {
    #resources: SparseSet<ComponentId, ResourceData>;
    constructor() {
        this.#resources = SparseSet.default();
    }

    check_change_ticks(change_tick: Tick) {
        // this.#resources.check_change_ticks(change_tick);
    }

    clear() {
        this.#resources.clear();
    }

    len(): number {
        return this.#resources.len();
    }

    iter(): Iterator<[ComponentId, ResourceData]> {
        return this.#resources.iter();
    }

    is_empty(): boolean {
        return this.#resources.is_empty();
    }

    get(component_id: ComponentId): Option<ResourceData> {
        return this.#resources.get(component_id)
    }

    /**
     * 
     *  @description
     * Fetches or initializes a new resource and returns back it's underlying column.
     * @throws Will Error if `component_id` is not valid for the provided `components`
     */
    __initialize_with(component_id: ComponentId, components: Components, f: () => ArchetypeComponentId): ResourceData {
        return this.#resources.get_or_insert_with(component_id, () => {
            const component_info = components.get_info(component_id)!;
            return new ResourceData(
                f(),
                component_info.type(),
                component_info.name(),
                new Tick(0),
                new Tick(0),
            )
        })
    }
}