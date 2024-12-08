import { ComponentId, QueryData, QueryFilter, World } from "..";
import { FilteredAccess } from "./access";

export class QueryBuilder<D extends QueryData<any>, F extends QueryFilter<any>> {
    #access: FilteredAccess<ComponentId>;
    #world: World;
    #or: boolean;
    #first: boolean;

    #data: D;
    #filter: F;

    constructor(world: World, d: D, f: F) {
        const fetch_state = d.init_state(world);
        const filter_state = f.init_state(world);

        const access = FilteredAccess.default();
        d.update_component_access(fetch_state, access);

        const filter_access = FilteredAccess.default();
        f.update_component_access(filter_state, filter_access);

        access.extend(filter_access);

        this.#access = access;
        this.#world = world;
        this.#data = d;
        this.#filter = f;
        this.#or = false;
        this.#first = false;
    }

    // world() {
    //     return this.#world
    // }

    // extend_access(access: FilteredAccess<ComponentId>) {
    //     if (this.#or) {
    //         if (this.#first) {
    //             access.__required.clear();
    //             this.#access.extend(access);
    //             this.#first = false;
    //         } else {
    //             this.#access.append_or(access);
    //         }
    //     } else {
    //         this.#access.extend(access);
    //     }
    // }

    // /**
    //  * @summary Adds accessess required for `T` to self.
    //  */
    // data<T extends QueryData<any>>(t: T): this {
    //     const state = t.init_state(this.#world);
    //     const access = FilteredAccess.default();
    //     t.update_component_access(state, access);
    //     this.extend_access(access);
    //     return this;
    // }

    // /**
    //  * @summary Addes filter from `T to self.
    //  */
    // filter<T extends QueryFilter<any>>(t: T): this {
    //     const state = t.init_state(this.#world);
    //     const access = FilteredAccess.default();
    //     t.update_component_access(state, access);
    //     this.extend_access(access);
    //     return this;
    // }

    // with<T extends Component>(type: T): this {
    //     this.filter(With(type) as any)
    //     return this
    // }

    // with_id(id: ComponentId): this {
    //     const access = FilteredAccess.default();
    //     access.and_with(id);
    //     this.extend_access(access);
    //     return this;
    // }

    // without<T extends Component>(type: T): this {
    //     this.filter(Without(type) as any);
    //     return this
    // }

    // without_id(id: ComponentId): this {
    //     const access = FilteredAccess.default();
    //     access.and_without(id);
    //     this.extend_access(access);
    //     return this;
    // }

    // /**
    //  * Adds `T` to the [`FilteredAccess`] of self
    //  */
    // ref_id(id: ComponentId): this {
    //     this.with_id(id);
    //     this.#access.add_read(id);
    //     return this
    // }

    // mut_id(id: ComponentId): this {
    //     this.with_id(id);
    //     this.#access.add_write(id);
    //     return this
    // }

    // /**
    //  * @description
    //  * Takes a function over mutable access to a [`QueryBuilder`], calls that function
    //  * on an empty builder and then adds all accesses from that builder to self as optional.
    //  */
    // optional(fn: (builder: QueryBuilder<D, F>) => void): this {
    //     const builder = new QueryBuilder(this.#world, this.#data, this.#filter);
    //     fn(builder);
    //     this.#access.extend_access(builder.#access);
    //     return this
    // }

    // and(fn: (builder: QueryBuilder<D, F>) => void): this {
    //     const builder = new QueryBuilder(this.#world, this.#data, this.#filter);
    //     fn(builder);
    //     const access = builder.#access.clone();
    //     this.#access.extend_access(access);
    //     return this
    // }

    // or(fn: (builder: QueryBuilder<D, F>) => void): this {
    //     const builder = new QueryBuilder(this.#world, this.#data, this.#filter);
    //     builder.#or = true;
    //     builder.#first = true;
    //     fn(builder);
    //     this.#access.extend(builder.#access)
    //     return this
    // }

    // access(): FilteredAccess<ComponentId> {
    //     return this.#access
    // }

    // transmute<NewD extends QueryData<any>>(new_d: NewD): QueryBuilder<NewD, F> {
    //     // TODO
    //     // @ts-expect-error
    //     return this.transmute_filtered(new_d, UNIT);
    // }

    // transmute_filtered<NewD extends QueryData<any>, NewF extends QueryFilter<any>>(new_d: NewD, new_f: NewF): QueryBuilder<NewD, NewF> {
    //     const fetch_state = new_d.init_state(this.#world);
    //     const filter_state = new_f.init_state(this.#world);
    //     new_d.set_access(fetch_state, this.#access);

    //     const access = FilteredAccess.default();
    //     new_d.update_component_access(fetch_state, access);
    //     new_f.update_component_access(filter_state, access);

    //     this.extend_access(access);

    //     return this as unknown as QueryBuilder<NewD, NewF>;
    // }

    // build() {
    //     return QueryState.from_builder(this.#data, this.#filter, this);
    // }
}

