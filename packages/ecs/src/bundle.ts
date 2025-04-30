import type { Option } from 'joshkaposh-option'
import { iter, Iterator } from 'joshkaposh-iterator';
import { Ord } from 'joshkaposh-index-map/src/map';
import { Archetype, ArchetypeId, Archetypes, BundleComponentStatus, ComponentStatus, SpawnBundleStatus } from "./archetype";
import { Component, ComponentId, ComponentMetadata, Components, RequiredComponents, ThinComponents, Tick } from "./component";
import { Entity, EntityLocation, index } from "./entity";
import { StorageType, Storages, ThinSparseSets, ThinStorages, ThinTable } from "./storage";
import { SparseSets } from "./storage/sparse-set";
import { Table, TableRow } from "./storage/table";
import { entry } from "./util";
import { ArchetypeAfterBundleInsert, SystemMeta } from '.';
import { ThinWorld, World } from './world/world';
import { ThinComponent, TypeId } from 'define';

// TODO: enable reusing a bundle to spawn/insert components.
// TODO: this will allow less object instantion

export type BundleId = number;

export interface BundleFromComponents {
    // Calls `func`, which should return data for each component in the bundle, in the order of
    // this bundle's `Component`s

    // ! Safety
    // Caller must return data for each component in the bundle, in the order of this bundle's `Components`s.
    fromComponents<T>(ctx: T, fn: (value: T) => T): T;
}

// The parts from the `Bundle` that don't require statically knowing the components of the bundle.
export interface DynamicBundle {
    /**
     * **Safety** -
     * The `StorageType` argument passed into [`Bundle::get_components`] must be correct for the
     * component being fetched.
     *
     * Calls `func` on each value, in the order of this bundle's [`Component`]s. This passes
     * ownership of the component values to `func`.
     */
    getComponents(func: (storage_type: StorageType, ptr: {}) => void): void;
};

export interface Bundle extends TypeId, DynamicBundle, BundleFromComponents {
    readonly name: string;
    // Gets this `Bundle`s component_ids, in the order of this bundle's `Component`s
    componentIds(components: Components, ids: (component_id: ComponentId) => void): void;
    getComponentIds(components: Components, ids: (component_id: Option<ComponentId>) => void): void;
}

export interface ThinBundleFromComponents {
    fromComponents<T>(ctx: T, fn: (value: T) => T): T;
}

export interface ThinDynamicBundle {
    /**
     * **Safety** -
     * The `StorageType` argument passed into [`Bundle::get_components`] must be correct for the
     * component being fetched.
     *
     * Calls `func` on each value, in the order of this bundle's [`Component`]s. This passes
     * ownership of the component values to `func`.
     */
    getComponents(func: (storage_type: StorageType, ptr: number[]) => void): void;
}

export interface ThinBundle extends TypeId, ThinDynamicBundle, ThinBundleFromComponents {
    readonly name: string;
    /**
     *  Gets this `Bundle`s component_ids, in the order of this bundle's `Component`s
     */
    componentIds(components: ThinComponents, ids: (component_id: ComponentId) => void): void;
    getComponentIds(components: ThinComponents, ids: (component_id: Option<ComponentId>) => void): void;
}

function ComponentBundle(type: ComponentMetadata): Bundle {
    const actual = type;
    type = type.type_id ? type : type.constructor as Component

    return {
        type_id: type.type_id,
        name: `ECS Bundle { ${type.type_id} }`,
        componentIds(components, ids) {
            ids(components.registerComponent(type as Component));
        },
        fromComponents(ctx, func) {
            return func(ctx);
        },
        getComponentIds(components, ids) {
            ids(components.getId(type))
        },

        getComponents(func) {
            func(type.storage_type, actual)
        },
    }
}

const BundleRegistry = new Map<UUID, ThinBundle>();

function ThinComponentBundle(bundles: (ThinComponent & ThinBundle)[], hash: UUID): ThinBundle {
    const existing = BundleRegistry.get(hash);
    if (existing) {
        return existing
    } else {
        const bundle: ThinBundle = {
            type_id: hash,
            name: `ECS Bundle { ${hash} }`,
            componentIds(components, ids) {
                bundles.forEach(b => b.componentIds(components, ids));
            },

            getComponents(func) {
                bundles.forEach((b) => b.getComponents(func));
            },

            fromComponents(ctx, fn) {
                return bundles.map(b => b.fromComponents(ctx, fn)) as any
            },
            getComponentIds(components, ids) {
                bundles.forEach(b => b.getComponentIds(components, ids))
            },
        }
        BundleRegistry.set(hash, bundle);
        return bundle;
    }
}

type Sub<Type, T extends number> =
    T extends 16 ? Sub<Type[], 15> :
    T extends 15 ? Sub<Type[], 14> :
    T extends 14 ? Sub<Type[], 13> :
    T extends 13 ? Sub<Type[], 12> :
    T extends 12 ? Sub<Type[], 11> :
    T extends 11 ? Sub<Type[], 10> :
    T extends 10 ? Sub<Type[], 9> :
    T extends 9 ? Sub<Type[], 8> :
    T extends 8 ? Sub<Type[], 7> :
    T extends 7 ? Sub<Type[], 6> :
    T extends 6 ? Sub<Type[], 5> :
    T extends 5 ? Sub<Type[], 4> :
    T extends 4 ? Sub<Type[], 3> :
    T extends 3 ? Sub<Type[], 2> :
    T extends 2 ? Sub<Type[], 1> :
    Type[]

type NestedArray<T, L extends number = 1> = Sub<T, L>;

function hash_bundles(bundles: Bundle[] | ThinBundle[]) {
    return bundles.map((b, i) => `${i}:${b.type_id}`).join('') as UUID;
}

type A<T> = T[];

type Part = A<A<ThinBundle | A<ThinBundle>> | ThinBundle>;

export function define_thin_bundle(bundle: Part): ThinBundle {
    const bundles = bundle.flat(Infinity) as ThinComponent[];
    const hash = hash_bundles(bundles);
    return ThinComponentBundle(bundles, hash);
}

// TODO: compare precompute hash and get bundle if it exists, or create a new one if one does not exist.
export function define_bundle(bundle: any[]): Bundle {
    const bundles = bundle.flat(Infinity).map(c => ComponentBundle(c));

    const hash = hash_bundles(bundles);
    const name = `$ECS-Bundle:${hash}`;

    return {
        type_id: hash as UUID,
        name: name,
        componentIds(components, ids) {
            for (let i = 0; i < bundles.length; i++) {
                bundles[i].componentIds(components, ids)
            }
        },

        fromComponents(ctx, func) {
            return bundles.map(b => b.fromComponents(ctx, func)) as any;
        },

        getComponents(func) {
            bundles.forEach(b => b.getComponents(func))
        },

        getComponentIds(components, ids) {
            bundles.forEach(b => b.getComponentIds(components, ids))
        },

    }
}

