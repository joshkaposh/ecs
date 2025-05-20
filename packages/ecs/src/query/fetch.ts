import type { Option, View } from "joshkaposh-option";
import { ComponentProxy, ComponentRecord, defineWorldQuery } from "define";
import { Archetype, Component, ComponentId, Components, DeferredWorld, EntityMut, EntityRef, FilteredAccess, is_component, is_thin_component, Resource, Resources, StorageType, ThinComponents, ThinWorld, Tick, World } from "ecs";
import { unit, debug_assert, Instance } from "../util";
import { Entity } from "../entity";
import { Table, TableRow, ThinTable } from "../storage/table";
import { $WorldQuery, is_dense, RequiredWorldQuery, ThinWorldQuery, WorldQuery } from "./world-query";
import { ComponentSparseSet, ThinComponentSparseSet } from "../storage/sparse-set";
import { TicksMut, Ticks, Ref, Mut, ResMut, Res } from "../change_detection";
import { ComponentTicks } from "../tick";

export interface QueryData<Item = any, Fetch = any, State = any> extends WorldQuery<Item, Fetch, State> { }
export interface ReadonlyQueryData<Item extends Readonly<any> = Readonly<any>, Fetch = any, State = any> extends QueryData<Item, Fetch, State> { }

export interface ThinQueryData<Item = any, Fetch = any, State = any> extends ThinWorldQuery<Item, Fetch, State> { }
export interface ReadonlyThinQueryData<Item extends Readonly<any> = Readonly<any>, Fetch = any, State = any> extends ThinWorldQuery<Item, Fetch, State> { }

type InferQueryData<T> =
    T extends QueryData ? T :
    T extends Component ? Read<T> :
    T extends typeof Entity ? QueryEntity :
    T extends typeof EntityRef ? QueryEntityRef :
    T extends typeof EntityMut ? QueryEntityMut :
    never;

export type AsQueryItem<T> = T extends readonly any[] ? {
    [K in keyof T]: InferQueryData<T[K]> extends RequiredWorldQuery<infer Item> ? Item : never;
} : InferQueryData<T> extends RequiredWorldQuery<infer Item> ? Item : never;

export type AsQueryFetch<T> = T extends readonly any[] ? {
    [K in keyof T]: InferQueryData<T[K]> extends RequiredWorldQuery<any, infer Fetch> ? Fetch : never;
} : InferQueryData<T> extends RequiredWorldQuery<any, infer Fetch> ? Fetch : never;

export type AsQueryState<T> = T extends readonly any[] ? {
    [K in keyof T]: InferQueryData<T[K]> extends RequiredWorldQuery<any, any, infer State> ? State : never;
} : InferQueryData<T> extends RequiredWorldQuery<any, any, infer State> ? State : never;

export type RemapQueryTupleToQueryData<T extends readonly any[]> = QueryData<AsQueryItem<T>, AsQueryFetch<T>, AsQueryState<T>>

class QueryUnit implements RequiredWorldQuery<unit, unit, unit> {
    IS_DENSE = true;
    [$WorldQuery] = true as const;
    init_fetch(_world: World, _state: typeof unit, _last_run: Tick, _this_run: Tick): typeof unit {
        return unit;
    }

    fetch(_fetch: typeof unit, _entity: Entity, _table_row: TableRow): typeof unit {
        return unit;
    }

}

defineWorldQuery(QueryUnit.prototype);

class QueryEntity implements RequiredWorldQuery<Entity, unit, unit> {
    readonly IS_DENSE = true;
    readonly [$WorldQuery] = true;

    init_fetch(_world: World, _state: unit): unit {
        return unit;
    }

    fetch(_fetch: unit, entity: Entity, _table_row: number): Entity {
        return entity;
    }
}

defineWorldQuery(QueryEntity.prototype);

class QueryEntityRef implements RequiredWorldQuery<EntityRef, World, unit> {
    readonly IS_DENSE = true;
    readonly [$WorldQuery] = true;

    init_fetch(world: World, _state: unit, _last_run: Tick, _this_run: Tick): World {
        return world
    }

