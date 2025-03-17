import { Added, Changed, Component, Query, QueryData, QueryFilter, QueryState, With, Without, World } from "ecs";
import { FilteredAccess } from "./access";

export class QueryBuilder<const D extends any[], const F extends any[]> {
    #access: FilteredAccess;
    #world: World;

    #data!: QueryData<any, any, any>;
    #filter!: QueryFilter<any, any, any>;

    #data_components: D;
    #filter_components: F;

    constructor(world: World, data: D) {
        // const fetch_state = d.init_state(world);
        // const filter_state = f.init_state(world);

        // const access = FilteredAccess.default();
        // d.update_component_access(fetch_state, access);

        // const filter_access = FilteredAccess.default();
        // f.update_component_access(filter_state, filter_access);

        // access.extend(filter_access);

        // this.#access = access;
        this.#world = world;
        this.#access = new FilteredAccess();
        this.#data_components = data;
        this.#filter_components = [] as unknown as F;
        // this.#data = data;
        // this.#filter = f;
    }

    with<T extends Component>(type: T): this {
        this.#filter_components.push(With(type))
        return this;
    }

    without<T extends Component>(type: T) {
        this.#filter_components.push(Without(type))
        return this;
    }

    added<T extends Component>(type: T) {
        this.#filter_components.push(Added(type));
        return this
    }

    changed<T extends Component>(type: T) {
        this.#filter_components.push(Changed(type));
        return this
    }

    // #build_data() {
    //     const components = this.#data_components;
    //     const data = QueryDataTuple.from_data(components);
    //     this.#data = data;
    // }

    // #build_filter() {
    //     const components = this.#filter_components;
    //     const filter = All(...components);
    //     this.#filter = filter;
    // }

    build() {
        const state = QueryState.new(this.#data_components as any, this.#filter_components as any, this.#world)
        return new Query(this.#world, state, this.#world.last_change_tick(), this.#world.change_tick())
    }


}

