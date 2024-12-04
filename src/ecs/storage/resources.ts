import { Iterator } from "joshkaposh-iterator";
import { Option, is_some } from "joshkaposh-option";
import { Component, ComponentId, Components } from "../component";
import { SparseSet } from "./sparse-set";
import { ArchetypeComponentId } from "../archetype";

class ResourceData {
    #data: Option<InstanceType<Component>>;
    #type_name: string;
    #id: ArchetypeComponentId;
    // origin_thread_id: Option<ThreadId>

    constructor(id: ArchetypeComponentId, data: any, type_name: string) {
        this.#id = id;
        this.#data = data;
        this.#type_name = type_name;
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

    get_data(): Option<InstanceType<Component>> {
        return this.#data;
    }

    insert(value: InstanceType<Component>) {
        this.#data = value;
    }

    remove(): Option<InstanceType<Component>> {
        if (!this.is_present()) {
            return;
        }

        const res = this.#data;
        this.#data = null;
        return res;
    }

    remove_and_drop() {
        if (this.is_present()) {
            this.#data = null;
        }
    }
}

export class Resources {
    #resources: SparseSet<ComponentId, ResourceData>;
    constructor() {
        this.#resources = SparseSet.default();
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
            return new ResourceData(f(), component_info.type(), component_info.type().name)
        })
    }
}