    fetch(world: World, entity: Entity, _table_row: number): EntityRef {
        return world.getEntity(entity)!;
    }

    update_component_access(_state: unit, access: FilteredAccess): void {
        debug_assert(!access.__access.has_any_component_write(), 'cannot create readonly access from mutably accessed components')
        access.read_all_components();
    }

    init_state(_world: World): unit {
        return unit;
    }

    get_state(_components: Components): Option<unit> {
        return unit;
    }
}

defineWorldQuery(QueryEntityRef.prototype);

class QueryEntityMut implements RequiredWorldQuery<EntityMut, DeferredWorld, unit> {

    readonly IS_DENSE = true;
    readonly [$WorldQuery] = true;

    init_fetch(world: World, _state: unit, _last_run: Tick, _this_run: Tick) {
        return new DeferredWorld(world);
    }

    fetch(world: DeferredWorld, entity: Entity, _table_row: number) {
        return world.entityMut(entity) as EntityMut;
    }

    update_component_access(_state: unit, access: FilteredAccess): void {
        debug_assert(!access.access().has_any_component_write(), 'cannot create readonly access from mutably accessed components')
        access.read_all_components();
    }
}

defineWorldQuery(QueryEntityMut.prototype);

export class StorageSwitch<
    C,
    T extends any, // T extends Copy
    S extends any // S extends Copy
> {
    _marker: C;
    table!: T
    sparse_set!: S;

    constructor(C: C, table: () => Option<T>, sparse_set: () => Option<S>) {
        this._marker = C;
        this.table = table()!;
        this.sparse_set = sparse_set()!;
    }

    extract<R>(table: (t: T) => R, sparse_set: (s: S) => R): R {
        return this.table != null ? table(this.table) : sparse_set(this.sparse_set);
    }

    set_table(table: T) {
        if (is_dense(this._marker as Component)) {
            this.table = table as T;
        }
    }
}

interface RefFetch<T> {
    components: StorageSwitch<T, Option<[Instance<T>, Tick, Tick]>, ComponentSparseSet>
    last_run: Tick;
    this_run: Tick;
}

