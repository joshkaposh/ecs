import { Archetype } from "../archetype";
import { World } from "../world";

export abstract class SystemParam<State extends any, Item extends SystemParam> {

    abstract init_state(world: World): State;

    // @ts-expect-error
    new_archetype(state: State, archetype: Archetype, system_meta: SystemMeta) { }

    // @ts-expect-error
    apply(state: State, system_meta: SystemMeta, world: World) { }

    abstract get_param(state: State, system_meta: SystemMeta, world: World): Item;
}

class ParamSet<T extends SystemParam<any, any>> {
    #param_states: T;
    #world: World;
    #system_meta: SystemMeta;
}