export class ThinBundleInfo {
    #id: BundleId;
    #component_ids: readonly ComponentId[];
    // @ts-ignore
    #required_component_ids: readonly ComponentId[];
    // @ts-ignore
    #explicit_components_len: number;

    //! SAFETY: Every ID in this list must be valid within the World that owns the BundleInfo,
    // must have its storage initialized (i.e. columns created in tables, sparse set created),
    // and must be in the same order as the source bundle type writes its components in.
    constructor(
        bundle_type_name: string,
        storages: ThinStorages,
        components: ThinComponents,
        component_ids: ComponentId[],
        id: BundleId
    ) {
        const deduped = [...new Set(component_ids)].sort();
        if (deduped.length !== component_ids.length) {
            const seen = new Set();
            const dups = [];
            for (let i = 0; i < component_ids.length; i++) {
                const id = component_ids[i];
                if (!seen.has(id)) {
                    seen.add(id);
                    dups.push(id)
                }
            }

            const names = dups.map(id => components.getInfo(id)!.name).join(', ');
            throw new Error(`Bundle ${bundle_type_name} has duplicate components: ${names}`)
        }

        // handle explicit components

        const explicit_components_len = component_ids.length;

        const required_components = new RequiredComponents();
        for (let i = 0; i < component_ids.length; i++) {
            const component_id = component_ids[i];
            const info = components.getInfo(component_id)!;
            // required_components.merge(info.required_components())
            storages.prepare_component(info)
        }
        // required_components.remove_explicit_components(component_ids);

        const required_components_array = []
        required_components.map.forEach((v, component_id) => {
            const info = components.getInfo(component_id)!;
            storages.prepare_component(info);
            component_ids.push(component_id);
            required_components_array.push(v.ctor);
        })

        this.#id = id;
        this.#component_ids = Object.freeze(component_ids);
        this.#required_component_ids = Object.freeze([]);
        this.#explicit_components_len = explicit_components_len;
    }

    get id() {
        return this.#id;
    }

    explicitComponents() {
        return this.#component_ids.slice(0, this.#explicit_components_len);
    }

    requiredComponents() {
        return this.#component_ids.slice(this.#explicit_components_len)
    }

    contributedComponents() {
        return this.#component_ids;
    }

    writeComponents<T extends ThinDynamicBundle>(
        table: ThinTable,
        sparse_sets: ThinSparseSets,
        bundle_component_status: BundleComponentStatus,
        entity: Entity,
        table_row: TableRow,
        change_tick: Tick,
        bundle: T,
        insert_mode: InsertMode
    ) {
        // NOTE: get_components calls this closure on each component in "bundle order".
        // bundle_info.componentIds are also in "bundle order"
        let bundle_component = 0;
        bundle.getComponents((storage_type, component_ptr) => {
            const component_id = this.#component_ids[bundle_component];
            if (storage_type === StorageType.Table) {

                const status = bundle_component_status.get_status(bundle_component);
                const column = table.getColumn(component_id)!;
                if (ComponentStatus.Added === status) {
                    column.initialize(table_row, component_ptr, change_tick);
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Replace) {
                    column.replace(table_row, component_ptr, change_tick);
                }
            } else if (storage_type === StorageType.SparseSet) {
                const sparse_set = sparse_sets.get(component_id)!;
                sparse_set.insert(entity, component_ptr, change_tick);
            }

            bundle_component += 1;
        })
    }

