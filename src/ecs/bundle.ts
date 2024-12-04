import { Option, is_some } from 'joshkaposh-option'
import { Archetype, ArchetypeId, Archetypes, BundleComponentStatus, ComponentStatus, SpawnBundleStatus } from "./archetype";
import { Component, ComponentId, Components } from "./component";
import { Entities, Entity, EntityLocation } from "./entity";
import { StorageType, Storages } from "./storage";
import { SparseSets } from "./storage/sparse-set";
import { Table, TableRow } from "./storage/table";
import { extend } from "../array-helpers";
import { entry } from "../util";
import { Prettify, TODO } from "joshkaposh-iterator/src/util";

export type BundleId = number;

export type Bundle<F = Component> = {
    // Gets this `Bundle`s component_ids, in the order of this bundle's `Component`s
    component_ids(components: Components, storages: Storages, ids: (component_id: ComponentId) => void): void;

    // Calls `func`, which should return data for each component in the bundle, in the order of
    // this bundle's `Component`s

    // ! Safety
    // Caller must return data for each component in the bundle, in the order of this bundle's `Components`s.
    from_components<T>(ctx: T, func: (ptr: T) => Bundle): Bundle;
}

// The parts from the `Bundle` that don't require statically knowing the components of the bundle.
export type DynamicBundle = {
    // SAFETY:
    // The `StorageType` argument passed into [`Bundle::get_components`] must be correct for the
    // component being fetched.
    //
    /// Calls `func` on each value, in the order of this bundle's [`Component`]s. This passes
    /// ownership of the component values to `func`.
    get_components(func: (storage_type: StorageType, ptr: {}) => void): void;
};

export abstract class BundleImpl<T extends readonly any[]> implements Bundle, DynamicBundle {
    #types: T;
    constructor(types: T) {
        this.#types = types;
    }

