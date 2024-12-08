import { ArchetypeComponentId, ArchetypeGeneration } from "../archetype";
import { ComponentId } from "../component";
import { Access, FilteredAccessSet } from "../query";
import { World, WorldId } from "../world";
import { SystemMeta } from "./system";
import { SystemParam } from "./system-param";



class SystemState<Param extends SystemParam<any, any>> {
    #meta: SystemMeta;
    #param_state: any //Param::State
    #world_id: WorldId;
    #archetype_generation: ArchetypeGeneration;

    constructor(world: World, type: any) {
        const meta = new SystemMeta(type);
        // const param_state = Param.init_state(world, meta);
        this.#meta = meta;
        this.#param_state = undefined as any
        // this.#param_state = param_state;
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
        // this.validate_world(world.id());

        // this.update_archetypes(world);

        // return this.get_unchecked_manual(world);
    }
}