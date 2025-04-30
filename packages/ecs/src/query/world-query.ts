import { type Option } from "joshkaposh-option";
import { unit } from "../util";
import { Archetype } from "../archetype";
import { Entity } from "../entity";
import { Table, type TableRow } from "../storage/table";
import { ThinWorld, World } from "../world";
import { FilteredAccess } from "./access";
import { Component, Components, ThinComponents, Tick, type ComponentId } from "../component";
import { StorageType, ThinTable } from "../storage";

export function is_dense(ty: Component) {
    return ty.storage_type === StorageType.Table
}

export interface WorldQuery<Item extends any = any, Fetch extends any = any, State extends any = any> {
    readonly [$WorldQuery]: true;
    readonly IS_DENSE: boolean;

    init_fetch(world: World, state: State, last_run: Tick, this_run: Tick): Fetch;

    set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: Table): void;

    set_table(fetch: Fetch, state: State, table: Table): void;

    set_access(_state: State, _access: FilteredAccess): void;

    fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    update_component_access(state: State, access: FilteredAccess): void;

    init_state(world: World): any;

    get_state(components: Components): Option<State>;

    matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};

export interface ThinWorldQuery<Item extends any = any, Fetch extends any = any, State extends any = any> {
    readonly [$WorldQuery]: true;
    readonly IS_DENSE: boolean;

    init_fetch(world: ThinWorld, state: State, last_run: Tick, this_run: Tick): Fetch;

    set_archetype(fetch: Fetch, state: State, archetype: Archetype, table: ThinTable): void;

    set_table(fetch: Fetch, state: State, table: ThinTable): void;

    set_access(_state: State, _access: FilteredAccess): void;

    fetch(fetch: Fetch, entity: Entity, table_row: TableRow): Item;

    update_component_access(state: State, access: FilteredAccess): void;

    init_state(world: ThinWorld): any;

    get_state(components: ThinComponents): Option<State>;

    matches_component_set(state: State, set_contains_id: (component_id: ComponentId) => boolean): boolean;
};

export const $WorldQuery = Symbol('WorldQuery');

// export type WorldQueryProxy<T extends Record<string, View> = Record<string, View>> = T & {
//     index: number;
//     length: number;
//     readonly keys: string[];
// }

// function ProxyBase() {
//     const proxy = Object.create(null);
//     proxy.length = 0;
//     proxy.index = 0;
//     return proxy;
// }

// function QueryProxy(type: Record<string, View> & { readonly keys: string[] }): WorldQueryProxy {
//     const proxy = ProxyBase();
//     const keys = type.keys;
//     proxy.keys = keys;
//     for (let i = 0; i < keys.length; i++) {
//         const key = keys[i];
//         // @ts-expect-error
//         const view = new type[key].constructor();
//         Object.defineProperty(proxy, key, {
//             get() {
//                 return view;
//             },
//         })
//     }
//     return proxy;
// }

// QueryProxy.from = function (type: Record<string, View> & { readonly keys: string[] }, views: View[]): WorldQueryProxy {
//     const proxy = ProxyBase();
//     for (let i = 0; i < views.length; i++) {
//         proxy[type.keys[i]] = views[i];
//     }
//     return proxy
// }

// QueryProxy.set_table = function (proxy: WorldQueryProxy, views: View[]) {
//     const keys = proxy.keys;
//     for (let i = 0; i < keys.length; i++) {
//         proxy[keys[i]] = views[i];
//     }
// }

// QueryProxy.clone_from = function (dst: WorldQueryProxy, src: WorldQueryProxy) {
//     const keys = dst.keys;
//     for (let i = 0; i < keys.length; i++) {
//         dst[keys[i]] = src[keys[i]];
//     }
// }

// function QueryProxy2(type: Record<string, View> & { readonly keys: string[] }) {
//     const proxy = ProxyBase();
//     const keys = type.keys;
//     proxy.keys = keys;
//     for (let i = 0; i < keys.length; i++) {
//         const key = keys[i];
//         // @ts-expect-error
//         const view = new type[key].constructor();
//         Object.defineProperty(proxy, key, {
//             get() {
//                 return view[proxy.index];
//             },
//         })
//     }
//     return proxy;
// }

// QueryProxy2.set_table = function (proxy: WorldQueryProxy, views: View[]) {
//     const keys = proxy.keys;
//     for (let i = 0; i < keys.length; i++) {
//         proxy[keys[i]] = views[i];
//     }
// }

// function QueryProxyMut(type: Record<string, View> & { readonly keys: string[] }) {
//     const proxy = ProxyBase();
//     const keys = type.keys;
//     proxy.keys = keys;
//     for (let i = 0; i < keys.length; i++) {
//         const key = keys[i];
//         // @ts-expect-error
//         const view = new type[key].constructor();
//         Object.defineProperty(proxy, key, {
//             get() {
//                 return view[proxy.index];
//             },
//             set(v) {
//                 view[proxy.index] = v;
//             },
//         })
//     }
//     return proxy;
// }

export class NoopWorldQuery implements WorldQuery<unit, unit, unit> {
    readonly [$WorldQuery] = true;
    readonly IS_DENSE = true;


    init_fetch(_world: World, _state: unit): unit { return unit }

    set_archetype(_fetch: unit, _state: unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: unit, _state: unit, _table: Table): void { }

    set_access(_state: typeof unit, _access: FilteredAccess): void { }

    fetch(_fetch: unit, _entity: Entity, _table_row: TableRow): unit { return unit };

    update_component_access(_state: unit, _access: FilteredAccess) { }

    init_state(_world: World): unit { return unit };

    get_state(_components: Components): unit { return unit };

    matches_component_set(_state: unit, _set_contains_id: (component_id: ComponentId) => boolean): boolean { return true };
}