    component_ids(components: Components, storages: Storages, ids: (component_id: number) => void): void {
        for (let i = 0; i < this.#types.length; i++) {
            ids(components.init_component(this.#types[i], storages));
        }
    }
    from_components<T>(ctx: T, func: (ptr: T) => Bundle): Bundle {
        return TODO('Bundle::BundleImpl::from_components', ctx, func);
    }

    get_components(func: (storage_type: StorageType, ptr: {}) => void): void {
        for (let i = 0; i < this.#types.length; i++) {
            const type = this.#types[i];
            func(type.storage_type ?? type.constructor.storage_type, type)

        }
    }
}

export function define_bundle(bundle: any[]): Bundle & DynamicBundle {
    const bundles: (Bundle & DynamicBundle)[] = [];

    function rec(b: any[]) {
        b.forEach(c => {
            if (c.type_id || c.constructor.type_id) {
                bundles.push(BundleFromComponent(c));
            }

            if (Array.isArray(c)) {
                rec(c)
            }
        })
    }

    rec(bundle);

    const bun: Bundle & DynamicBundle = {
        component_ids(components, storages, ids) {
            for (const b of bundles) {
                b.component_ids(components, storages, ids)
            }
        },

        from_components(ctx, func) {
            return bundles.map(b => b.from_components(ctx, func)) as any;
        },

        get_components(func) {
            bundles.forEach(b => b.get_components(func))
        },

    }

    return bun;
}

function ComponentBundle(type: Component | InstanceType<Component>): Bundle {
    return {
        component_ids(components, storages, ids) {
            if (!type.type_id) {
                ids(components.init_component(type.constructor, storages));
            } else {
                ids(components.init_component(type, storages));
            }
        },
        from_components(ctx, func) {
            return func(ctx);
        },
    }
}

function ComponentDynamicBundle(type: Component | InstanceType<Component>): DynamicBundle {
    return {
        get_components(func) {
            return func(type.storage_type ?? type.constructor.storage_type, type)
        },
    }
}

export function BundleFromComponent(component: Component): Bundle & DynamicBundle {
    return {
        ...ComponentBundle(component),
        ...ComponentDynamicBundle(component)
    }
}

function bundle_hash(ids: number[]): string {
    return ids.toSorted().join('');
}

export class BundleInfo {
    #id: BundleId;
    #component_ids: ComponentId[];
    //! SAFETY: Every ID in this list must be valid within the World that owns the BundleInfo,
    // must have its storage initialized (i.e. columns created in tables, sparse set created),
    // and must be in the same order as the source bundle type writes its components in.
    constructor(
        bundle_type_name: string,
        components: Components,
        component_ids: ComponentId[],
        id: BundleId
    ) {
        // const deduped = [...new Set(structuredClone(component_ids))].sort();

        // if (deduped.length !== component_ids.length) {
        //     const seen = new Set();
        //     const dups = [];
        //     for (const id of component_ids) {
        //         if (!seen.has(id)) {
        //             seen.add(id);
        //             dups.push(id)
        //         }
        //     }

        //     const names = dups.map(id => components.get_info(id)!.name()).join(', ');
        //     throw new Error(`Bundle ${bundle_type_name} has duplicate components: ${names}`)
        // }

        this.#id = id;
        this.#component_ids = component_ids;
    }

    id() {
        return this.#id;
    }

    components(): ComponentId[] {
        return this.#component_ids;
    }

    __get_bundle_inserter(
        entities: Entities,
        archetypes: Archetypes,
        components: Components,
        storages: Storages,
        archetype_id: ArchetypeId
    ): BundleInserter {
        const new_archetype_id = this.__add_bundle_to_archetype(archetypes, storages, components, archetype_id);
        let archetypes_ptr;
        if (new_archetype_id === archetype_id) {
            const archetype = archetypes.get(archetype_id)!;
            const table_id = archetype.table_id();

            return new BundleInserter(archetype, entities, this, storages.tables.get(table_id)!, storages.sparse_sets, InsertBundleResult.SameArchetype, archetypes_ptr as any)
        } else {
            const [archetype, new_archetype] = archetypes.__get_2_mut(archetype_id, new_archetype_id)
            const table_id = archetype.table_id();
            if (table_id === new_archetype.table_id()) {
                return new BundleInserter(
                    archetype,
                    entities,
                    this,
                    storages.tables.get(table_id)!,
                    storages.sparse_sets,
                    InsertBundleResult.NewArchetypeSameTable(new_archetype),
                    archetypes_ptr as any
                )
            } else {
                const [table, new_table] = storages.tables.__get_2(table_id, new_archetype.table_id());
                return new BundleInserter(
                    archetype,
                    entities,
                    this,
                    table,
                    storages.sparse_sets,
                    InsertBundleResult.NewArchetypeNewTable(new_archetype, new_table),
                    archetypes_ptr as any
                )
            }
        }
    }

    __get_bundle_spawner(
        entities: Entities,
        archetypes: Archetypes,
        components: Components,
        storages: Storages,
    ): BundleSpawner {
        const new_archetype_id = this.__add_bundle_to_archetype(archetypes, storages, components, ArchetypeId.EMPTY);
        const archetype = archetypes.get(new_archetype_id)!;
        const table = storages.tables.get(archetype.table_id())!;
        return new BundleSpawner(archetype, this, entities, table, storages.sparse_sets)
    }

    /// This writes components from a given [`Bundle`] to the given entity.
    ///
    /// # Safety
    ///
    /// `bundle_component_status` must return the "correct" [`ComponentStatus`] for each component
    /// in the [`Bundle`], with respect to the entity's original archetype (prior to the bundle being added)
    /// For example, if the original archetype already has `ComponentA` and `T` also has `ComponentA`, the status
    /// should be `Mutated`. If the original archetype does not have `ComponentA`, the status should be `Added`.
    /// When "inserting" a bundle into an existing entity, [`AddBundle`](crate::archetype::AddBundle)
    /// should be used, which will report `Added` vs `Mutated` status based on the current archetype's structure.
    /// When spawning a bundle, [`SpawnBundleStatus`] can be used instead, which removes the need
    /// ownership of the entity's current archetype.
    ///
    /// `table` must be the "new" table for `entity`. `table_row` must have space allocated for the
    /// `entity`, `bundle` must match this [`BundleInfo`]'s type


    __write_components<T extends DynamicBundle>(
        table: Table,
        sparse_sets: SparseSets,
        bundle_component_status: BundleComponentStatus,
        entity: Entity,
        table_row: TableRow,
        bundle: T,
    ) {

        // NOTE: get_components calls this closure on each component in "bundle order".
        // bundle_info.component_ids are also in "bundle order"
        let bundle_component = 0;
        bundle.get_components((storage_type, component_ptr) => {
            const component_id = this.#component_ids[bundle_component];

            if (storage_type === StorageType.Table) {
                const column = table.get_column(component_id)!;
                if (
                    ComponentStatus.Added
                    === bundle_component_status.get_status(bundle_component)
                ) {
                    column.__initialize(table_row, component_ptr);
                } else {
                    column.__replace(table_row, component_ptr);
                }
            } else if (storage_type === StorageType.SparseSet) {
                const sparse_set = sparse_sets.get(component_id);
                sparse_set?.__insert(entity, component_ptr);
            }

            bundle_component += 1;
        })
    }

    /// Adds a bundle to the given archetype and returns the resulting archetype. This could be the
    /// same [`ArchetypeId`], in the event that adding the given bundle does not result in an
    /// [`Archetype`] change. Results are cached in the [`Archetype`] graph to avoid redundant work.
    __add_bundle_to_archetype(
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        archetype_id: ArchetypeId,
    ): ArchetypeId {
        const add_bundle_id = archetypes.get(archetype_id)?.edges().get_add_bundle(this.#id);
        if (is_some(add_bundle_id)) {
            return add_bundle_id;
        }

        const new_table_components = [];
        const new_sparse_set_components = [];
        const bundle_status = new Array(this.#component_ids.length);

        let current_archetype = archetypes.get(archetype_id)!;
        for (const component_id of this.#component_ids) {
            if (current_archetype.contains(component_id)) {
                bundle_status.push(ComponentStatus.Mutated)
            } else {
                bundle_status.push(ComponentStatus.Added);
                const storage_type = components.get_info(component_id)!.descriptor.storage_type;
                if (storage_type === StorageType.Table) {
                    new_table_components.push(component_id)
                } else {
                    new_sparse_set_components.push(component_id);
                }
            }
        }

        if (new_table_components.length === 0 && new_sparse_set_components.length === 0) {
            const edges = current_archetype.edges();
            edges.__insert_add_bundle(this.#id, archetype_id, bundle_status);
            return archetype_id;
        } else {
            let table_id, table_components, sparse_set_components;

            let current_archetype = archetypes.get(archetype_id)!;

            if (new_table_components.length === 0) {
                table_id = current_archetype.table_id();
                table_components = current_archetype.table_components().collect();
            } else {
                extend(new_table_components, current_archetype.table_components());
                new_table_components.sort();
                table_id = storages.tables.__get_id_or_insert(new_table_components, components)
                table_components = new_table_components;
            }

            if (new_sparse_set_components.length === 0) {
                sparse_set_components = current_archetype.sparse_set_components().collect();
            } else {
                extend(new_sparse_set_components, current_archetype.sparse_set_components());
                new_sparse_set_components.sort();
                sparse_set_components = new_sparse_set_components;
            }

            const new_archetype_id = archetypes.__get_id_or_insert(components, table_id, table_components, sparse_set_components);
            archetypes.get(archetype_id)!.edges().__insert_add_bundle(
                this.#id,
                new_archetype_id,
                bundle_status,
            )
            return new_archetype_id;
        }
    }
}

export class BundleInserter {
    constructor(
        public archetype: Archetype,
        public entities: Entities,
        public bundle_info: BundleInfo,
        public table: Table,
        public sparse_sets: SparseSets,
        public result: InsertBundleResult,
        public archetypes_ptr: Archetype

    ) { }

    insert(
        entity: Entity,
        location: EntityLocation,
        bundle: DynamicBundle
    ): EntityLocation {
        const { type } = this.result;
        if (type === 'SameArchetype') {
            const add_bundle = this.archetype.edges().__get_add_bundle_internal(this.bundle_info.id())!
            this.bundle_info.__write_components(
                this.table,
                this.sparse_sets,
                add_bundle,
                entity,
                location.table_row,
                bundle
            )
            return location;
        } else if (type === 'NewArchetypeSameTable') {
            const { new_archetype } = this.result;
            const result = this.archetype.__swap_remove(location.archetype_row);
            const swapped_entity = result.swapped_entity
            if (is_some(swapped_entity)) {
                const swapped_location = this.entities.get(swapped_entity)!;
                this.entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            const new_location = new_archetype.__allocate(entity, result.table_row);
            this.entities.__set(entity.index(), new_location);

            const add_bundle = this.archetype.edges().__get_add_bundle_internal(this.bundle_info.id())!;
            this.bundle_info.__write_components(
                this.table,
                this.sparse_sets,
                add_bundle,
                entity,
                result.table_row,
                bundle
            )
            return new_location;
        } else {
            const { new_table, new_archetype } = this.result
            let result = this.archetype.__swap_remove(location.archetype_row);
            let swapped_entity = result.swapped_entity;
            if (swapped_entity) {
                const swapped_location = this.entities.get(swapped_entity)!;
                this.entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            const move_result = this.table.__move_to_superset_unchecked(result.table_row, new_table);
            const new_location = new_archetype.__allocate(entity, move_result.new_row);
            this.entities.__set(entity.index(), new_location);

            swapped_entity = move_result.swapped_entity;
            if (swapped_entity) {
                const swapped_location = this.entities.get(swapped_entity)!;
                let swapped_archetype!: Archetype;
                if (this.archetype.id() === swapped_location.archetype_id) {
                    swapped_archetype = this.archetype
                } else if (new_archetype.id() === swapped_location.archetype_id) {
                    swapped_archetype = new_archetype;
                } else {
                    console.warn('BundleInserter::insert() - This else branch may not do what is expected')
                    // self.archetypes_ptr.add(swapped_location.archetype_id.index())
                    // @ts-expect-error
                    this.archetypes_ptr += swapped_location.archetype_id;
                }

                this.entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: result.table_row,
                })

                swapped_archetype.__set_entity_table_row(swapped_location.archetype_row, result.table_row);

                const add_bundle = this.archetype.edges().__get_add_bundle_internal(this.bundle_info.id())!
                this.bundle_info.__write_components(
                    new_table,
                    this.sparse_sets,
                    add_bundle,
                    entity,
                    move_result.new_row,
                    bundle
                )
            }

            return new_location;
        }
    }
}

export class BundleSpawner {
    __archetype: Archetype;
    __entities: Entities;
    #bundle_info: BundleInfo;
    #table: Table;
    #sparse_sets: SparseSets;

    constructor(
        archetype: Archetype,
        bundle_info: BundleInfo,
        entities: Entities,
        table: Table,
        sparse_sets: SparseSets
    ) {
        this.__archetype = archetype;
        this.#bundle_info = bundle_info;
        this.__entities = entities;
        this.#table = table;
        this.#sparse_sets = sparse_sets;
    }

    reserve_storage(additional: number) {
        this.__archetype.__reserve(additional);
        this.#table.__reserve(additional);
    }

    // ! Safety
    // `entity` must be allocated (but non-existent), `Bundle` must match this `BundleInfo`s type
    spawn_non_existent(entity: Entity, bundle: DynamicBundle): EntityLocation {
        const table_row = this.#table.__allocate(entity);
        const location = this.__archetype.__allocate(entity, table_row);
        this.#bundle_info.__write_components(this.#table, this.#sparse_sets, SpawnBundleStatus, entity, table_row, bundle)
        this.__entities.__set(entity.index(), location);
        return location;
    }

    // ! Safety
    // `T` must match this `BundleInfo`s type
    spawn(bundle: DynamicBundle): Entity {
        const entity = this.__entities.alloc();
        this.spawn_non_existent(entity, bundle);
        return entity;
    }
}

type InsertBundleResult = Prettify<Readonly<{
    type: 'SameArchetype';

} | {
    type: 'NewArchetypeSameTable'
    new_archetype: Archetype;
} | {
    type: 'NewArchetypeNewTable'
    new_archetype: Archetype;
    new_table: Table;
}>>
const InsertBundleResult = {
    SameArchetype: {
        type: 'SameArchetype'
    },
    NewArchetypeSameTable(new_archetype: Archetype) {
        return {
            type: 'NewArchetypeSameTable',
            new_archetype

        } as const;
    },
    NewArchetypeNewTable(new_archetype: Archetype, new_table: Table) {
        return {
            type: 'NewArchetypeNewTable',
            new_archetype,
            new_table
        } as const;
    }
} as const;


export class Bundles {
    #bundle_infos: BundleInfo[];
    // Cache static `BundleId`
    // TypeIdMap<BundleId>
    #bundle_ids: Map<string, BundleId>;
    // Cache dynamic `BundleId` with multiple components
    #dynamic_bundle_ids: Map<ComponentId[], [BundleId, Array<StorageType>]>;
    // Cache optimized dynamic `BundleId` with single component
    #dynamic_component_bundle_ids: Map<ComponentId, [BundleId, StorageType]>;

    constructor() {
        this.#bundle_infos = [];
        this.#bundle_ids = new Map();
        this.#dynamic_bundle_ids = new Map();
        this.#dynamic_component_bundle_ids = new Map();
    }

    static dynamic_bundle(bundle: any[]): Bundle & DynamicBundle {
        return define_bundle(bundle);
    }

    get(bundle_id: BundleId): Option<BundleInfo> {
        return this.#bundle_infos[bundle_id];
    }

    __init_info(bundle: Bundle, components: Components, storages: Storages): BundleInfo {
        const bundle_infos = this.#bundle_infos;
        const ids: ComponentId[] = [];
        bundle.component_ids(components, storages, (id) => ids.push(id));
        const hash = bundle_hash(ids);
        const id = entry(this.#bundle_ids, hash, () => {
            const id = bundle_infos.length;
            const bundle_info = new BundleInfo(bundle.constructor?.name ?? '<bundle>', components, ids, id)
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
    __init_dynamic_info(components: Components, component_ids: ComponentId[]): [BundleInfo, StorageType[]] {
        const bundle_infos = this.#bundle_infos;
        const [bundle_id, storage_types] = entry(this.#dynamic_bundle_ids, component_ids, () => initialize_dynamic_bundle(bundle_infos, components, structuredClone(component_ids)))
        const bundle_info = bundle_infos[bundle_id];
        return [bundle_info, storage_types];
    }

    /**
     * @description Initializes a new `BundleInfo` for a dynamic `Bundle` with single component.
     * @throws If the provided `ComponentId` does not exist in the provided `Components`.
     * @returns A tuple [BundleInfo, StorageType].
    */
    __init_component_info(components: Components, component_id: ComponentId): [BundleInfo, StorageType] {
        const bundle_infos = this.#bundle_infos;
        const [bundle_id, storage_types] = entry(this.#dynamic_component_bundle_ids, component_id, () => {
            const [id, storage_type] = initialize_dynamic_bundle(bundle_infos, components, [component_id])
            return [id, storage_type[0]];
        })

        const bundle_info = bundle_infos[bundle_id];
        return [bundle_info, storage_types]
    }


}

// Asserts that all components are part of of `Components`
// and initializes a `BundleInfo`.
function initialize_dynamic_bundle(bundle_infos: BundleInfo[], components: Components, component_ids: ComponentId[]): [BundleId, StorageType[]] {
    const storages_types = component_ids.map(id => {
        const info = components.get_info(id);
        if (!info) {
            throw new Error(`init_dynamic_info called with component id ${id} which doesn't exist in this world`)
        }
        return info.storage_type();
    })
    const id = bundle_infos.length;
    const bundle_info = new BundleInfo('<dynamic bundle>', components, component_ids, id);
    bundle_infos.push(bundle_info);
    return [id, storages_types];
}