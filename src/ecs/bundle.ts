import { Option, is_some } from 'joshkaposh-option'
import { Archetype, ArchetypeId, Archetypes, BundleComponentStatus, ComponentStatus, SpawnBundleStatus } from "./archetype";
import { Component, ComponentId, Components, Tick } from "./component";
import { Entities, Entity, EntityLocation } from "./entity";
import { StorageType, Storages } from "./storage";
import { SparseSets } from "./storage/sparse-set";
import { Table, TableRow } from "./storage/table";
import { extend } from "../array-helpers";
import { entry } from "../util";
import { Prettify } from "joshkaposh-iterator/src/util";
import { AddBundle, TypeId, World } from '.';
import { iter } from 'joshkaposh-iterator';

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
        archetype_id: ArchetypeId,
        change_tick: Tick,
    ): BundleInserter {
        const new_archetype_id = this.__add_bundle_to_archetype(archetypes, storages, components, archetype_id);
        let archetypes_ptr;
        if (new_archetype_id === archetype_id) {
            const archetype = archetypes.get(archetype_id)!;
            const table_id = archetype.table_id();

            // @ts-expect-error
            return new BundleInserter(archetype, entities, this, storages.tables.get(table_id)!, storages.sparse_sets, InsertBundleResult.SameArchetype, archetypes_ptr as any, change_tick)
        } else {
            const [archetype, new_archetype] = archetypes.__get_2_mut(archetype_id, new_archetype_id)
            const table_id = archetype.table_id();
            if (table_id === new_archetype.table_id()) {
                //     return new BundleInserter(
                //         bundle,

                //         // entities,
                //         // this,
                //         // storages.tables.get(table_id)!,
                //         // storages.sparse_sets,
                //         // InsertBundleResult.NewArchetypeSameTable(new_archetype),
                //         // archetypes_ptr as any
                //     )
            } else {
                const [table, new_table] = storages.tables.__get_2(table_id, new_archetype.table_id());
                return new BundleInserter(
                    archetype as any,
                    entities as any,
                    this,
                    table as any,
                    storages.sparse_sets as any,
                    InsertBundleResult.NewArchetypeNewTable(new_archetype, new_table) as any,
                    archetypes_ptr as any,
                    change_tick
                ) as any
            }
        }
    }

    __get_bundle_spawner(
        entities: Entities,
        archetypes: Archetypes,
        components: Components,
        storages: Storages,
        change_tick: Tick,
    ): BundleSpawner {
        const new_archetype_id = this.__add_bundle_to_archetype(archetypes, storages, components, ArchetypeId.EMPTY);
        const archetype = archetypes.get(new_archetype_id)!;
        const table = storages.tables.get(archetype.table_id())!;
        return new BundleSpawner(archetype, this, entities, table, storages.sparse_sets, change_tick)
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
        change_tick: Tick,
        bundle: T,
        insert_mode: InsertMode
    ) {
        // NOTE: get_components calls this closure on each component in "bundle order".
        // bundle_info.component_ids are also in "bundle order"
        let bundle_component = 0;
        bundle.get_components((storage_type, component_ptr) => {
            const component_id = this.#component_ids[bundle_component];

            if (storage_type === StorageType.Table) {
                const column = table.get_column(component_id)!;
                const status = bundle_component_status.get_status(bundle_component);
                if (
                    ComponentStatus.Added === status
                ) {
                    column.__initialize(table_row, component_ptr, change_tick);
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Replace) {
                    column.__replace(table_row, component_ptr, change_tick);
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Keep) {
                    const drop_fn = table.get_drop_for(component_id);
                    if (drop_fn) {
                        drop_fn(component_ptr);
                    }

                }
            } else if (storage_type === StorageType.SparseSet) {
                const sparse_set = sparse_sets.get(component_id)!;
                sparse_set.__insert(entity, component_ptr, change_tick);
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
        const bundle_status = [];
        const added: any[] = [];
        const existing = [];
        let current_archetype = archetypes.get(archetype_id)!;
        for (const component_id of this.#component_ids) {
            if (current_archetype.contains(component_id)) {
                bundle_status.push(ComponentStatus.Existing);
                existing.push(component_id)
            } else {
                bundle_status.push(ComponentStatus.Added);
                existing.push(component_id);
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
            edges.__insert_add_bundle(
                this.#id,
                archetype_id,
                bundle_status,
                added,
                existing,
            );
            return archetype_id;
        } else {
            let table_id, table_components, sparse_set_components;

            (() => {
                let current_archetype = archetypes.get(archetype_id)!;

                if (new_table_components.length === 0) {
                    table_id = current_archetype.table_id();
                    table_components = current_archetype.table_components().collect();
                } else {
                    extend(new_table_components, current_archetype.table_components(), 0);
                    new_table_components.sort();
                    table_id = storages.tables.__get_id_or_insert(new_table_components, components);

                    table_components = new_table_components;
                }

                if (new_sparse_set_components.length === 0) {
                    sparse_set_components = current_archetype.sparse_set_components().collect()
                } else {
                    extend(new_sparse_set_components, current_archetype.sparse_set_components(), 0);
                    new_sparse_set_components.sort();
                    sparse_set_components = new_sparse_set_components
                }
            })()

            let new_archetype_id = archetypes.__get_id_or_insert(
                components,
                table_id,
                table_components,
                sparse_set_components
            )

            archetypes.get(archetype_id)!.edges().__insert_add_bundle(
                this.#id,
                new_archetype_id,
                bundle_status,
                added,
                existing
            )
            return new_archetype_id;
        }
    }

    iter_components() {
        return iter(this.#component_ids);
    }
}

type InsertMode = 0 | 1
const InsertMode = {
    Replace: 0,
    Keep: 1,
} as const;

export class BundleInserter {
    constructor(
        public bundle: Bundle,
        public world: World,
        public bundle_info: BundleInfo,
        public add_bundle: AddBundle,
        public table: Table,
        public archetype: Archetype,
        public result: InsertBundleResult,
        public change_tick: Tick
    ) {
    }

    static new(bundle: Bundle, world: World, archetype_id: ArchetypeId, change_tick: Tick) {
        const bundle_id = world.bundles().register_info(bundle, world.components(), world.storages());
        return BundleInserter.new_with_id(bundle, world, archetype_id, bundle_id, change_tick);
    }

    static new_with_id(bundle: Bundle, world: World, archetype_id: ArchetypeId, bundle_id: BundleId, change_tick: Tick) {
        const bundle_info = world.bundles().get(bundle_id)!;
        bundle_id = bundle_info.id();
        const new_archetype_id = bundle_info.__add_bundle_to_archetype(world.archetypes(), world.storages(), world.components(), archetype_id);
        if (new_archetype_id === archetype_id) {
            const archetype = world.archetypes().get(archetype_id)!;
            const add_bundle = archetype.edges().__get_add_bundle_internal(bundle_id)!;
            const table_id = archetype.table_id();
            const table = world.storages().tables.get(table_id)!;
            return new BundleInserter(
                bundle,
                world,
                bundle_info,
                add_bundle,
                table,
                archetype,
                InsertBundleResult.SameArchetype,
                change_tick
            )
        } else {
            const [archetype, new_archetype] = world.archetypes().__get_2_mut(archetype_id, new_archetype_id)
            const add_bundle = archetype.edges().__get_add_bundle_internal(bundle_id)!;
            const table_id = archetype.table_id();
            const new_table_id = new_archetype.table_id();
            if (table_id === new_table_id) {
                const table = world.storages().tables.get(table_id)!;
                return new BundleInserter(
                    bundle,
                    world,
                    bundle_info,
                    add_bundle,
                    table,
                    archetype,
                    InsertBundleResult.NewArchetypeSameTable(new_archetype),
                    change_tick
                )
            } else {
                const [table, new_table] = world.storages().tables.__get_2(table_id, new_table_id)
                return new BundleInserter(
                    bundle,
                    world,
                    bundle_info,
                    add_bundle,
                    table,
                    archetype,
                    InsertBundleResult.NewArchetypeNewTable(new_archetype, new_table),
                    change_tick
                )
            }
        }
    }

    __insert<T extends DynamicBundle>(entity: Entity, location: EntityLocation, bundle: T, insert_mode: InsertMode): EntityLocation {
        const bundle_info = this.bundle_info
        const add_bundle = this.add_bundle
        const table = this.table
        const archetype = this.archetype

        // if (insert_mode === InsertMode.Replace) {
        //     this.world.trigger_on_replace(archetype, entity, add_bundle)
        // }

        let tup: [Archetype, EntityLocation];
        if (this.result.type === 'SameArchetype') {
            const sparse_sets = this.world.storages().sparse_sets;

            bundle_info.__write_components(
                table,
                sparse_sets,
                add_bundle,
                entity,
                location.table_row,
                this.change_tick,
                bundle,
                InsertMode.Replace
            )
            tup = [archetype, location]
        } else if (this.result.type === 'NewArchetypeSameTable') {
            const { new_archetype } = this.result
            const [sparse_sets, entities] = [this.world.storages().sparse_sets, this.world.entities()]
            const result = archetype.__swap_remove(location.archetype_row);
            if (result.swapped_entity) {
                const { swapped_entity } = result
                const swapped_location = entities.get(swapped_entity)!
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            const new_location = new_archetype.__allocate(entity, result.table_row);
            entities.__set(entity.index(), new_location)

            bundle_info.__write_components(
                table,
                sparse_sets,
                add_bundle,
                entity,
                result.table_row,
                this.change_tick,
                bundle,
                InsertMode.Replace
            )

            tup = [new_archetype, new_location]

        } else if (this.result.type === 'NewArchetypeNewTable') {
            const { new_table, new_archetype } = this.result
            const [sparse_sets, entities] = [this.world.storages().sparse_sets, this.world.entities()]
            let archetype_ptr = 0;
            const result = archetype.__swap_remove(location.archetype_row)
            if (is_some(result.swapped_entity)) {
                const { swapped_entity } = result;

                const swapped_location = entities.get(swapped_entity)!;
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            const move_result = table.__move_to_superset_unchecked(result.table_row, new_table);
            const new_location = new_archetype.__allocate(entity, move_result.new_row);
            entities.__set(entity.index(), new_location);

            if (move_result.swapped_entity) {
                const { swapped_entity } = move_result
                const swapped_location = entities.get(swapped_entity)!;
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: result.table_row,
                })

                if (archetype.id() === swapped_location.archetype_id) {
                    archetype.__set_entity_table_row(swapped_location.archetype_row, result.table_row);
                } else if (new_archetype.id() === swapped_location.archetype_id) {
                    new_archetype.__set_entity_table_row(swapped_location.archetype_row, result.table_row)
                } else {
                    archetype_ptr += swapped_location.archetype_id;
                    this.world.archetypes().get(archetype_ptr)!.__set_entity_table_row(swapped_location.archetype_row, result.table_row);
                }
            }

            bundle_info.__write_components(
                new_table,
                sparse_sets,
                add_bundle,
                entity,
                move_result.new_row,
                this.change_tick,
                bundle,
                InsertMode.Replace
            )
            tup = [new_archetype, new_location]
        }
        const [new_archetype, new_location] = tup!;
        const world = this.world;
        // world.trigger_on_add(new_archetype, entity, add_bundle.iter_added());

        if (insert_mode === InsertMode.Replace) {
            // world.trigger_on_insert(new_archetype, entity, add_bundle.iter_inserted())
        } else if (insert_mode === InsertMode.Keep) {
            // world.trigger_on_insert(new_archetype, entity, add_bundle.iter_addded())
        }
        return new_location;
    }

    __entities() {
        return this.world.entities();
    }
}

export class BundleSpawner2 {
    constructor(
        public bundle: Bundle,
        public world: World,
        public bundle_info: BundleInfo,
        public table: Table,
        public archetype: Archetype,
        public change_tick: Tick) { }

    static new(bundle: Bundle, world: World, change_tick: Tick) {
        const bundle_id = world.bundles().register_info(bundle, world.components(), world.storages());
        return BundleSpawner2.new_with_id(bundle, world, bundle_id, change_tick)
    }

    static new_with_id(bundle: Bundle, world: World, bundle_id: BundleId, change_tick: Tick) {
        const bundle_info = world.bundles().get(bundle_id)!;
        const new_archetype_id = bundle_info.__add_bundle_to_archetype(
            world.archetypes(),
            world.storages(),
            world.components(),
            ArchetypeId.EMPTY
        )

        const archetype = world.archetypes().get(new_archetype_id)!;
        const table = world.storages().tables.get(archetype.table_id())!;

        return new BundleSpawner2(
            bundle,
            world,
            bundle_info,
            table,
            archetype,
            change_tick
        )
    }

    __reserve_storage(additional: number) {
        this.archetype.__reserve(additional);
        this.table.__reserve(additional);
    }

    spawn_non_existent(entity: Entity, bundle: DynamicBundle): EntityLocation {
        const bundle_info = this.bundle_info;
        const location = (() => {
            let table = this.table;
            let archetype = this.archetype;

            let sparse_sets = this.world.storages().sparse_sets, entities = this.world.entities();
            let table_row = table.__allocate(entity);
            let location = archetype.__allocate(entity, table_row);
            bundle_info.__write_components(
                table,
                sparse_sets,
                SpawnBundleStatus,
                entity,
                table_row,
                this.change_tick,
                bundle,
                InsertMode.Replace
            )

            entities.__set(entity.index(), location);
            return location;
        })()

        const archetype = this.archetype;
        // this.world.trigger_on_add(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )

        // this.world.trigger_on_insert(
        //     archetype,
        //     entity,
        //     bundle_info.iter_contributed_components()
        // )

        return location;
    }

    spawn(bundle: Bundle & DynamicBundle): Entity {
        const entity = this.__entities().__alloc();
        this.spawn_non_existent(entity, bundle);
        return entity;
    }

    __entities() {
        return this.world.entities();
    }

    __flush_commands() {
        this.world.flush();
    }
}

export class BundleSpawner {
    __archetype: Archetype;
    __entities: Entities;
    #bundle_info: BundleInfo;
    #table: Table;
    #sparse_sets: SparseSets;
    #change_tick: Tick;

    constructor(
        archetype: Archetype,
        bundle_info: BundleInfo,
        entities: Entities,
        table: Table,
        sparse_sets: SparseSets,
        change_tick: Tick,
    ) {
        this.__archetype = archetype;
        this.#bundle_info = bundle_info;
        this.__entities = entities;
        this.#table = table;
        this.#sparse_sets = sparse_sets;
        this.#change_tick = change_tick;
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
        this.#bundle_info.__write_components(
            this.#table,
            this.#sparse_sets,
            SpawnBundleStatus,
            entity,
            table_row,
            this.#change_tick,
            bundle,
            InsertMode.Replace
        )
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
    #bundle_ids: Map<string, BundleId>;
    // Cache dynamic `BundleId` with multiple components
    #dynamic_bundle_ids: Map<ComponentId[], [BundleId, Array<StorageType>]>;
    // Cache optimized dynamic `BundleId` with single component
    #dynamic_component_bundle_ids: Map<ComponentId, [BundleId, StorageType]>;
    #dynamic_component_storages: Map<BundleId, StorageType>;
    #dynamic_bundle_storages: Map<BundleId, StorageType[]>;


    constructor() {
        this.#bundle_infos = [];
        this.#bundle_ids = new Map();
        this.#dynamic_bundle_ids = new Map();
        this.#dynamic_component_bundle_ids = new Map();
        this.#dynamic_component_storages = new Map();
        this.#dynamic_bundle_storages = new Map();
    }

    static dynamic_bundle(bundle: any[]): Bundle & DynamicBundle {
        return define_bundle(bundle);
    }

    get(bundle_id: BundleId): Option<BundleInfo> {
        return this.#bundle_infos[bundle_id];
    }

    get_storage_unchecked(id: BundleId) {
        return this.#dynamic_component_storages.get(id)!;
    }


    get_storages_unchecked(id: BundleId) {
        return this.#dynamic_bundle_storages.get(id)!;
    }

    get_id(type_id: TypeId) {
        return this.#bundle_ids.get(type_id.type_id);
    }

    register_info(bundle: Bundle, components: Components, storages: Storages): BundleId {
        const bundle_infos = this.#bundle_infos;
        let id: number;
        if (this.#bundle_ids.has(bundle.type_id)) {
            id = this.#bundle_ids.get(bundle.type_id)!
        } else {
            const component_ids: number[] = [];
            bundle.component_ids(components, storages, id => component_ids.push(id))
            let _id = bundle_infos.length;
            const bundle_info = new BundleInfo(bundle.name, components, component_ids, _id)
            bundle_infos.push(bundle_info)
            this.#bundle_ids.set(bundle.type_id, _id);
            id = _id;
        }
        return id;
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