import { Result, is_error } from "joshkaposh-option";
import { Entity } from "../entity";
import { World } from "../world";
import { type Unit } from "../../util";
import { QueryState } from "./state";
import { QueryData, ROQueryItem } from "./fetch";
import { QueryFilter } from "./filter";
import { QueryEntityError, QuerySingleError } from "./error";

export type WorldQueryState<T extends {}> = T

export type WorldQueryItem<T extends {}> = T;
// 
// export type QueryItem<T extends {}> = WorldQueryItem<T>;

export type EntityList = any;

export class QueryLens<D extends QueryData<any>, F extends QueryFilter<any>> {
    #world: World;
    #state: QueryState<D, F>;
    #force_read_only_component_access: boolean;

    constructor(world: World, state: QueryState<D, F>, force_read_only_component_access: boolean) {
        this.#world = world;
        this.#state = state;
        this.#force_read_only_component_access = force_read_only_component_access;
    }

    static from<D extends QueryData<any>, F extends QueryFilter<any>>(value: Query<D, F>, new_data: D, new_filter: F): QueryLens<D, F> {
        return value.transmute_lens_filtered(new_data, new_filter);
    }

    query() {
        return new Query(this.#world, this.#state, this.#force_read_only_component_access)
    }
}

export class Query<D extends QueryData<{}, Unit, Unit>, F extends QueryFilter<{}, Unit, Unit>> {
    #world: World;
    #state: QueryState<D, F>;
    #force_read_only_component_access: boolean;

    constructor(world: World, state: QueryState<D, F>, force_read_only_component_access: boolean) {
        // @ts-expect-error
        this.validate_world(world.id());
        this.#world = world;
        this.#state = state;
        this.#force_read_only_component_access = force_read_only_component_access;
    }

    static from<D extends QueryData<any>, F extends QueryFilter<any>>(value: QueryLens<D, F>): Query<D, F> {
        return value.query();
    }

