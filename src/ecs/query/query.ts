import { World } from "../world";
import { QueryState } from "./state";
import { QueryData } from "./fetch";
import { QueryFilter } from "./filter";

export class Query<D extends QueryData, F extends QueryFilter> {
    #world: World;
    #state: QueryState<D, F>;
    #force_read_only_component_access: boolean;

    constructor(world: World, state: QueryState<D, F>, force_read_only_component_access: boolean) {
        this.#world = world;
        this.#state = state;
        this.#force_read_only_component_access = force_read_only_component_access;
    }

    data(): D {
        return this.#state.D;
    }

    filter(): F {
        return this.#state.F;
    }

    iter() {
        return this.#state.iter(this.#world);
    }

    [Symbol.iterator]() {
        return this.iter()
    }
}