    insertBundleIntoArchetype(
        archetypes: Archetypes,
        storages: ThinStorages,
        components: ThinComponents,
        archetype_id: ArchetypeId
    ): ArchetypeId {
        const archetype_after_insert_id = archetypes.get(archetype_id)
            ?.edges()
            ?.get_archetype_after_bundle_insert(this.#id);
        if (archetype_after_insert_id != null) {
            return archetype_after_insert_id
        }

        const new_table_components = [];
        const new_sparse_set_components = [];
        const bundle_status: ComponentStatus[] = [];
        const added_required_components: ComponentId[] = [];
        const added = [];
        const existing = [];

        const current_archetype = archetypes.get(archetype_id)!;
        const explicit_component_ids = this.#component_ids
        for (let i = 0; i < explicit_component_ids.length; i++) {
            const component_id = explicit_component_ids[i];
            if (current_archetype.has(component_id)) {
                bundle_status.push(ComponentStatus.Existing);
                existing.push(component_id)
            } else {
                bundle_status.push(ComponentStatus.Added)
                added.push(component_id);
                const component_info = components.getInfo(component_id)!;
                if (StorageType.Table === component_info.storageType) {
                    new_table_components.push(component_id)
                } else {
                    new_sparse_set_components.push(component_id)
                }
            }
        }

        // for (const [index, component_id] of this.iter_required_components().enumerate()) {
        //     if (!current_archetype.contains(component_id)) {
        //         added_required_components.push(this.#required_component_ids[index]);
        //         added.push(component_id)
        //     } else {
        //         const component_info = components.getInfo(component_id)!;
        //         if (component_info.storageType === StorageType.Table) {
        //             new_table_components.push(component_id)
        //         } else {
        //             new_sparse_set_components.push(component_id)
        //         }
        //     }
        // }

        if (new_table_components.length === 0 && new_sparse_set_components.length === 0) {
            const edges = current_archetype.edges();
            //  The archetype does not change when we insert this bundle.
            edges.cache_archetype_after_bundle_insert(
                this.#id,
                archetype_id,
                bundle_status,
                added_required_components,
                added,
                existing
            )
            return archetype_id;
        } else {
            let table_id, table_components, sparse_set_components;
            const current_archetype = archetypes.get(archetype_id)!;
            if (new_table_components.length === 0) {
                // If there are no new table components, we can keep using this table
                table_id = current_archetype.tableId;
                table_components = current_archetype.tableComponents().collect();
            } else {
                new_table_components.push(...current_archetype.tableComponents());
                new_table_components.sort();
                table_id = storages.tables.getIdOrSet(new_table_components, components);
                table_components = new_table_components;
            }

            if (new_sparse_set_components.length === 0) {
                sparse_set_components = current_archetype.sparseSetComponents().collect();
            } else {
                new_sparse_set_components.push(...current_archetype.sparseSetComponents());
                new_sparse_set_components.sort();
                sparse_set_components = new_sparse_set_components;
            }

            const new_archetype_id = archetypes.getIdOrSet(
                table_id,
                table_components,
                sparse_set_components
            )

            archetypes.get(archetype_id)!.edges().cache_archetype_after_bundle_insert(
                this.#id,
                new_archetype_id,
                bundle_status,
                added_required_components,
                added,
                existing
            )
            return new_archetype_id;
        }
    }

    removeBundleFromArchetype(
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        archetype_id: ArchetypeId,
        intersection: boolean
    ): Option<ArchetypeId> {
        let edges = archetypes.get(archetype_id)!.edges();
        const archetype_after_remove_result = intersection ?
            edges.get_archetype_after_bundle_remove(this.#id) :
            edges.get_archetype_after_bundle_take(this.#id);

        let result;
        if (archetype_after_remove_result != null) {
            result = archetype_after_remove_result
        } else {
            let next_table_components, next_sparse_set_components, next_table_id;

            const current_archetype = archetypes.get(archetype_id)!;

            const removed_table_components = []
            const removed_sparse_set_components = []

            const explicit_component_ids = this.#component_ids;
            for (let i = 0; i < explicit_component_ids.length; i++) {
                const component_id = explicit_component_ids[i]

                if (current_archetype.has(component_id)) {
                    const component_info = components.getInfo(component_id)!;
                    if (component_info.storageType === StorageType.Table) {
                        removed_table_components.push(component_id)
                    } else {
                        removed_sparse_set_components.push(component_id)
                    }
                } else if (!intersection) {
                    current_archetype.edges().cache_archetype_after_bundle_take(this.#id, null);
                    return
                }
            }

            removed_table_components.sort();
            removed_sparse_set_components.sort();
            next_table_components = current_archetype.tableComponents().collect();
            next_sparse_set_components = current_archetype.sparseSetComponents().collect();
            sorted_remove(next_table_components, removed_table_components);
            sorted_remove(next_sparse_set_components, removed_sparse_set_components);
            next_table_id = removed_table_components.length === 0 ?
                current_archetype.tableId :
                storages.tables.__getIdOrSet(next_table_components, components)

            const new_archetype_id = archetypes.getIdOrSet(
                next_table_id,
                next_table_components,
                next_sparse_set_components
            )

            result = new_archetype_id;
        }

        const current_archetype = archetypes.get(archetype_id)!;

        edges = current_archetype.edges()
        if (intersection) {
            edges.cache_archetype_after_bundle_remove(this.#id, result)
        } else {
            edges.cache_archetype_after_bundle_take(this.#id, result)
        }
        return result;
    }
}

export class BundleInfo {
    #id: BundleId;
    #component_ids: readonly ComponentId[];
    // @ts-ignore
    #required_component_ids: readonly ComponentId[];
    // @ts-ignore
    #explicit_components_len: number;

    //! SAFETY: Every ID in this list must be valid within the World that owns the BundleInfo,
    // must have its storage initialized (i.e. columns created in tables, sparse set created),
    // and must be in the same order as the source bundle type writes its components in.
    constructor(
        bundle_type_name: string,
        storages: Storages,
        components: Components,
        component_ids: ComponentId[],
        id: BundleId
    ) {
        const deduped = [...new Set(component_ids)].sort();
        if (deduped.length !== component_ids.length) {
            const seen = new Set();
            const dups = [];
            for (let i = 0; i < component_ids.length; i++) {
                const id = component_ids[i];
                if (!seen.has(id)) {
                    seen.add(id);
                    dups.push(id)
                }
            }

            const names = dups.map(id => components.getInfo(id)!.name).join(', ');
            throw new Error(`Bundle ${bundle_type_name} has duplicate components: ${names}`)
        }

        // handle explicit components

        const explicit_components_len = component_ids.length;

        const required_components = new RequiredComponents();
        for (let i = 0; i < component_ids.length; i++) {
            const component_id = component_ids[i];
            const info = components.getInfo(component_id)!;
            // required_components.merge(info.required_components())
            storages.prepare_component(info)
        }
        // required_components.remove_explicit_components(component_ids);

        const required_components_array = []
        required_components.map.forEach((v, component_id) => {
            const info = components.getInfo(component_id)!;
            storages.prepare_component(info);
            component_ids.push(component_id);
            required_components_array.push(v.ctor);
        })

        this.#id = id;
        this.#component_ids = Object.freeze(component_ids);
        this.#required_component_ids = Object.freeze([]);
        this.#explicit_components_len = explicit_components_len;
    }

    id() {
        return this.#id;
    }

    explicitComponents() {
        return this.#component_ids.slice(0, this.#explicit_components_len);
    }

    requiredComponents() {
        return this.#component_ids.slice(this.#explicit_components_len)
    }

    contributedComponents() {
        return this.#component_ids;
    }

    writeComponents<T extends DynamicBundle>(
        table: Table,
        sparse_sets: SparseSets,
        bundle_component_status: BundleComponentStatus,
        entity: Entity,
        table_row: TableRow,
        change_tick: Tick,
        bundle: T,
        insert_mode: InsertMode
    ) {
        // NOTE: get_components calls this closure on each component in "bundle order".
        // bundle_info.componentIds are also in "bundle order"
        let bundle_component = 0;

        bundle.getComponents((storage_type, component_ptr) => {
            const component_id = this.#component_ids[bundle_component];

            if (storage_type === StorageType.Table) {
                const status = bundle_component_status.get_status(bundle_component);
                const column = table.getColumn(component_id)!;
                if (ComponentStatus.Added === status) {
                    // @ts-ignore
                    column.__initialize(
                        table_row,
                        component_ptr,
                        change_tick
                    );
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Replace) {
                    // @ts-ignore
                    column.__replace(
                        table_row,
                        component_ptr,
                        change_tick
                    );
                }
            } else if (storage_type === StorageType.SparseSet) {
                const sparse_set = sparse_sets.get(component_id)!;
                // @ts-ignore
                sparse_set.__set(
                    entity,
                    component_ptr,
                    change_tick
                );
            }

            bundle_component += 1;
        })
    }

    insertBundleIntoArchetype(
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        archetype_id: ArchetypeId
    ): ArchetypeId {
        const archetype_after_insert_id = archetypes.get(archetype_id)
            ?.edges()
            ?.get_archetype_after_bundle_insert(this.#id);
        if (archetype_after_insert_id != null) {
            return archetype_after_insert_id
        }

        const new_table_components = [];
        const new_sparse_set_components = [];
        const bundle_status: ComponentStatus[] = [];
        const added_required_components: ComponentId[] = [];
        const added = [];
        const existing = [];

        const current_archetype = archetypes.get(archetype_id)!;
        const explicit_component_ids = this.#component_ids
        for (let i = 0; i < explicit_component_ids.length; i++) {
            const component_id = explicit_component_ids[i];
            if (current_archetype.has(component_id)) {
                bundle_status.push(ComponentStatus.Existing);
                existing.push(component_id)
            } else {
                bundle_status.push(ComponentStatus.Added)
                added.push(component_id);
                const component_info = components.getInfo(component_id)!;
                if (StorageType.Table === component_info.storageType) {
                    new_table_components.push(component_id)
                } else {
                    new_sparse_set_components.push(component_id)
                }
            }
        }

        // for (const [index, component_id] of this.iter_required_components().enumerate()) {
        //     if (!current_archetype.contains(component_id)) {
        //         added_required_components.push(this.#required_component_ids[index]);
        //         added.push(component_id)
        //     } else {
        //         const component_info = components.getInfo(component_id)!;
        //         if (component_info.storageType === StorageType.Table) {
        //             new_table_components.push(component_id)
        //         } else {
        //             new_sparse_set_components.push(component_id)
        //         }
        //     }
        // }

        if (new_table_components.length === 0 && new_sparse_set_components.length === 0) {
            const edges = current_archetype.edges();
            //  The archetype does not change when we insert this bundle.
            edges.cache_archetype_after_bundle_insert(
                this.#id,
                archetype_id,
                bundle_status,
                added_required_components,
                added,
                existing
            )
            return archetype_id;
        } else {
            let table_id, table_components, sparse_set_components;
            const current_archetype = archetypes.get(archetype_id)!;
            if (new_table_components.length === 0) {
                // If there are no new table components, we can keep using this table
                table_id = current_archetype.tableId;
                table_components = current_archetype.tableComponents().collect();
            } else {
                new_table_components.push(...current_archetype.tableComponents());
                new_table_components.sort();
                table_id = storages.tables.__getIdOrSet(new_table_components, components);
                table_components = new_table_components;
            }

            if (new_sparse_set_components.length === 0) {
                sparse_set_components = current_archetype.sparseSetComponents().collect();
            } else {
                new_sparse_set_components.push(...current_archetype.sparseSetComponents());
                new_sparse_set_components.sort();
                sparse_set_components = new_sparse_set_components;
            }

            const new_archetype_id = archetypes.getIdOrSet(
                table_id,
                table_components,
                sparse_set_components
            )
            archetypes.get(archetype_id)!.edges().cache_archetype_after_bundle_insert(
                this.#id,
                new_archetype_id,
                bundle_status,
                added_required_components,
                added,
                existing
            )
            return new_archetype_id;
        }
    }

    removeBundleFromArchetype(
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        archetype_id: ArchetypeId,
        intersection: boolean
    ): Option<ArchetypeId> {
        let edges = archetypes.get(archetype_id)!.edges();
        const archetype_after_remove_result = intersection ?
            edges.get_archetype_after_bundle_remove(this.#id) :
            edges.get_archetype_after_bundle_take(this.#id);

        let result;
        if (archetype_after_remove_result != null) {
            result = archetype_after_remove_result
        } else {
            let next_table_components, next_sparse_set_components, next_table_id;

            const current_archetype = archetypes.get(archetype_id)!;

            const removed_table_components = []
            const removed_sparse_set_components = []

            const explicit_component_ids = this.#component_ids;
            for (let i = 0; i < explicit_component_ids.length; i++) {
                const component_id = explicit_component_ids[i]

                if (current_archetype.has(component_id)) {
                    const component_info = components.getInfo(component_id)!;
                    if (component_info.storageType === StorageType.Table) {
                        removed_table_components.push(component_id)
                    } else {
                        removed_sparse_set_components.push(component_id)
                    }
                } else if (!intersection) {
                    current_archetype.edges().cache_archetype_after_bundle_take(this.#id, null);
                    return
                }
            }

            removed_table_components.sort();
            removed_sparse_set_components.sort();
            next_table_components = current_archetype.tableComponents().collect();
            next_sparse_set_components = current_archetype.sparseSetComponents().collect();
            sorted_remove(next_table_components, removed_table_components);
            sorted_remove(next_sparse_set_components, removed_sparse_set_components);
            next_table_id = removed_table_components.length === 0 ?
                current_archetype.tableId :
                storages.tables.__getIdOrSet(next_table_components, components)

            const new_archetype_id = archetypes.getIdOrSet(
                next_table_id,
                next_table_components,
                next_sparse_set_components
            )

            result = new_archetype_id;
        }

        const current_archetype = archetypes.get(archetype_id)!;

        edges = current_archetype.edges()
        if (intersection) {
            edges.cache_archetype_after_bundle_remove(this.#id, result)
        } else {
            edges.cache_archetype_after_bundle_take(this.#id, result)
        }
        return result;
    }

    iterRequiredComponents(): Iterator<ComponentId> {
        return iter(this.#required_component_ids)
    }

    iterExplicitComponents() {
        return iter(this.#component_ids);
    }

    iterContributedComponents() {
        return iter(this.#component_ids).chain(this.#required_component_ids);
    }
}

export type InsertMode = 0 | 1
export const InsertMode = {
    Replace: 0,
    Keep: 1,
} as const;

export class BundleInserter {
    #world: World;
    #bundle_info: BundleInfo;
    #archetype_after_insert: ArchetypeAfterBundleInsert;
    #table: Table;
    #archetype: Archetype;
    #archetype_move_type: ArchetypeMoveType;
    #change_tick: Tick;

    constructor(
        world: World,
        bundle_info: BundleInfo,
        archetype_after_insert: ArchetypeAfterBundleInsert,
        table: Table,
        archetype: Archetype,
        archetype_move_type: ArchetypeMoveType,
        change_tick: Tick
    ) {
        this.#world = world;
        this.#bundle_info = bundle_info;
        this.#archetype_after_insert = archetype_after_insert;
        this.#table = table;
        this.#archetype = archetype;
        this.#archetype_move_type = archetype_move_type;
        this.#change_tick = change_tick;
    }

    static new(bundle: Bundle, world: World, archetype_id: ArchetypeId, change_tick: Tick) {
        const bundle_id = world.bundles.registerInfo(bundle, world.components, world.storages);
        return BundleInserter.newWithId(world, archetype_id, bundle_id, change_tick)
    }

    static newWithId(world: World, archetype_id: ArchetypeId, bundle_id: BundleId, change_tick: Tick) {
        const bundle_info = world.bundles.get(bundle_id)!;
        bundle_id = bundle_info.id();
        const new_archetype_id = bundle_info.insertBundleIntoArchetype(
            world.archetypes,
            world.storages,
            world.components,
            archetype_id
        )

        if (new_archetype_id === archetype_id) {
            const archetype = world.archetypes.get(archetype_id)!;
            const archetype_after_insert = archetype.edges().get_archetype_after_bundle_insert_internal(bundle_id)!;
            const table_id = archetype.tableId;
            const table = world.storages.tables.get(table_id)!;
            return new BundleInserter(
                world,
                bundle_info,
                archetype_after_insert,
                table,
                archetype,
                ArchetypeMoveType.SameArchetype,
                change_tick
            )
        } else {

            const [archetype, new_archetype] = world.archetypes.__get2Mut(archetype_id, new_archetype_id);
            const archetype_after_insert = archetype
                .edges()
                .get_archetype_after_bundle_insert_internal(bundle_id)!;


            const table_id = archetype.tableId;
            const new_table_id = new_archetype.tableId;

            if (table_id === new_table_id) {
                const table = world.storages.tables.get(table_id)!;
                return new BundleInserter(
                    world,
                    bundle_info,
                    archetype_after_insert,
                    table,
                    archetype,
                    ArchetypeMoveType.NewArchetypeSameTable(new_archetype),
                    change_tick
                )
            } else {
                const [table, new_table] = world.storages.tables.get2(table_id, new_table_id);

                return new BundleInserter(
                    world,
                    bundle_info,
                    archetype_after_insert,
                    table,
                    archetype,
                    ArchetypeMoveType.NewArchetypeNewTable(new_archetype, new_table),
                    change_tick
                )
            }
        }
    }

    insert(
        entity: Entity,
        location: EntityLocation,
        bundle: DynamicBundle,
        insert_mode: InsertMode
    ): EntityLocation {
        const bundle_info = this.#bundle_info;
        const archetype_after_insert = this.#archetype_after_insert;
        const table = this.#table;
        const archetype = this.#archetype;

        // if (insert_mode === InsertMode.Replace) {
        //     if (archetype.has_replace_observer()) {
        //         this.#world.trigger_observers(ON_REPLACE, entity, archetype_after_insert);
        //     }
        //     this.#world.trigger_on_replace(archetype, entity, archetype_after_insert);
        // }

        let new_location,
            new_archetype;


        if (this.#archetype_move_type === ArchetypeMoveType.SameArchetype) {
            // console.log('BundleInserted SameArchetype');

            const sparse_sets = this.#world.storages.sparse_sets
            bundle_info.writeComponents(
                table,
                sparse_sets,
                archetype_after_insert,
                entity,
                location.table_row,
                this.#change_tick,
                bundle,
                insert_mode
            )
            new_archetype = archetype;
            new_location = location;
        } else if (!('new_table' in this.#archetype_move_type)) {
            // NewArchetypeSameTable
            const new_archetype_ = this.#archetype_move_type.new_archetype;
            // console.log('BundleInserted NewArchetypeSameTable ',
            //     this.#archetype.tableComponents().collect(),
            //     this.#archetype.sparse_set_components().collect(),
            //     new_archetype_.tableComponents().collect(),
            //     new_archetype_.sparse_set_components().collect()
            // );

            const sparse_sets = this.#world.storages.sparse_sets;
            const entities = this.#world.entities;
            // @ts-ignore
            const result = archetype.__swapRemove(location.archetype_row);
            if (result.swapped_entity) {
                const { swapped_entity } = result
                const swapped_location = entities.get(swapped_entity)!;

                // @ts-ignore
                entities.__set(index(swapped_entity), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }
            // @ts-ignore
            const new_location_ = new_archetype_.allocate(entity, result.table_row);
            // @ts-ignore
            entities.__set(index(entity), new_location_);
            bundle_info.writeComponents(
                table,
                sparse_sets,
                archetype_after_insert,
                entity,
                result.table_row,
                this.#change_tick,
                bundle,
                insert_mode
            )
            new_archetype = new_archetype_;
            new_location = new_location_;
        } else {
            // NewArchetypeNewTable
            // console.log('BundleInserted NewArchetypeNewTable');

            const { new_archetype: new_archetype_, new_table } = this.#archetype_move_type
            const archetypes_ptr = this.#world.archetypes.inner;
            const entities = this.#world.entities;
            const sparse_sets = this.#world.storages.sparse_sets;
            // @ts-ignore
            const result = archetype.__swapRemove(location.archetype_row);
            if (result.swapped_entity) {
                const { swapped_entity } = result
                const swapped_location = entities.get(swapped_entity)!;
                // @ts-ignore
                entities.__set(index(swapped_entity), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            // @ts-ignore
            const move_result = table.__moveToSupersetUnchecked(result.table_row, new_table);
            // @ts-ignore
            const new_location_ = new_archetype_.allocate(entity, move_result.new_row);
            // @ts-ignore
            entities.__set(index(entity), new_location_);

            if (move_result.swapped_entity) {
                const { swapped_entity } = move_result
                const swapped_location = entities.get(swapped_entity)!;

                // @ts-ignore
                entities.__set(index(swapped_entity), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: result.table_row
                })

                if (archetype.id === swapped_location.archetype_id) {
                    archetype.setEntityTableRow(swapped_location.archetype_row, result.table_row)
                } else if (new_archetype_.id === swapped_location.archetype_id) {
                    new_archetype_.setEntityTableRow(swapped_location.archetype_row, result.table_row)
                } else {
                    archetypes_ptr[swapped_location.archetype_id].setEntityTableRow(swapped_location.archetype_row, result.table_row);
                }
            }

            bundle_info.writeComponents(
                new_table,
                sparse_sets,
                archetype_after_insert,
                entity,
                move_result.new_row,
                this.#change_tick,
                bundle,
                insert_mode

            )

            new_archetype = new_archetype_
            new_location = new_location_;
        }

        new_archetype;
        // this.#world.trigger_on_add(
        //     new_archetype,
        //     entity,
        //     archetype_after_insert
        // )

        // if (new_archetype.has_add_observer()) {
        //     this.#world.trigger_observers(
        //         ON_ADD,
        //         entity,
        //         archetype_after_insert.iter_added()
        //     )
        // }

        // if (insert_mode === InsertMode.Replace) {
        //     this.#world.trigger_on_insert(
        //         new_archetype,
        //         entity,
        //         archetype_after_insert.iter_inserted()
        //     )
        //     if (new_archetype.has_insert_observer()) {
        //         this.#world.trigger_observers(
        //             ON_INSERT,
        //             entity,
        //             archetype_after_insert.iter_inserted()
        //         )
        //     }
        // } else {
        //     // InsertMode === Keep
        //     this.#world.trigger_on_insert(
        //         new_archetype,
        //         entity,
        //         archetype_after_insert.iter_added()
        //     )

        //     if (new_archetype.has_insert_observer()) {
        //         this.#world.trigger_observers(
        //             ON_INSERT,
        //             entity,
        //             archetype_after_insert.iter_added()
        //         )
        //     }
        // }


        return new_location;
    }

    entities() {
        return this.#world.entities;
    }
}

type ArchetypeMoveType = 0 | { new_archetype: Archetype } | { new_archetype: Archetype; new_table: Table }
const ArchetypeMoveType = {
    SameArchetype: 0,
    NewArchetypeSameTable(new_archetype: Archetype) {
        return { new_archetype } as const;
    },
    NewArchetypeNewTable(new_archetype: Archetype, new_table: Table) {
        return { new_archetype, new_table } as const;
    }
} as const;

export class ThinBundleSpawner {
    #world: ThinWorld;
    #bundle_info: ThinBundleInfo;
    #table: ThinTable;
    #archetype: Archetype;
    #change_tick: Tick;
    constructor(
        world: ThinWorld,
        bundle_info: ThinBundleInfo,
        table: ThinTable,
        archetype: Archetype,
        change_tick: Tick
    ) {
        this.#world = world
        this.#bundle_info = bundle_info;
        this.#table = table;
        this.#archetype = archetype;
        this.#change_tick = change_tick;
    }

    static new(
        world: ThinWorld,
        bundle: ThinBundle,
        change_tick: Tick
    ) {
        const bundle_id = world.bundles.registerInfo(bundle, world.components, world.storages);
        return ThinBundleSpawner.newWithId(world, bundle_id, change_tick)
    }

    static newWithId(
        world: ThinWorld,
        bundle_id: BundleId,
        change_tick: Tick
    ) {
        const bundle_info = world.bundles.get(bundle_id)! as unknown as ThinBundleInfo;
        const new_archetype_id = bundle_info.insertBundleIntoArchetype(
            world.archetypes,
            world.storages,
            world.components,
            ArchetypeId.EMPTY
        )

        const archetype = world.archetypes.get(new_archetype_id)!;
        const table = world.storages.tables.get(archetype.tableId)!;

        return new ThinBundleSpawner(
            world,
            bundle_info,
            table,
            archetype,
            change_tick
        )
    }


    spawnNonExistent(entity: Entity, bundle: ThinBundle): EntityLocation {
        const bundle_info = this.#bundle_info;

        const table = this.#table;
        const archetype = this.#archetype;
        const w = this.#world;
        const sparse_sets = w.storages.sparse_sets
        const entities = w.entities;

        const table_row = table.allocate(entity);
        const location = archetype.allocate(entity, table_row);

        bundle_info.writeComponents(
            table,
            sparse_sets,
            SpawnBundleStatus,
            entity,
            table_row,
            this.#change_tick,
            bundle,
            InsertMode.Replace,
        )

        // @ts-ignore
        entities.__set(index(entity), location);

        // const archetype = this.#archetype;
        // this.world.trigger_on_add(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )
        // if (archetype.has_add_observer()) {
        //     this.#world.trigger_observers(
        //         ON_ADD,
        //         entity,
        //         bundle_info.iter_contributed_components()
        //     )
        // }

        // this.world.trigger_on_insert(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )

        // if (archetype.has_insert_observer()) {
        //     this.#world.trigger_observers(
        //         ON_INSERT,
        //         entity,
        //         bundle.iter_contributed_components()
        //     )
        // }

        return location;
    }

    spawn(bundle: ThinBundle): Entity {
        const entity = this.entities().alloc();
        this.spawnNonExistent(entity, bundle);
        return entity;
    }

    reserveStorage(additional: number) {
        // @ts-ignore
        this.#archetype.__reserve(additional);
        // @ts-ignore
        this.#table.__reserve(additional);
    }

    entities() {
        return this.#world.entities;
    }

    flushCommands() {
        this.#world.flush();
    }
}

export class BundleSpawner {
    #world: World;
    #bundle_info: BundleInfo;
    #table: Table;
    #archetype: Archetype;
    #change_tick: Tick;
    constructor(
        world: World,
        bundle_info: BundleInfo,
        table: Table,
        archetype: Archetype,
        change_tick: Tick
    ) {
        this.#world = world
        this.#bundle_info = bundle_info;
        this.#table = table;
        this.#archetype = archetype;
        this.#change_tick = change_tick;
    }

    static new(
        bundle: Bundle,
        world: World,
        change_tick: Tick
    ) {
        return BundleSpawner.newWithId(
            world,
            world.bundles.registerInfo(
                bundle,
                world.components,
                world.storages
            ),
            change_tick
        )
    }

    static newWithId(
        world: World,
        bundle_id: BundleId,
        change_tick: Tick
    ) {
        const bundle_info = world.bundles.get(bundle_id)!;
        const new_archetype_id = bundle_info.insertBundleIntoArchetype(
            world.archetypes,
            world.storages,
            world.components,
            ArchetypeId.EMPTY
        )
        const archetype = world.archetypes.get(new_archetype_id)!;
        const table = world.storages.tables.get(archetype.tableId)!;

        return new BundleSpawner(
            world,
            bundle_info,
            table,
            archetype,
            change_tick
        )
    }

    spawnNonExistent(entity: Entity, bundle: Bundle): EntityLocation {
        const bundle_info = this.#bundle_info;

        const table = this.#table;
        const archetype = this.#archetype;
        const w = this.#world;
        const sparse_sets = w.storages.sparse_sets
        const entities = w.entities;

        // @ts-ignore
        const table_row = table.allocate(entity);
        // @ts-ignore
        const location = archetype.allocate(entity, table_row);

        bundle_info.writeComponents(
            table,
            sparse_sets,
            SpawnBundleStatus,
            entity,
            table_row,
            this.#change_tick,
            bundle,
            InsertMode.Replace
        )

        // @ts-ignore
        entities.__set(index(entity), location);

        // const archetype = this.#archetype;
        // this.world.trigger_on_add(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )
        // if (archetype.has_add_observer()) {
        //     this.#world.trigger_observers(
        //         ON_ADD,
        //         entity,
        //         bundle_info.iter_contributed_components()
        //     )
        // }

        // this.world.trigger_on_insert(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )

        // if (archetype.has_insert_observer()) {
        //     this.#world.trigger_observers(
        //         ON_INSERT,
        //         entity,
        //         bundle.iter_contributed_components()
        //     )
        // }

        return location;
    }

    spawn(bundle: Bundle): Entity {
        const entity = this.entities().alloc();
        this.spawnNonExistent(entity, bundle);
        return entity;
    }

    reserveStorage(additional: number) {
        // @ts-ignore
        this.#archetype.__reserve(additional);
        // @ts-ignore
        this.#table.__reserve(additional);
    }

    entities() {
        return this.#world.entities;
    }

    flushCommands() {
        this.#world.flush();
    }

}

export class ThinBundles {

    #bundle_infos: ThinBundleInfo[];
    #bundle_ids: Map<string, BundleId>;
    // Cache dynamic `BundleId` with multiple components
    #dynamic_bundle_ids: Map<string, BundleId>;
    #dynamic_bundle_storages: Map<BundleId, StorageType[]>;
    // Cache optimized dynamic `BundleId` with single component
    #dynamic_component_bundle_ids: Map<ComponentId, BundleId>;
    #dynamic_component_storages: Map<BundleId, StorageType>;

    constructor() {
        this.#bundle_infos = [];
        this.#bundle_ids = new Map();
        this.#dynamic_bundle_ids = new Map();
        this.#dynamic_component_bundle_ids = new Map();
        this.#dynamic_component_storages = new Map();
        this.#dynamic_bundle_storages = new Map();
    }

    get(bundle_id: BundleId): Option<ThinBundleInfo> {
        return this.#bundle_infos[bundle_id];
    }

    getId(type_id: TypeId) {
        return this.#bundle_ids.get(type_id.type_id);
    }

    getIdTypeId(type_id: UUID) {
        return this.#bundle_ids.get(type_id);
    }

    registerInfo(bundle: ThinBundle, components: ThinComponents, storages: ThinStorages): BundleId {
        const bundle_infos = this.#bundle_infos;
        const id = this.#bundle_ids.get(bundle.type_id)!;

        if (id != null) {
            return id;
        } else {
            const component_ids: number[] = [];
            bundle.componentIds(components, id => component_ids.push(id))
            const id = bundle_infos.length;
            const bundle_info = new ThinBundleInfo(bundle.name, storages, components, component_ids, id)
            bundle_infos.push(bundle_info)
            this.#bundle_ids.set(bundle.type_id, id);
            return id;
        }
    }

    getStorageUnchecked(id: BundleId) {
        return this.#dynamic_component_storages.get(id)!;
    }

    setStorageUnchecked(id: BundleId, storage_type: StorageType) {
        this.#dynamic_component_storages.set(id, storage_type)
    }

    getStoragesUnchecked(id: BundleId) {
        return this.#dynamic_bundle_storages.get(id)!;
    }

    setStoragesUnchecked(id: BundleId, storage_types: StorageType[]) {
        this.#dynamic_bundle_storages.set(id, storage_types);
    }

    initInfo(bundle: ThinBundle, components: ThinComponents, storages: ThinStorages): ThinBundleInfo {
        const bundle_infos = this.#bundle_infos;
        const ids: ComponentId[] = [];
        bundle.componentIds(components, (id) => ids.push(id));
        const hash = bundle.type_id;
        const id = entry(this.#bundle_ids, hash, () => {
            const id = bundle_infos.length;
            const bundle_info = new ThinBundleInfo(bundle.name ?? '<bundle>', storages, components, ids, id)
            bundle_infos.push(bundle_info);
            this.#bundle_ids.set(hash, id);
            return id;
        })

        // ! SAFETY: index either exists, or was initialized
        return this.#bundle_infos[id];
    }

    /**
     * @description
     * Initializes a new `BundleInfo` for a dynamic `Bundle`.
     * 
     * @throws If any of the provided [`ComponentId`]s do not exist in the provided `Components`.
     */
    initDynamicInfo(components: ThinComponents, storages: ThinStorages, component_ids: ComponentId[]): BundleId {
        const bundle_infos = this.#bundle_infos;
        const hash = hash_bundles(component_ids.map(id => components.getInfo(id)!.descriptor.type as unknown as ThinBundle));
        const bundle_id = entry(this.#dynamic_bundle_ids, hash, () => {
            const [id, storage_types] = initialize_dynamic_thin_bundle(bundle_infos, storages, components, component_ids)
            this.#dynamic_bundle_storages.set(id, storage_types)
            return id;
        })
        return bundle_id;
    }

    /**
     * @description Initializes a new `BundleInfo` for a dynamic `Bundle` with single component.
     * @throws If the provided `ComponentId` does not exist in the provided `Components`.
     * @returns A tuple [BundleInfo, StorageType].
    */
    initComponentInfo(components: ThinComponents, storages: ThinStorages, component_id: ComponentId): BundleId {
        const bundle_infos = this.#bundle_infos;
        return entry(this.#dynamic_component_bundle_ids, component_id, () => {
            const [id, storage_type] = initialize_dynamic_thin_bundle(bundle_infos, storages, components, [component_id])
            this.#dynamic_component_storages.set(id, storage_type[0])
            return id;
        })
    }
}

export class Bundles {
    #bundle_infos: BundleInfo[];
    #bundle_ids: Map<string, BundleId>;
    // Cache dynamic `BundleId` with multiple components
    #dynamic_bundle_ids: Map<string, BundleId>;
    #dynamic_bundle_storages: Map<BundleId, StorageType[]>;
    // Cache optimized dynamic `BundleId` with single component
    #dynamic_component_bundle_ids: Map<ComponentId, BundleId>;
    #dynamic_component_storages: Map<BundleId, StorageType>;

    constructor() {
        this.#bundle_infos = [];
        this.#bundle_ids = new Map();
        this.#dynamic_bundle_ids = new Map();
        this.#dynamic_component_bundle_ids = new Map();
        this.#dynamic_component_storages = new Map();
        this.#dynamic_bundle_storages = new Map();
    }

    static dynamicBundle(bundle: (Bundle | Component | InstanceType<Component>)[]): Bundle {
        return define_bundle(bundle);
    }


    static init_state() { }

    static get_param(_state: void, _system_meta: SystemMeta, world: World) {
        return world.bundles
    }


    get(bundle_id: BundleId): Option<BundleInfo> {
        return this.#bundle_infos[bundle_id];
    }

    getId(type_id: TypeId) {
        return this.#bundle_ids.get(type_id.type_id);
    }

    getIdTypeId(type_id: UUID) {
        return this.#bundle_ids.get(type_id);
    }

    registerInfo(bundle: Bundle, components: Components, storages: Storages): BundleId {
        const bundle_infos = this.#bundle_infos;
        const id = this.#bundle_ids.get(bundle.type_id)!;

        if (id != null) {
            return id;
        } else {
            const component_ids: number[] = [];
            bundle.componentIds(components, id => component_ids.push(id))
            const id = bundle_infos.length;
            const bundle_info = new BundleInfo(bundle.name, storages, components, component_ids, id)
            bundle_infos.push(bundle_info)
            this.#bundle_ids.set(bundle.type_id, id);
            return id;
        }
    }

    registerThinInfo(bundle: ThinBundle, components: ThinComponents, storages: ThinStorages): BundleId {
        const id = this.#bundle_ids.get(bundle.type_id)!;


        if (id != null) {
            return id;
        } else {
            const bundle_infos = this.#bundle_infos;
            const component_ids: number[] = [];
            bundle.componentIds(components, id => component_ids.push(id))
            const id = bundle_infos.length;
            const bundle_info = new ThinBundleInfo(bundle.name, storages, components, component_ids, id)
            bundle_infos.push(bundle_info as any)
            this.#bundle_ids.set(bundle.type_id, id);
            return id;
        }
    }

    getStorageUnchecked(id: BundleId) {
        return this.#dynamic_component_storages.get(id)!;
    }

    setStorageUnchecked(id: BundleId, storage_type: StorageType) {
        this.#dynamic_component_storages.set(id, storage_type)
    }

    getStoragesUnchecked(id: BundleId) {
        return this.#dynamic_bundle_storages.get(id)!;
    }

    setStoragesUnchecked(id: BundleId, storage_types: StorageType[]) {
        this.#dynamic_bundle_storages.set(id, storage_types);
    }

    initInfo(bundle: Bundle, components: Components, storages: Storages): BundleInfo {
        const bundle_infos = this.#bundle_infos;
        const ids: ComponentId[] = [];
        bundle.componentIds(components, (id) => ids.push(id));

        const hash = bundle.type_id;
        const id = entry(this.#bundle_ids, hash, () => {
            const id = bundle_infos.length;
            const bundle_info = new BundleInfo(bundle.constructor?.name ?? '<bundle>', storages, components, ids, id)
            bundle_infos.push(bundle_info);
            this.#bundle_ids.set(hash, id);
            return id;
        })

        // ! SAFETY: index either exists, or was initialized
        return this.#bundle_infos[id];
    }

    /**
     * @description
     * Initializes a new `BundleInfo` for a dynamic `Bundle`.
     * 
     * @throws If any of the provided [`ComponentId`]s do not exist in the provided `Components`.
     */
    initDynamicInfo(components: Components, storages: Storages, component_ids: ComponentId[]): BundleId {
        const bundle_infos = this.#bundle_infos;
        const bundle_id = entry(this.#dynamic_bundle_ids, component_ids.map(id => components.getInfo(id)!.descriptor.type).join(''), () => {
            const [id, storage_types] = initialize_dynamic_bundle(bundle_infos, storages, components, component_ids)
            this.#dynamic_bundle_storages.set(id, storage_types)
            return id;
        })
        return bundle_id;
    }

    /**
     * @description Initializes a new `BundleInfo` for a dynamic `Bundle` with single component.
     * @throws If the provided `ComponentId` does not exist in the provided `Components`.
     * @returns A tuple [BundleInfo, StorageType].
    */
    initComponentInfo(components: Components, storages: Storages, component_id: ComponentId): BundleId {
        const bundle_infos = this.#bundle_infos;
        return entry(this.#dynamic_component_bundle_ids, component_id, () => {
            const [id, storage_type] = initialize_dynamic_bundle(bundle_infos, storages, components, [component_id])
            this.#dynamic_component_storages.set(id, storage_type[0])
            return id;
        })
    }

}

/**
 * Asserts that all components are part of `Components`
 * and initializes a `BundleInfo`.
 */
function initialize_dynamic_bundle(
    bundle_infos: BundleInfo[],
    storages: Storages,
    components: Components,
    component_ids: ComponentId[]
): [BundleId, StorageType[]] {
    const storages_types = component_ids.map(id => {
        const info = components.getInfo(id);
        if (!info) {
            throw new Error(`init_dynamic_info() called with component id ${id} which doesn't exist in this world.`)
        }
        return info.storageType;
    })
    const id = bundle_infos.length;
    const bundle_info = new BundleInfo('<dynamic bundle>', storages, components, component_ids, id);
    bundle_infos.push(bundle_info);
    return [id, storages_types];
}

/**
 * Asserts that all components are part of `Components`
 * and initializes a `BundleInfo`.
 */
function initialize_dynamic_thin_bundle(
    bundle_infos: ThinBundleInfo[],
    storages: ThinStorages,
    components: ThinComponents,
    component_ids: ComponentId[]
): [BundleId, StorageType[]] {
    const storages_types = component_ids.map(id => {
        const info = components.getInfo(id);
        if (!info) {
            throw new Error(`init_dynamic_info() called with component id ${id} which doesn't exist in this world.`)
        }
        return info.storageType;
    })
    const id = bundle_infos.length;
    const bundle_info = new ThinBundleInfo('<dynamic bundle>', storages, components, component_ids, id);
    bundle_infos.push(bundle_info);
    return [id, storages_types];
}

function sorted_remove<T extends Ord>(source: T[], remove: T[]) {
    let remove_index = remove.length - 1;
    for (let i = source.length - 1; i >= 0; i--) {
        const value = source[i]!;
        while (remove_index > 0 && value < remove[remove_index]) {
            remove_index -= 1;
        }

        if (remove_index >= 0) {
            if (value === remove[remove_index]) {
                source.splice(i, 1);
            }
        } else {
            source.splice(i, 1);
        }
    }
}