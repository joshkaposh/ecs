import { ArchetypeComponentId, ArchetypeGeneration } from "../archetype";
import { ComponentId } from "../component";
import { Access, FilteredAccessSet } from "../query";
import { World, WorldId } from "../world";
import { SystemParam } from "./system-param";

export class SystemMeta {
    __name: string; // Cow<str>;
    __component_access_set: FilteredAccessSet<ComponentId>;
    __archetype_component_access: Access<ArchetypeComponentId>;
    #is_send: boolean;
    #has_deferred: boolean;

    constructor(type: any) {
        const name = type_name(type); //std::any::type_name<T>();
        this.__name = name;
        this.__archetype_component_access = Access.default();
        this.__component_access_set = FilteredAccessSet.default();
        this.#is_send = true;
        this.#has_deferred = false;
    }

    name(): string {
        return this.__name;
    }

    is_send(): boolean {
        return this.#is_send
    }

    set_non_send(): void {
        this.#is_send = false;
    }

    has_deferred(): boolean {
        return this.#has_deferred;
    }

    set_has_deferred(): void {
        this.#has_deferred = true;
    }


    clone() {
    }
}

class SystemState<Param extends SystemParam<any, any>> {
    #meta: SystemMeta;
    #param_state: any //Param::State
    #world_id: WorldId;
    #archetype_generation: ArchetypeGeneration;

    constructor(world: World, type: any) {
        const meta = new SystemMeta(type);
        const param_state = Param.init_state(world, meta);
        this.#meta = meta;
        this.#param_state = param_state;
        this.#world_id = world.id();
        this.#archetype_generation = ArchetypeGeneration.initial();
    }

    meta(): SystemMeta {
        return this.#meta;
    }

    /**
     * @summary Retrieve the [`SystemParam`] values. This can only be called when all parameters are read-only.
     */
    get(world: World) {
        this.validate_world(world.id());

        this.update_archetypes(world);

        return this.get_unchecked_manual(world);
    }
}