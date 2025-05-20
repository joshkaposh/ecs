import {
    // Added,
    All,
    // Changed,
    Component, ComponentId, Query, QueryData, QueryDataTuple, QueryFilter, QueryState, StorageType, With, Without, World
} from "ecs";
import { FilteredAccess, UnboundedAccessError } from "./access";

export class QueryBuilder<const D extends any[] = [], const F extends any[] = []> {
    #world: World;
    #access: FilteredAccess;

    #or: boolean;
    #first: boolean;
    // @ts-expect-error
    #D!: QueryData;
    // @ts-expect-error
    #F!: QueryFilter;

    #data: D;
    #filter: F;

    constructor(world: World, data: D, filter: F) {
        const D = new QueryDataTuple(data);
        const F = All(...filter);
        const fetch_state = D.init_state(world);
        const filter_state = F.init_state(world);

        const access = new FilteredAccess();
        D.update_component_access(fetch_state, access);

        const filter_access = new FilteredAccess();
        F.update_component_access(filter_state, filter_access);

        access.extend(filter_access);

        this.#world = world;
        this.#access = access;
        this.#data = data;
        this.#filter = filter;
        this.#D = D;
        this.#F = F;
        this.#or = false;
        this.#first = false;
    }

    is_dense() {
        const is_dense = (component_id: number) => this.#world.components.getInfo(component_id)?.storageType === StorageType.Table;
        const component_accesses = this.#access.access().try_iter_component_access();
        if (component_accesses instanceof UnboundedAccessError) {
            return false;
        }

        return component_accesses
            .map(access => access.index())
            .all(is_dense)
            && !this.#access.__access.has_read_all_components()
            && this.#access.with_filters().all(is_dense)
            && this.#access.without_filters().all(is_dense);
    }

    world() {
        return this.#world;
    }

    extend_access(access: FilteredAccess) {
        if (this.#or) {
            if (this.#first) {
                access.__required.clear();
                this.#access.extend(access);
                this.#first = false;
            } else {
                this.#access.append_or(access)
            }
        } else {
            this.#access.extend(access);
        }
    }

    data<T extends QueryData>(data: T) {
        const state = data.init_state(this.#world);
        const access = new FilteredAccess();
        data.update_component_access(state, access);
        this.extend_access(access);
        return this;
    }

    filter<T extends QueryFilter>(data: T) {
        const state = data.init_state(this.#world);
        const access = new FilteredAccess();
        data.update_component_access(state, access);
        this.extend_access(access);
        return this;
    }

    with<T extends Component>(type: T): this {
        this.filter(With(type));
        return this;
    }

    with_id(id: ComponentId) {
        const access = new FilteredAccess();
        access.and_with(id);
        this.extend_access(access);
        return this;
    }

    without<T extends Component>(type: T) {
        this.filter(Without(type));
        return this;
    }

    without_id(id: ComponentId) {
        const access = new FilteredAccess();
        access.and_without(id);
        this.extend_access(access);
        return this;
    }

    ref_id(id: ComponentId) {
        this.with_id(id);
        this.#access.add_component_read(id);
        return this;
    }

    mut_id(id: ComponentId) {
        this.with_id(id);
        this.#access.add_component_write(id);
        return this;
    }

    optional(fn: (builder: QueryBuilder) => void) {
        const builder = new QueryBuilder(this.#world, [], []);
        fn(builder as any);
        this.#access.extend_access(builder.access());
        return this;
    }

    ref<T extends Component>(_type: T) { }

    mut<T extends Component>(_type: T) { }

    and(fn: (builder: QueryBuilder) => void) {
        const builder = new QueryBuilder(this.#world, [], []);
        fn(builder);
        const access = builder.access().clone();
        this.extend_access(access);
        return this;
    }

    or(fn: (builder: QueryBuilder) => void) {
        const builder = new QueryBuilder(this.#world, [], []);
        builder.#or = true;
        builder.#first = true;
        fn(builder);
        this.extend_access(builder.access());
        return this;
    }

    access() {
        return this.#access;
    }

    transmute<NewD extends QueryData>(NewD: NewD) {
        this.transmute_filtered(NewD, [] as any);
    }

    transmute_filtered<NewD extends QueryData, NewF extends QueryFilter>(NewD: NewD, NewF: NewF) {
        const fetch_state = NewD.init_state(this.#world);
        const filter_state = NewF.init_state(this.#world);

        NewD.set_access(fetch_state, this.#access);

        const access = new FilteredAccess();
        NewD.update_component_access(fetch_state, access);
        NewF.update_component_access(filter_state, access);

        this.extend_access(access);
    }

    // added<T extends Component>(type: T) {
    //     this.#filter_components.push(Added(type));
    //     return this
    // }

    // changed<T extends Component>(type: T) {
    //     this.#filter_components.push(Changed(type));
    //     return this
    // }

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
        const state = QueryState.new(this.#data as any, this.#filter as any, this.#world)
        return new Query(this.#world, state, this.#world.lastChangeTick, this.#world.changeTick)
    }


}

