import { QueryFilter } from "..";
import { World } from "../world";
import { QueryState } from "./state";
import { QueryData } from "./world-query";


export class Query<D extends QueryData, F extends QueryFilter> {
    #world: World;
    #state: QueryState<D, F>;
    #force_read_only_component_access: boolean;

    constructor(world: World, state: QueryState<D, F>, force_read_only_component_access: boolean) {
        this.#world = world;
        this.#state = state;
        this.#force_read_only_component_access = force_read_only_component_access;
    }

}