import { World } from "../world";
import { QueryState } from "./state";
import { Maybe, QueryData, Read, Write } from "./fetch";
import { QueryFilter } from "./filter";
import { Iterator } from "joshkaposh-iterator";
import { Option } from "joshkaposh-option";

type Inst<T> = T extends new (...args: any) => infer I ? I : never;

export type RemapToInstance<T extends readonly any[]> = {
    [K in keyof T]:
    // T[K] extends Array<any> ? RemapToInstance<T[K]> :
    T[K] extends Write<infer C> | Read<infer C> ? Inst<C> :
    T[K] extends Maybe<infer C> ? Option<Inst<C>> :
    T[K] extends new (...args: any[]) => infer C ? C :
    never
}

export class Query<const D extends readonly any[], const F extends readonly any[]> {
    #world: World;
    #state: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>;
    #force_read_only_component_access: boolean;

    constructor(world: World, state: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>, force_read_only_component_access: boolean = false) {
        this.#world = world;
        this.#state = state;
        this.#force_read_only_component_access = force_read_only_component_access;
    }

    data(): QueryData<any, any, any> {
        return this.#state.D;
    }

    filter(): QueryFilter<any, any, any> {
        return this.#state.F;
    }

    get(index: number): Option<RemapToInstance<D>> {
        return this.iter().skip(index).next().value
    }

    get_many(index: number, amount: number): Iterator<RemapToInstance<D>> {
        return this.iter().skip(index).take(amount);
    }

    count(): number {
        return this.iter().count()
    }

    one(): RemapToInstance<D> {
        const next = this.iter().next();
        if (next.done) {
            throw new Error('Query.one() expected at least one entity, but got none')
        }
        return next.value;
    }

    is_empty(): boolean {
        return this.iter().count() === 0;
    }

    iter(): Iterator<RemapToInstance<D>> {
        return this.#state.iter(this.#world);
    }

    [Symbol.iterator]() {
        return this.iter()
    }
}