    to_readonly(): Query<D, F> {
        const new_state = this.#state;
        return new Query(this.#world, new_state, true);
    }

    transmute_lens<NewD extends QueryData<{}, Unit, Unit>>(new_data: NewD): QueryLens<NewD, QueryFilter<Unit>> {
        // @ts-expect-error
        return this.transmute_lens_filtered<NewD, QueryFilter<Unit>>(new_data)
    }

    transmute_lens_filtered<NewD extends QueryData<{}, Unit, Unit>, NewF extends QueryFilter<{}, Unit, Unit>>(new_data: NewD, new_filter: NewF): QueryLens<NewD, NewF> {
        const world = this.#world;
        const state = this.#state.transmute_filtered(world, new_data, new_filter as any);
        return new QueryLens(
            world,
            state,
            this.#force_read_only_component_access
        );
    }

    /**
     * @description Returns an `Iterator` over the read-only query items.
     * 
     * @example
     * import { register_component } from 'ecs'
     * 
     * class Player { constructor( public name: string ) {} }
     * register_component(Player)
     * 
     * function report_player_names(query: Query<Player>) {
     *      for (const player of query) {
     *          console.log(`Say hello to ${player.name}`)
     *      }
     * }
     *
     */
    iter() {
        return this.#state.__iter_unchecked_manual(this.#world)
    }

    /**
     * @description Returns an `Iterator` over the read-only query items.
     * 
     * @example
     * import { register_component } from 'ecs'
     * 
     * class Vector2 { constructor( public x: number, public y: number ) {} }
     * register_component(Vector2)
     * 
     * function increment_x(query: Query<Mut<Vector2>>) {
     *      for (const v of query) {
     *          let x = v.x;
     *          v.x ++;
     *          console.log(`Incremented x from ${x} to ${v.x}`)
     *      }
     * }
     */
    iter_mut() {
        return this.#state.__iter_unchecked_manual(this.#world);
    }

    /**
     * @description Returns a [`QueryCombinationIter`] over all combinations of `K` read-only query items without repetition.
     * 
     * @example
     * 
     * import { register_component } from 'ecs'
     * 
     * class ComponentA {}
     * register_component(ComponentA)
     * 
     * function some_system(query: Query<ComponentA>) {
     *      for (const [a1, a2] of query.iter_combinations()) {
     *          // ...
     *      }
     * }
     */
    iter_combinations(k: number) {
        return this.#state.__iter_combinations_unchecked_manual(this.#world, k);
    }

    /**
     * @description Returns a `QueryCombinationIter` over all combinations of `K` query items without repetition.
     * 
     * @example
     * import { register_component } from 'ecs'
     * 
     * class ComponentA {}
     * register_component(ComponentA);
     * 
     * function some_system(query: Query<Mut<ComponentA>>) {
     *      const combinations = query.iter_combinations_mut();
     *      let n;
     *      while(!(n = combinations.fetch_next()).done) {
     *      const [a1, a2] = n.value
     *      // mutably access data
     *      }
     * }
    */
    iter_combinations_mut(k: number) {
        return this.#state.__iter_combinations_unchecked_manual(this.#world, k);
    }

    /**
     * @description
     * Returns an [`Iterator`] over the read-only query items generated from an [`Entity`] list.
     * Items are returned in the order of the list of entities.
     * Entities that don't match the query are skipped.
     */
    // returns QueryManyIter
    iter_many(entities: EntityList) {
        return this.#state.__iter_many_unchecked_manual(entities, this.#world);
    }

    // returns QueryManyIter
    iter_many_mut(entities: EntityList) {
        return this.#state.__iter_many_unchecked_manual(entities, this.#world);
    }

    iter_unsafe() {
        return this.#state.__iter_unchecked_manual(this.#world);
    }

    for_each(fn: (data: D) => void) {
        this.#state
            .__iter_unchecked_manual(this.#world)
            .for_each(fn);
    }

    for_each_mut(fn: (data: D) => void) {
        this.#state
            .__iter_unchecked_manual(this.#world)
            .for_each(fn);
    }

    get(entity: Entity): Result<ROQueryItem<D>, QueryEntityError> {
        return this.#state.get_unchecked_manual(
            this.#world,
            entity
        )
    }

    get_many(entities: Entity[]): Result<ROQueryItem<D>, QueryEntityError> {
        return this.#state.get_many_read_only_manual(this.#world, entities)
    }

    many(entities: Entity[]) {
        const items = this.get_many(entities);
        if (is_error(items)) {
            throw new Error(`Cannot get query results: ${items.get()}`)
        }
        return items;
    }

    get_mut(entity: Entity): Result<any, QueryEntityError> {
        this.#state.get_unchecked_manual(this.#world, entity)
    }

    get_many_mut(entities: Entity[]): Result<any[], QueryEntityError> {
        return this.#state.get_many_unchecked_manual(this.#world, entities);
    }

    many_mut(entities: Entity[]): Result<any, QueryEntityError> {
        const items = this.get_many_mut(entities);
        if (is_error(items)) {
            throw new Error(`Cannot get query result: ${items.get()}`)
        }
        return items;
    }

    get_unchecked(entity: Entity) {
        this.#state.get_unchecked_manual(this.#world, entity);
    }

    single(): ROQueryItem<D> {
        const s = this.get_single()
        if (is_error(s)) {
            throw new Error('QuerySingleError')
        }
        return s;
    }

    get_single(): Result<ROQueryItem<D>, QuerySingleError> {
        return this.#state.get_single_unchecked_manual(this.#world);
    }

    single_mut(): ROQueryItem<D> {
        const s = this.get_single_mut()
        if (is_error(s)) {
            throw new Error('QuerySingleError')
        }
        return s;
    }

    get_single_mut(): Result<ROQueryItem<D>, QuerySingleError> {
        return this.#state.get_single_unchecked_manual(this.#world);
    }

    is_empty(): boolean {
        return this.#state.is_empty(this.#world)
    }

    contains(entity: Entity) {
        return !is_error(this.#state.as_nop().get_unchecked_manual(this.#world, entity))
    }
}