class RefComponent<T extends Component, R extends Ref<T>> implements QueryData<R, RefFetch<T>, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    #ty: T;
    // #refs: Array<Ref<T>>;
    constructor(component: T) {
        this.IS_DENSE = is_dense(component);
        this.#ty = component;
    }

    init_fetch(world: World, component_id: number, last_run: Tick, this_run: Tick): RefFetch<T> {
        return {
            components: new StorageSwitch(this.#ty, () => undefined, () => world.storages.sparse_sets.get(component_id)!),
            last_run,
            this_run,
        }
    }

    set_archetype(fetch: RefFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: RefFetch<T>, component_id: number, table: Table): void {
        const column = table.getColumn(component_id)!;
        const len = table.entityCount;
        // const table_data = this.#table_data;
        // table_data[0] = column.getDataSlice(len);
        // table_data[1] = column.getAddedTicksSlice(len);
        // table_data[2] = column.getChangedTicksSlice(len);

        const table_data = [
            column.getDataSlice(len),
            column.getTicksSlice(len)
            // column.getAddedTicksSlice(len)!,
            // column.getChangedTicksSlice(len)!,
        ] as const;

        // const refs = this.#refs,
        //     data = column.data

        // refs.length = column.length;
        // for (let i = 0; i <refs.length; i++) {
        //     refs[i] = new Ref(data[i], column.ticks[i])            
        // }


        fetch.components.set_table(table_data as any);
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: RefFetch<T>, entity: Entity, table_row: number): R {
        return fetch.components.extract(
            (table) => {
                const [table_components, ticks] = table!;
                const component = table_components[table_row];
                // @ts-expect-error
                const tick = ticks[table_row];
                const ref = new Ref(component, new Ticks(ticks as unknown as ComponentTicks, fetch.this_run, fetch.last_run))
                // this.#refs[table_row] = ref;
                return ref;
            },
            (sparse_set) => {
                const [component, ticks] = sparse_set.getWithTicks(entity)!;
                return new Ref(component, new Ticks(ticks, fetch.last_run, fetch.this_run))
            }
        ) as R;
    }

    update_component_access(component_id: number, access: FilteredAccess): void {
        debug_assert(!access.access().has_component_write(component_id), 'cannot add read access if write access already exists');
        access.add_component_read(component_id);
    }

    init_state(world: World): number {
        return world.registerComponent(this.#ty);
    }

    get_state(components: Components): Option<number> {
        return components.componentId(this.#ty)
    }

    matches_component_set(state: number, set_contains_id: (id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

interface ReadFetch<T> {
    components: StorageSwitch<T, Option<Instance<T>>, ComponentSparseSet>;
}

class ReadComponent<T extends Component> implements RequiredWorldQuery<Readonly<InstanceType<T>>, ReadFetch<T>, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    #ty: T;
    constructor(component: T) {
        this.IS_DENSE = is_dense(component);
        this.#ty = component;
    }

    init_fetch(world: World, component_id: number, _last_run: Tick, _this_run: Tick) {
        return {
            components: new StorageSwitch(
                this.#ty,
                () => undefined,
                () => world.storages.sparse_sets.get(component_id)!
            ),

        }
    }

    set_archetype(fetch: ReadFetch<T>, component_id: number, _archetype: Archetype, table: Table) {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: ReadFetch<T>, component_id: number, table: Table) {
        fetch.components.set_table(table.getDataSliceFor(component_id)! as Instance<T>);
    }

    fetch(fetch: ReadFetch<T>, entity: Entity, table_row: number) {
        return fetch.components.extract(
            (table: any) => {
                return table[table_row];
            },
            (sparse_set: any) => sparse_set.get(entity)
        )
    }

    update_component_access(component_id: number, access: FilteredAccess) {
        debug_assert(!access.access().has_component_write(component_id), 'cannot add read access if write access already exists');
        access.add_component_read(component_id);
    }

    init_state(world: World) {
        return world.registerComponent(this.#ty);
    }

    get_state(components: Components) {
        return components.componentId(this.#ty);
    }

    matches_component_set(state: number, set_contains_id: (id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

defineWorldQuery(ReadComponent.prototype);

interface ThinReadFetch<T> {
    components: StorageSwitch<T, Option<Instance<T>>, ThinComponentSparseSet>;
    proxy: ComponentProxy;
}

class ReadThinComponent<T extends ComponentRecord> implements ThinQueryData<Readonly<T>, ThinReadFetch<T>, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    #ty: T;
    constructor(component: T) {
        this.IS_DENSE = is_dense(component as any);
        this.#ty = component;
    }

    init_fetch(world: ThinWorld, component_id: number, _last_run: Tick, _this_run: Tick) {
        return {
            components: new StorageSwitch(
                this.#ty,
                () => undefined,
                () => world.storages.sparse_sets.get(component_id)!
            ),
            proxy: ComponentProxy.from_component(this.#ty as any)
        }
    }

    set_archetype(fetch: ThinReadFetch<T>, component_id: number, _archetype: Archetype, table: ThinTable): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table);
        }
    }

    set_table(fetch: ThinReadFetch<T>, component_id: number, table: ThinTable): void {
        fetch.components.set_table(table.getDataSliceFor(component_id) as Instance<T>);
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: ThinReadFetch<T>, entity: Entity, _table_row: number): Instance<T> {
        return fetch.components.extract(
            (table) => {
                const proxy = fetch.proxy;
                ComponentProxy.copy_raw(proxy, table as unknown as View[]);
                return proxy
            },
            (sparse_set) => sparse_set.get(entity)
        ) as Instance<T>;
    }

    update_component_access(component_id: number, access: FilteredAccess): void {
        debug_assert(!access.access().has_component_write(component_id), 'cannot add read access if write access already exists');
        access.add_component_read(component_id);
    }

    init_state(world: ThinWorld): number {
        return world.registerComponent(this.#ty as any);
    }

    get_state(components: ThinComponents): Option<number> {
        return components.componentId(this.#ty as any);
    }

    matches_component_set(state: number, set_contains_id: (id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

interface MutComponentFetch<T extends Component> {
    components: StorageSwitch<T, Option<[T, ComponentTicks]>, ComponentSparseSet>;
    last_run: Tick;
    this_run: Tick;
}

class MutComponent<T extends Component> implements QueryData<Mut<T>, MutComponentFetch<T>, ComponentId> {
    #ty: T
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    // #ptrs: SparseSet<Mut<T>>;
    #ptrs: Mut<T>[]

    constructor(ty: T) {
        this.#ty = ty;
        this.IS_DENSE = ty.storage_type === StorageType.Table;
        // this.#ptrs = new SparseSet();
        this.#ptrs = [];
    }

    init_fetch(world: World, component_id: number, last_run: Tick, this_run: Tick): MutComponentFetch<T> {
        return {
            components: new StorageSwitch(this.#ty, () => undefined, () => world.storages.sparse_sets.get(component_id)!),
            last_run,
            this_run
        }
    }

    set_archetype(fetch: MutComponentFetch<T>, component_id: number, _archetype: Archetype, table: Table): void {
        if (this.IS_DENSE) {
            this.set_table(fetch, component_id, table)
        }
    }

    set_table(fetch: MutComponentFetch<T>, component_id: number, table: Table): void {
        const column = table.getColumn(component_id)!;
        const len = table.entityCount;
        const table_data = [
            column.getDataSlice(len),
            // column.getTicksSlice(len)
        ] as const;

        fetch.components.set_table(table_data as any);
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: MutComponentFetch<T>, entity: Entity, table_row: TableRow): Mut<T> {
        return fetch.components.extract(table => {
            // const [table_components, table_ticks] = table as any[];
            const [table_components] = table as any[];

            const component = table_components[table_row];
            // const ticks = table_ticks[table_row];

            // const ptr = this.#ptrs[table_row];
            // const ptr = this.#ptrs.get(table_row);
            // return new Mut(component, new TicksMut(ticks, fetch.last_run, fetch.this_run))
            return component
            // if (ptr) {
            //     ptr.ticks = ticks;
            //     ptr.v = component;
            //     return ptr;
            // } else {
            //     const value = new Mut(component, new TicksMut(ticks, fetch.last_run, fetch.this_run));
            //     this.#ptrs[table_row] = value;
            //     // this.#ptrs.set(table_row, value);
            //     return value;
            // }
        }, sparse_set => {
            // const [component, ticks] = sparse_set.getWithTicks(entity)!;
            const [component] = sparse_set.getWithTicks(entity)!;

            return component;
            // return new Mut(component, new TicksMut(ticks, fetch.last_run, fetch.this_run))
        })
    }

    update_component_access(component_id: number, access: FilteredAccess): void {
        debug_assert(!access.access().has_component_read(component_id), 'cannot add write to access if a read access already exists')
        access.add_component_write(component_id);
    }

    init_state(world: World) {
        return world.registerComponent(this.#ty);
    }

    get_state(components: Components): Option<number> {
        return components.componentId(this.#ty);
    }

    matches_component_set(state: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

type ResourceFetch = [resource: NonNullable<ReturnType<Resources['get']>>, last_run: Tick, this_run: Tick]

class ReadResource<T extends Resource> implements QueryData<Res<T>, ResourceFetch, ComponentId> {
    readonly [$WorldQuery] = true as const;
    readonly IS_DENSE = false;

    #ty: T;
    constructor(type: T) {
        this.#ty = type;
    }

    init_fetch(world: World, state: number, last_run: Tick, this_run: Tick): ResourceFetch {
        return [
            world.storages.resources.get(state)!,
            last_run,
            this_run
        ];
    }

    init_state(world: World) {
        return world.registerResource(this.#ty);
    }

    get_state(components: Components): Option<number> {
        return components.resourceId(this.#ty);
    }

    set_table(_fetch: ResourceFetch, _state: number, _table: Table): void { }

    set_archetype(_fetch: ResourceFetch, _state: number, _archetype: Archetype, _table: Table): void { }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: ResourceFetch, _entity: Entity, _table_row: TableRow): Res<T> {
        const [data, this_run, last_run] = fetch;
        const ticks = data.getTicks()!;
        return new Res(data.getData()!, new Ticks(ticks, last_run, this_run)) as Res<T>
    }

    update_component_access(state: number, access: FilteredAccess): void {
        debug_assert(!access.__access.has_resource_write(state), `simultaneous mutable / readonly access for resource ${this.#ty} is not allowed`);
        access.__access.add_resource_read(state)
    }

    matches_component_set(state: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

class MutResource<T extends Resource> implements QueryData<ResMut<T>, ResourceFetch, ComponentId> {
    readonly [$WorldQuery] = true as const;
    readonly IS_DENSE = false;

    #ty: T;
    constructor(type: T) {
        this.#ty = type;
    }

    init_fetch(world: World, state: number, last_run: Tick, this_run: Tick): ResourceFetch {
        return [
            world.storages.resources.get(state)!,
            last_run,
            this_run
        ];
    }

    init_state(world: World) {
        return world.registerResource(this.#ty);
    }

    get_state(components: Components): Option<number> {
        return components.resourceId(this.#ty);
    }

    set_table(_fetch: ResourceFetch, _state: number, _table: Table): void { }

    set_archetype(_fetch: ResourceFetch, _state: number, _archetype: Archetype, _table: Table): void { }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: ResourceFetch, _entity: Entity, _table_row: TableRow): ResMut<T> {
        const [data, this_run, last_run] = fetch;
        const ticks = data.getTicks()!;
        return new ResMut(data.getData()!, new TicksMut(ticks, last_run, this_run)) as ResMut<T>;
    }

    update_component_access(state: number, access: FilteredAccess): void {
        debug_assert(!access.__access.has_resource_read(state), `simultaneous mutable / readonly access for resource ${this.#ty} is not allowed`);
        access.__access.add_resource_write(state)
    }

    matches_component_set(state: number, set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return set_contains_id(state);
    }
}

type OptionFetch<T> = {
    fetch: T extends RequiredWorldQuery<any, infer F> ? F : never;
    matches: boolean;
}

class OptionComponent<T extends Component> implements QueryData<Readonly<InstanceType<T>> | void, OptionFetch<ReadComponent<T>>, ComponentId> {
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    #T: ReadComponent<T>;
    constructor(component: T) {
        this.#T = new ReadComponent(component);
        this.IS_DENSE = this.#T.IS_DENSE
    }

    init_fetch(world: World, state: ComponentId, last_run: Tick, this_run: Tick): OptionFetch<ReadComponent<T>> {
        return {
            fetch: this.#T.init_fetch(world, state, last_run, this_run),
            matches: false
        };
    }

    set_archetype(fetch: OptionFetch<ReadComponent<T>>, state: ComponentId, archetype: Archetype, table: Table): void {
        fetch.matches = this.#T.matches_component_set(state, id => archetype.has(id));
        if (fetch.matches) {
            this.#T.set_archetype(fetch.fetch, state, archetype, table)
        }
    }

    set_table(fetch: OptionFetch<ReadComponent<T>>, state: any, table: Table): void {
        fetch.matches = this.#T.matches_component_set(state, id => table.hasColumn(id))
        if (fetch.matches) {
            this.#T.set_table(fetch.fetch, state, table)
        }
    }

    set_access(_state: number, _access: FilteredAccess): void { }

    fetch(fetch: OptionFetch<ReadComponent<T>>, entity: Entity, table_row: TableRow): Readonly<InstanceType<T>> | void {
        if (fetch.matches) {
            return this.#T.fetch(fetch.fetch, entity, table_row)
        }
    }

    update_component_access(state: ComponentId, access: FilteredAccess) {
        const intermediate = access.clone();
        this.#T.update_component_access(state, intermediate);
        access.extend_access(intermediate);
    }

    init_state(world: World) {
        return this.#T.init_state(world);
    }

    get_state(components: Components) {
        return this.#T.get_state(components)
    }

    matches_component_set(_state: any, _set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return true
    }
}

export type Read<T extends Component | Resource> = T extends Resource ? ReadResource<T> : ReadComponent<T>;

export function res<T extends Resource>(type: T) {
    return new ReadResource(type);
}

export function mutRes<T extends Resource>(type: T) {
    return new MutResource(type);
}

export function ref<T extends Component>(type: T) {
    return new RefComponent(type);
}

export type Mutable<T extends Component | Resource> = T extends Resource ? MutResource<T> : MutComponent<T>;
export function mut<T extends Component>(type: T) {
    return new MutComponent(type);
}

export type Maybe<T extends Component> = OptionComponent<T>
export function Maybe<T extends Component>(component: T) {
    return new OptionComponent<T>(component);
}

export class QueryDataTuple<
    Item extends any[] | readonly any[] = any[],
    Fetch extends any[] | readonly any[] = any[],
    State extends any[] | readonly any[] = any[]
> implements QueryData<Item, Fetch, State> {
    readonly IS_DENSE: boolean;
    readonly [$WorldQuery] = true;

    #queries: QueryData<any, any, any>[]
    #fetch: Item;

    constructor(data: readonly any[]) {
        const queries = data.map(c => to_query_data(c)) as any;
        this.#queries = queries;
        this.#fetch = new Array(data.length) as Item;
        this.IS_DENSE = queries.every((q: { IS_DENSE: boolean }) => q.IS_DENSE);
    }

    init_fetch(world: World, state: State, last_run: Tick, this_run: Tick): Fetch {
        return state.map((s, i) => this.#queries[i].init_fetch(world, s, last_run, this_run)) as unknown as Fetch
    }

    set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            const name = this.#queries[i];
            const s = state[i];
            if (name.matches_component_set(s, (id) => archetype.has(id))) {
                name.set_archetype(fetch[i], s, archetype, table)
            }
        }
    }

    set_table(fetch: Fetch, state: State, table: Table): void {
        for (let i = 0; i < fetch.length; i++) {
            this.#queries[i].set_table(fetch[i], state[i], table)
        }
    }

    set_access(state: State, access: FilteredAccess): void {
        for (let i = 0; i < state.length; i++) {
            this.#queries[i].set_access(state[i], access);
        }
    }

    fetch(fetch: Fetch, entity: Entity, table_row: number): Item {
        const f = this.#fetch,
            queries = this.#queries;
        for (let i = 0; i < queries.length; i++) {
            // @ts-expect-error
            f[i] = queries[i].fetch(fetch[i], entity, table_row);
        }
        return f;
    }

    update_component_access(state: State, access: FilteredAccess): void {
        const _new_access = FilteredAccess.matches_nothing();

        for (let i = 0; i < state.length; i++) {
            const name = this.#queries[i];
            const intermediate = access.clone();
            name.update_component_access(state[i], intermediate);
            _new_access.append_or(intermediate);
        }

        access.__filter_sets = _new_access.__filter_sets;
    }

    init_state(world: World): any {
        return this.#queries.map(q => q.init_state(world));
    }

    get_state(components: Components): State {
        return this.#queries.map(q => q.get_state(components)) as unknown as State;
    }

    matches_component_set(state: State, set_contains_id: (id: ComponentId) => boolean): boolean {
        return state.every((s, i) => this.#queries[i].matches_component_set(s, set_contains_id))
    }
}

function to_query_data(ty: any): typeof ty extends ComponentRecord ? QueryData : ThinQueryData {
    switch (true) {
        case ty[$WorldQuery]: return ty;
        case is_component(ty): return new ReadComponent(ty) as unknown as QueryData;
        case is_thin_component(ty): return new ReadThinComponent(ty as unknown as ComponentRecord);
        case ty === unit: return new QueryUnit() as QueryData;
        case ty === Entity: return new QueryEntity() as unknown as QueryData;
        case ty === EntityRef: return new QueryEntityRef() as QueryData;
        default: throw new Error(`Cannot create query data from ${ty}`)
    }
}
