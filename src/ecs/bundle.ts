import { Option, is_some } from 'joshkaposh-option'
import { Archetype, ArchetypeId, Archetypes, BundleComponentStatus, ComponentStatus, SpawnBundleStatus } from "./archetype";
import { Component, ComponentId, Components, Tick } from "./component";
import { Entity, EntityLocation } from "./entity";
import { StorageType, Storages } from "./storage";
import { SparseSets } from "./storage/sparse-set";
import { Table, TableRow } from "./storage/table";
import { entry, is_class_ctor } from "../util";
import { ArchetypeAfterBundleInsert, ON_ADD, TypeId, World } from '.';
import { iter, Iterator } from 'joshkaposh-iterator';
import { TODO } from 'joshkaposh-iterator/src/util';
import { retain } from '../array-helpers';
import { Ord } from 'joshkaposh-index-map/src/util';

export type BundleId = number;

export type Bundle<F = Component> = {
    readonly hash: string;
    readonly name: string;
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

function ComponentBundle(type: Component | InstanceType<Component>): Bundle {
    // @ts-expect-error
    return {
        component_ids(components, storages, ids) {
            const ty = type.type_id ? type : type.constructor;
            ids(components.init_component(ty, storages));
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
    return ids.join(' ');
}

// TODO: compare precompute hash and get bundle if it exists, or create a new one if one does not exist.
export function define_bundle(bundle: any[], world: World): Bundle & DynamicBundle {
    const bundles: (Bundle & DynamicBundle)[] = [];

    const ids: ComponentId[] = [];
    function rec(b: any[]) {
        b.forEach(c => {
            if (Array.isArray(c)) {
                rec(c)
            }

            bundles.push(BundleFromComponent(c));

            c = is_class_ctor(c) ? c : c.constructor;
            const component_id = world.register_component(c as any);
            ids.push(component_id);
        })
    }
    rec(bundle);
    const hash = bundle_hash(ids);
    const name = hash;

    const bun: Bundle & DynamicBundle = {
        hash: hash,
        name: name,
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

export class BundleInfo {
    #id: BundleId;
    #component_ids: ComponentId[];
    #required_component_ids: ComponentId[];
    #explicit_components_len: number;

    //! SAFETY: Every ID in this list must be valid within the World that owns the BundleInfo,
    // must have its storage initialized (i.e. columns created in tables, sparse set created),
    // and must be in the same order as the source bundle type writes its components in.
    constructor(
        bundle_type_name: string,
        components: Components,
        component_ids: ComponentId[],
        id: BundleId
    ) {
        const deduped = [...new Set(component_ids)].sort();
        if (deduped.length !== component_ids.length) {
            const seen = new Set();
            const dups = [];
            for (const id of component_ids) {
                if (!seen.has(id)) {
                    seen.add(id);
                    dups.push(id)
                }
            }

            const names = dups.map(id => components.get_info(id)!.name()).join(', ');
            throw new Error(`Bundle ${bundle_type_name} has duplicate components: ${names}`)
        }

        this.#id = id;
        this.#component_ids = component_ids;
        this.#required_component_ids = [];
        this.#explicit_components_len = component_ids.length;
    }

    id() {
        return this.#id;
    }

    components(): ComponentId[] {
        return this.#component_ids;
    }

    contributed_components() {
        return this.#component_ids;
    }

    write_components<T extends DynamicBundle>(
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
                const status = bundle_component_status.get_status(bundle_component);
                const column = table.get_column(component_id)!;
                if (ComponentStatus.Added === status) {
                    column.__initialize(
                        table_row,
                        component_ptr,
                        change_tick
                    );
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Replace) {
                    column.__replace(
                        table_row,
                        component_ptr,
                        change_tick
                    );
                } else if (ComponentStatus.Existing === status && insert_mode === InsertMode.Keep) {
                    TODO('BundleInfo write_components() table.get_drop_for does not exist')
                    // @ts-expect-error
                    const drop_fn = table.get_drop_for(component_id);
                    if (drop_fn) {
                        drop_fn(component_ptr);
                    }

                }
            } else if (storage_type === StorageType.SparseSet) {
                const sparse_set = sparse_sets.get(component_id)!;
                // @ts-expect-error
                sparse_set.__insert(
                    entity,
                    component_ptr,
                    change_tick
                );
            }

            bundle_component += 1;
        })
    }


    insert_bundle_into_archetype(
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        archetype_id: ArchetypeId
    ): ArchetypeId {
        const archetype_after_insert_id = archetypes.get(archetype_id)
            ?.edges()
            ?.get_archetype_after_bundle_insert(this.#id);
        if (is_some(archetype_after_insert_id)) {
            return archetype_after_insert_id
        }

        const new_table_components = [];
        const new_sparse_set_components = [];
        const bundle_status: ComponentStatus[] = [];
        const added_required_components: ComponentId[] = [];
        const added = [];
        const existing = [];

        const current_archetype = archetypes.get(archetype_id)!;
        for (const component_id of this.iter_explicit_components()) {
            if (current_archetype.contains(component_id)) {
                bundle_status.push(ComponentStatus.Existing);
                existing.push(component_id)
            } else {
                bundle_status.push(ComponentStatus.Added)
                added.push(component_id);
                const component_info = components.get_info(component_id)!;
                if (StorageType.Table === component_info.storage_type()) {
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
        //         const component_info = components.get_info(component_id)!;
        //         if (component_info.storage_type() === StorageType.Table) {
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
                table_id = current_archetype.table_id();
                table_components = current_archetype.table_components().collect();
            } else {
                new_table_components.push(...current_archetype.table_components());
                new_table_components.sort();
                table_id = storages.tables.__get_id_or_insert(new_table_components, components);
                table_components = new_table_components;
            }

            if (new_sparse_set_components.length === 0) {
                sparse_set_components = current_archetype.sparse_set_components().collect();
            } else {
                new_sparse_set_components.push(...current_archetype.sparse_set_components());
                new_sparse_set_components.sort();
                sparse_set_components = new_sparse_set_components;
            }

            const new_archetype_id = archetypes.get_id_or_insert(
                components,
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

    remove_bundle_from_archetype(
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
        if (is_some(archetype_after_remove_result)) {
            result = archetype_after_remove_result
        } else {
            let next_table_components, next_sparse_set_components, next_table_id;

            const current_archetype = archetypes.get(archetype_id)!;

            const removed_table_components = []
            const removed_sparse_set_components = []

            for (const component_id of this.iter_explicit_components()) {
                if (current_archetype.contains(component_id)) {
                    const component_info = components.get_info(component_id)!;
                    if (component_info.storage_type() === StorageType.Table) {
                        removed_table_components.push(component_id)
                    } else {
                        removed_sparse_set_components.push(component_id)
                    }
                } else if (!intersection) {
                    current_archetype.edges().cache_archetype_after_bundle_remove(this.#id, null);
                    return
                }
            }

            removed_table_components.sort();
            removed_sparse_set_components.sort();
            next_table_components = current_archetype.table_components().collect();
            next_sparse_set_components = current_archetype.sparse_set_components().collect();

            sorted_remove(next_table_components, removed_table_components);
            sorted_remove(next_sparse_set_components, removed_sparse_set_components);

            next_table_id = removed_table_components.length === 0 ?
                current_archetype.table_id() :
                storages.tables.__get_id_or_insert(next_table_components, components)

            const new_archetype_id = archetypes.get_id_or_insert(
                components,
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

    iter_components() {
        return iter(this.#component_ids);
    }

    iter_required_components(): Iterator<ComponentId> {
        return iter([])
    }

    iter_explicit_components() {
        return this.iter_components()
    }

    iter_contributed_components() {
        return iter(this.#component_ids);
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
        const bundle_id = world.bundles().register_info(bundle, world.components(), world.storages());
        return BundleInserter.new_with_id(world, archetype_id, bundle_id, change_tick)
    }

    static new_with_id(world: World, archetype_id: ArchetypeId, bundle_id: BundleId, change_tick: Tick) {
        const bundle_info = world.bundles().get(bundle_id)!;
        bundle_id = bundle_info.id();
        const new_archetype_id = bundle_info.insert_bundle_into_archetype(
            world.archetypes(),
            world.storages(),
            world.components(),
            archetype_id
        )

        if (new_archetype_id === archetype_id) {
            const archetype = world.archetypes().get(archetype_id)!;
            const archetype_after_insert = archetype.edges().get_archetype_after_bundle_insert_internal(bundle_id)!;
            const table_id = archetype.table_id();
            const table = world.storages().tables.get(table_id)!;
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

            const [archetype, new_archetype] = world.archetypes().__get_2_mut(archetype_id, new_archetype_id);
            const archetype_after_insert = archetype
                .edges()
                .get_archetype_after_bundle_insert_internal(bundle_id)!;


            const table_id = archetype.table_id();
            const new_table_id = new_archetype.table_id();

            if (table_id === new_table_id) {
                const table = world.storages().tables.get(table_id)!;
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
                const [table, new_table] = world.storages().tables.get_2(table_id, new_table_id);

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

        let new_archetype, new_location;
        if (this.#archetype_move_type === ArchetypeMoveType.SameArchetype) {
            const sparse_sets = this.#world.storages().sparse_sets
            bundle_info.write_components(
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
        } else if (('new_archetype' in this.#archetype_move_type) && !('new_table' in this.#archetype_move_type)) {
            // NewArchetypeSameTable
            const new_archetype_ = this.#archetype_move_type.new_archetype;
            const sparse_sets = this.#world.storages().sparse_sets;
            const entities = this.#world.entities();

            // @ts-expect-error
            const result = archetype.__swap_remove(location.archetype_row);
            if (result.swapped_entity) {
                const { swapped_entity } = result
                const swapped_location = entities.get(swapped_entity)!;

                // @ts-expect-error
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }
            // @ts-expect-error
            const new_location_ = new_archetype_.__allocate(entity, result.table_row);
            // @ts-expect-error
            entities.__set(entity.index(), new_location_);
            bundle_info.write_components(
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
            const { new_archetype: new_archetype_, new_table } = this.#archetype_move_type
            const archetypes_ptr = this.#world.archetypes().inner;
            const entities = this.#world.entities();
            const sparse_sets = this.#world.storages().sparse_sets;
            // @ts-expect-error
            const result = archetype.__swap_remove(location.archetype_row);
            if (result.swapped_entity) {
                const { swapped_entity } = result
                const swapped_location = entities.get(swapped_entity)!;
                // @ts-expect-error
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: swapped_location.table_row
                })
            }

            // @ts-expect-error
            const move_result = table.__move_to_superset_unchecked(result.table_row, new_table);
            // @ts-expect-error
            const new_location_ = new_archetype_.__allocate(entity, move_result.new_row);
            // @ts-expect-error
            entities.__set(entity.index(), new_location_);

            if (move_result.swapped_entity) {
                const { swapped_entity } = move_result
                const swapped_location = entities.get(swapped_entity)!;

                // @ts-expect-error
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: result.table_row
                })

                if (archetype.id() === swapped_location.archetype_id) {
                    archetype.set_entity_table_row(swapped_location.archetype_row, result.table_row)
                } else if (new_archetype_.id() === swapped_location.archetype_id) {
                    new_archetype_.set_entity_table_row(swapped_location.archetype_row, result.table_row)
                } else {
                    archetypes_ptr[swapped_location.archetype_id].set_entity_table_row(swapped_location.archetype_row, result.table_row);
                }
            }

            bundle_info.write_components(
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

        this.#world.trigger_on_add(
            new_archetype,
            entity,
            archetype_after_insert
        )

        if (new_archetype.has_add_observer()) {
            this.#world.trigger_observers(
                ON_ADD,
                entity,
                archetype_after_insert.iter_added()
            )
        }

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
        return this.#world.entities();
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
        const bundle_id = world.bundles().register_info(bundle, world.components(), world.storages());

        return BundleSpawner.new_with_id(world, bundle_id, change_tick)
    }

    static new_with_id(
        world: World,
        bundle_id: BundleId,
        change_tick: Tick
    ) {
        const bundle_info = world.bundles().get(bundle_id)!;
        const new_archetype_id = bundle_info.insert_bundle_into_archetype(
            world.archetypes(),
            world.storages(),
            world.components(),
            ArchetypeId.EMPTY
        )
        const archetype = world.archetypes().get(new_archetype_id)!;
        const table = world.storages().tables.get(archetype.table_id())!;

        return new BundleSpawner(
            world,
            bundle_info,
            table,
            archetype,
            change_tick
        )
    }

    spawn_non_existent(entity: Entity, bundle: DynamicBundle): EntityLocation {
        const bundle_info = this.#bundle_info;

        let location;
        const table = this.#table;
        const archetype = this.#archetype;
        const sparse_sets = this.#world.storages().sparse_sets
        const entities = this.#world.entities();

        // @ts-expect-error
        const table_row = table.__allocate(entity);
        // @ts-expect-error
        location = archetype.__allocate(entity, table_row);

        bundle_info.write_components(
            table,
            sparse_sets,
            SpawnBundleStatus,
            entity,
            table_row,
            this.#change_tick,
            bundle,
            InsertMode.Replace
        )

        // @ts-expect-error
        entities.__set(entity.index(), location);

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

    spawn(bundle: Bundle & DynamicBundle): Entity {
        const entity = this.entities().alloc();
        this.spawn_non_existent(entity, bundle);
        return entity;
    }

    reserve_storage(additional: number) {
        // @ts-expect-error
        this.#archetype.__reserve(additional);
        // @ts-expect-error
        this.#table.__reserve(additional);
    }

    entities() {
        return this.#world.entities();
    }

    flush_commands() {
        this.#world.flush();
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

    static dynamic_bundle(bundle: any[], world: World): Bundle & DynamicBundle {
        return define_bundle(bundle, world);
    }

    get(bundle_id: BundleId): Option<BundleInfo> {
        return this.#bundle_infos[bundle_id];
    }

    get_id(type_id: TypeId) {
        return this.#bundle_ids.get(type_id.type_id);
    }

    register_info(bundle: Bundle, components: Components, storages: Storages): BundleId {
        const bundle_infos = this.#bundle_infos;
        let id: number;


        if (this.#bundle_ids.has(bundle.hash)) {
            id = this.#bundle_ids.get(bundle.hash)!
        } else {
            const component_ids: number[] = [];
            bundle.component_ids(components, storages, id => component_ids.push(id))
            let _id = bundle_infos.length;
            const bundle_info = new BundleInfo(bundle.name, components, component_ids, _id)
            bundle_infos.push(bundle_info)
            this.#bundle_ids.set(bundle.hash, _id);
            id = _id;
        }
        return id;
    }

    get_storage_unchecked(id: BundleId) {
        return this.#dynamic_component_storages.get(id)!;
    }

    set_storage_unchecked(id: BundleId, storage_type: StorageType) {
        this.#dynamic_component_storages.set(id, storage_type)
    }

    get_storages_unchecked(id: BundleId) {
        return this.#dynamic_bundle_storages.get(id)!;
    }

    set_storages_unchecked(id: BundleId, storage_types: StorageType[]) {
        this.#dynamic_bundle_storages.set(id, storage_types);
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
    __init_dynamic_info(components: Components, component_ids: ComponentId[]): BundleId {
        const bundle_infos = this.#bundle_infos;
        const bundle_id = entry(this.#dynamic_bundle_ids, bundle_hash(component_ids), () => {
            const [id, storages] = initialize_dynamic_bundle(bundle_infos, components, component_ids)
            this.#dynamic_bundle_storages.set(id, storages)
            return id;
        })
        return bundle_id;
    }

    /**
     * @description Initializes a new `BundleInfo` for a dynamic `Bundle` with single component.
     * @throws If the provided `ComponentId` does not exist in the provided `Components`.
     * @returns A tuple [BundleInfo, StorageType].
    */
    __init_component_info(components: Components, component_id: ComponentId): BundleId {
        const bundle_infos = this.#bundle_infos;
        return entry(this.#dynamic_component_bundle_ids, component_id, () => {
            const [id, storage_type] = initialize_dynamic_bundle(bundle_infos, components, [component_id])
            this.#dynamic_component_storages.set(id, storage_type[0])
            return id;
        })
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

function sorted_remove<T extends Ord>(source: T[], remove: T[]) {
    let remove_index = 0;
    retain(source, (value) => {
        while (remove_index < remove.length && value > remove[remove_index]) {
            remove_index += 1;
        }

        if (remove_index < remove.length) {
            return value !== remove[remove_index];
        } else {
            return true;
        }
    })
}