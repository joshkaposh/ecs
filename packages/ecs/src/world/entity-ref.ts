import { iter, Iterator } from "joshkaposh-iterator";
import { type Option, is_some, ErrorExt } from "joshkaposh-option";
import { StorageType, Storages } from "../storage";
import { type Component } from "../component";
import { ON_REMOVE, ON_REPLACE, World } from "./world";
import { Entities, Entity, EntityLocation } from "../entity";
import { BundleId, BundleInfo, BundleInserter, Bundles, InsertMode, type Bundle, type DynamicBundle } from "../bundle";
import { Archetype, ArchetypeId, Archetypes, ComponentId, Components, ComponentTicks, RemapToInstance } from "..";
import { unsafe_entity_cell_components, unsafe_entity_cell_get, unsafe_entity_cell_get_change_ticks, unsafe_entity_cell_get_components, unsafe_entity_cell_get_ref, unsafe_entity_cell_archetype, UnsafeEntityCell, unsafe_entity_cell_get_by_id, unsafe_entity_cell_contains_type_id, unsafe_entity_cell_get_change_ticks_by_id, unsafe_entity_cell_get_mut, unsafe_entity_cell_get_mut_by_id, unsafe_entity_cell_contains_id } from "./unsafe-world-cell";
// import { RemovedComponentEvents } from "./removal-detection";
import { RemovedComponentEvents } from '../removal-detection'
import { Enum } from "../util";
import { Ref } from "../change_detection";

export class EntityRef {
    #world: World;
    #entity: Entity;
    #location: EntityLocation;

    constructor(cell: UnsafeEntityCell) {
        this.#entity = cell.id();
        this.#location = cell.location();
        this.#world = cell.world();
    }

    id(): Entity {
        return this.#entity
    }

    location(): EntityLocation {
        return this.#location;
    }

    archetype(): Archetype {
        return unsafe_entity_cell_archetype(this.#world, this.#location);
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId) {
        return unsafe_entity_cell_contains_id(this.#world, this.#location, component_id);
    }


    contains_type_id(type_id: UUID): boolean {
        return unsafe_entity_cell_contains_type_id(this.#world, this.#location, type_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return unsafe_entity_cell_get(this.#world, this.#entity, this.#location, component)
    }

    get_ref<T extends Component>(component: T) {
        return unsafe_entity_cell_get_ref(this.#world, this.#entity, this.#location, component);
    }

    get_change_ticks(component: Component): Option<ComponentTicks> {
        return unsafe_entity_cell_get_change_ticks(this.#world, this.#entity, this.#location, component)
    }

    get_change_ticks_by_id(component_id: ComponentId): Option<ComponentTicks> {
        return unsafe_entity_cell_get_change_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    get_by_id<T extends Component>(component_id: ComponentId): Option<InstanceType<T>> {
        return unsafe_entity_cell_get_by_id(this.#world, this.#entity, this.#location, component_id)
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Throws an error if the entity does not have the components required by the query
     */
    components<Q extends readonly any[]>(query: Q): RemapToInstance<Q> {
        return unsafe_entity_cell_components(this.#world, this.#entity, this.#location, query);
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Returns None if the entity does not have the components required by the query.
     */
    get_components<Q extends readonly any[]>(query: Q): Option<RemapToInstance<Q>> {
        return unsafe_entity_cell_get_components(this.#world, this.#entity, this.#location, query);
    }
}


export class EntityMut {
    #world: World;
    #entity: Entity;
    #location: EntityLocation;

    constructor(world: World, entity: Entity, location: EntityLocation) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    static from(value: EntityWorldMut) {
        // @ts-expect-error
        return new EntityMut(value.__as_unsafe_entity_cell());
    }

    as_readonly(): EntityRef {
        return new EntityRef(new UnsafeEntityCell(this.#world, this.#entity, this.#location));
    }

    id(): Entity {
        return this.#entity;
    }

    location(): EntityLocation {
        return this.#location;
    }

    archetype(): Archetype {
        return unsafe_entity_cell_archetype(this.#world, this.#location);
    }

    contains(type: Component): boolean {
        return unsafe_entity_cell_contains_type_id(this.#world, this.#location, type.type_id);
    }

    contains_id(component_id: ComponentId): boolean {
        return unsafe_entity_cell_contains_id(this.#world, this.#location, component_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return unsafe_entity_cell_get(this.#world, this.#entity, this.#location, component);
    }

    components<Q extends readonly any[]>(query: Q): RemapToInstance<Q> {
        const components = this.get_components(query);
        if (!components) throw new Error('Query Mismatch Error');
        return components;
    }

    get_components<const Q extends readonly any[]>(query: Q) {
        return unsafe_entity_cell_get_components(this.#world, this.#entity, this.#location, query);
    }

    get_ref<T extends Component>(component: T): Option<Ref<InstanceType<T>>> {
        return unsafe_entity_cell_get_ref(this.#world, this.#entity, this.#location, component);
    }

    get_mut<T extends Component>(component: T): Option<InstanceType<T>> {
        return unsafe_entity_cell_get_mut(this.#world, this.#entity, this.#location, component);
    }

    get_change_ticks(component: Component): Option<ComponentTicks> {
        return unsafe_entity_cell_get_change_ticks(this.#world, this.#entity, this.#location, component);
    }

    get_change_ticks_by_id(component_id: ComponentId) {
        return unsafe_entity_cell_get_change_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    contains_type_id(type_id: UUID): boolean {
        return unsafe_entity_cell_contains_type_id(this.#world, this.#location, type_id);
    }

    get_by_id<T extends Component>(component_id: ComponentId): Option<InstanceType<T>> {
        return unsafe_entity_cell_get_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    get_mut_by_id<T extends Component>(component_id: ComponentId): Option<InstanceType<T>> {
        return unsafe_entity_cell_get_mut_by_id(this.#world, this.#entity, this.#location, component_id);
    }
}

export class EntityWorldMut {
    #world: World
    #entity: Entity;
    #location: EntityLocation;

    constructor(world: World, entity: Entity, location: EntityLocation) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    static #move_entity_from_remove(
        DROP: boolean,
        entity: Entity,
        self_location: EntityLocation,
        old_archetype_id: ArchetypeId,
        old_location: EntityLocation,
        entities: Entities,
        archetypes: Archetypes,
        storages: Storages,
        new_archetype_id: ArchetypeId

    ) {
        const old_archetype = archetypes.get(old_archetype_id)!;
        // @ts-expect-error
        const remove_result = old_archetype.__swap_remove(old_location.archetype_row);
        if (remove_result.swapped_entity) {
            const { swapped_entity } = remove_result;
            const swapped_location = entities.get(swapped_entity)!;

            // @ts-expect-error
            entities.__set(swapped_entity.index(), {
                archetype_id: swapped_location.archetype_id,
                archetype_row: old_location.archetype_row,
                table_id: swapped_location.table_id,
                table_row: swapped_location.table_row
            })
        }
        const old_table_row = remove_result.table_row;
        const old_table_id = old_archetype.table_id();
        const new_archetype = archetypes.get(new_archetype_id)!;

        let new_location: EntityLocation;
        if (old_table_id === new_archetype.table_id()) {
            // @ts-expect-error
            new_location = new_archetype.__allocate(entity, old_table_row);
        } else {
            const [old_table, new_table] = storages.tables.get_2(old_table_id, new_archetype.table_id())
            const move_result = DROP ?
                // @ts-expect-error
                old_table.__move_to_and_drop_missing_unchecked(old_table_row, new_table) :
                // @ts-expect-error
                old_table.__move_to_and_forget_missing_unchecked(old_table_row, new_table);

            // @ts-expect-error
            const new_loc = new_archetype.__allocate(entity, move_result.new_row);

            if (move_result.swapped_entity) {
                const { swapped_entity } = move_result
                const swapped_location = entities.get(swapped_entity)!;
                // @ts-expect-error
                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: old_location.table_row
                })

                archetypes.get(swapped_location.archetype_id)!.set_entity_table_row(swapped_location.archetype_row, old_table_row);
            }
            new_location = new_loc;
        }

        self_location.archetype_id = new_location.archetype_id;
        self_location.archetype_row = new_location.archetype_row;
        self_location.table_id = new_location.table_id;
        self_location.table_row = new_location.table_row;

        // @ts-expect-error
        entities.__set(entity.index(), new_location);
    }

    #error_despawned() {
        throw new Error(`Entity ${this.#entity} does not exist`)
    }

    #assert_not_despawned() {
        if (this.#location.archetype_id === ArchetypeId.INVALID) {
            this.#error_despawned();
        }
    }

    private __as_unsafe_entity_cell(): UnsafeEntityCell {
        this.#assert_not_despawned();
        return new UnsafeEntityCell(this.#world, this.#entity, this.#location);
    }

    id(): Entity {
        return this.#entity;
    }

    location(): EntityLocation {
        this.#assert_not_despawned();
        return this.#location;
    }

    archetype(): Archetype {
        this.#assert_not_despawned();
        return this.#world.archetypes().get(this.#location.archetype_id)!;
    }

    contains(component: Component): boolean {
        return unsafe_entity_cell_contains_type_id(this.#world, this.#location, component.type_id);

    }

    contains_id(component_id: ComponentId) {
        return unsafe_entity_cell_contains_id(this.#world, this.#location, component_id)
    }

    contains_type_id(type_id: UUID) {
        return unsafe_entity_cell_contains_type_id(this.#world, this.#location, type_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return unsafe_entity_cell_get(this.#world, this.#entity, this.#location, component)
    }

    components<Q extends readonly any[]>(query: Q) {
        return unsafe_entity_cell_get_components(this.#world, this.#entity, this.#location, query);
    }

    get_components<Q extends readonly any[]>(query: Q) {
        return unsafe_entity_cell_get_components(this.#world, this.#entity, this.#location, query);
    }

    get_ref<T extends Component>(component: T) {
        return unsafe_entity_cell_get_ref(this.#world, this.#entity, this.#location, component);
    }

    get_mut<T extends Component>(component: T) {
        return unsafe_entity_cell_get_mut(this.#world, this.#entity, this.#location, component);
    }

    get_change_ticks(component: Component) {
        return unsafe_entity_cell_get_change_ticks(this.#world, this.#entity, this.#location, component);
    }

    get_change_ticks_by_id(component_id: ComponentId) {
        return unsafe_entity_cell_get_change_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return unsafe_entity_cell_get_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    get_mut_by_id(component_id: ComponentId) {
        return unsafe_entity_cell_get_mut_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    /**
     * Adds a [`Bundle`] of components to the entity.
     * 
     * This will overwrite any previous value(s) of the same component type.
     */
    insert(bundle: InstanceType<Component>[] | (Bundle & DynamicBundle)) {
        return this.insert_with_caller(
            bundle,
            InsertMode.Replace
        )
    }

    insert_if_new(bundle: InstanceType<Component>[] | (Bundle & DynamicBundle)) {
        return this.insert_with_caller(
            bundle,
            InsertMode.Keep
        )
    }

    insert_with_caller(bundle: InstanceType<Component>[] | (Bundle & DynamicBundle), mode: InsertMode) {
        this.#assert_not_despawned();
        if (Array.isArray(bundle)) {
            bundle = Bundles.dynamic_bundle(bundle, this.#world);
        }
        const change_tick = this.#world.change_tick();
        const bundle_inserter = BundleInserter.new(bundle, this.#world, this.#location.archetype_id, change_tick)
        this.#location = bundle_inserter.insert(this.#entity, this.#location, bundle, mode)
        this.#world.flush();
        this.update_location();
        return this;
    }

    /// Inserts a dynamic [`Component`] into the entity.
    ///
    /// This will overwrite any previous value(s) of the same component type.
    ///
    /// You should prefer to use the typed API [`EntityWorldMut::insert`] where possible.
    ///
    /// # Safety
    ///
    /// - [`ComponentId`] must be from the same world as [`EntityWorldMut`]
    /// - [`OwningPtr`] must be a valid reference to the type represented by [`ComponentId`]
    insert_by_id(component_id: ComponentId, component: InstanceType<Component>) {

        this.#assert_not_despawned();
        const world = this.#world;
        const change_tick = world.change_tick();
        const bundle_id = world.bundles().__init_component_info(world.components(), world.storages(), component_id)
        const storage_type = world.bundles().get_storage_unchecked(bundle_id);

        const bundle_inserter = BundleInserter.new_with_id(
            world,
            this.#location.archetype_id,
            bundle_id,
            change_tick
        );

        this.#location = insert_dynamic_bundle(
            bundle_inserter,
            this.#entity,
            this.#location,
            iter([component]),
            iter([storage_type])
        )
        world.flush();
        this.update_location();
        return this;
    }

    /// Inserts a dynamic [`Bundle`] into the entity.
    ///
    /// This will overwrite any previous value(s) of the same component type.
    ///
    /// You should prefer to use the typed API [`EntityWorldMut::insert`] where possible.
    /// If your [`Bundle`] only has one component, use the cached API [`EntityWorldMut::insert_by_id`].
    ///
    /// If possible, pass a sorted slice of `ComponentId` to maximize caching potential.
    ///
    /// # Safety
    /// - Each [`ComponentId`] must be from the same world as [`EntityWorldMut`]
    /// - Each [`OwningPtr`] must be a valid reference to the type represented by [`ComponentId`]
    insert_by_ids(component_ids: ComponentId[], iter_components: InstanceType<Component>[]) {
        this.#assert_not_despawned();
        const world = this.#world;
        const change_tick = world.change_tick();
        const bundle_id = world.bundles().__init_dynamic_info(world.components(), world.storages(), component_ids);

        const storage_types = world.bundles().get_storages_unchecked(bundle_id);
        world.bundles().set_storages_unchecked(bundle_id, []);

        const bundle_inserter = BundleInserter.new_with_id(
            world,
            this.#location.archetype_id,
            bundle_id,
            change_tick
        )
        this.#location = insert_dynamic_bundle(
            bundle_inserter,
            this.#entity,
            this.#location,
            iter(iter_components),
            iter(storage_types),
        )

        world.bundles().set_storages_unchecked(bundle_id, storage_types);
        world.flush();
        this.update_location();
        return this;
    }

    take(bundle: Bundle & DynamicBundle) {
        this.#assert_not_despawned();
        const world = this.#world;
        let archetypes = world.archetypes();
        let storages = world.storages();
        let components = world.components();
        const bundle_id = world.bundles().register_info(bundle, components, storages);
        const bundle_info = world.bundles().get(bundle_id)!;
        const old_location = this.#location;

        const new_archetype_id = bundle_info.remove_bundle_from_archetype(
            world.archetypes(),
            storages,
            components,
            old_location.archetype_id,
            false
        )!

        if (new_archetype_id === old_location.archetype_id) {
            return
        }
        const old_archetype = archetypes.get(old_location.archetype_id)!;

        trigger_on_replace_and_on_remove_hooks_and_observers(
            world,
            old_archetype,
            this.#entity,
            bundle_info
        )

        archetypes = world.archetypes();
        storages = world.storages();
        components = world.components();
        const entities = world.entities();
        const removed_components = world.removed_components();

        const entity = this.#entity;
        const bundle_components = bundle_info.iter_explicit_components();


        const result = bundle.from_components(storages, (ptr) => {
            const component_id = bundle_components.next().value;
            return take_component(ptr,
                components,
                removed_components,
                component_id,
                entity,
                old_location
            ) as any
        })

        EntityWorldMut.#move_entity_from_remove(
            false,
            entity,
            this.#location,
            old_location.archetype_id,
            old_location,
            entities,
            archetypes,
            storages,
            new_archetype_id
        )

        world.flush();
        this.update_location();
        return result;
    }

    #remove_bundle(bundle: BundleId) {
        const entity = this.#entity;
        const world = this.#world;
        const location = this.#location;

        const bundle_info = world.bundles().get(bundle)!;

        const new_archetype_id = bundle_info.remove_bundle_from_archetype(
            world.archetypes(),
            world.storages(),
            world.components(),
            location.archetype_id,
            true
        )
        if (!is_some(new_archetype_id)) throw new Error('Intersections should always return a result')

        if (new_archetype_id === location.archetype_id) {
            return location;
        }

        const old_archetype = world.archetypes().get(location.archetype_id)!;

        trigger_on_replace_and_on_remove_hooks_and_observers(
            world,
            old_archetype,
            entity,
            bundle_info
        )

        for (const component_id of bundle_info.iter_components()) {
            if (old_archetype.contains(component_id)) {
                world.removed_components().send(component_id, entity)
            }

            if (old_archetype.get_storage_type(component_id) === StorageType.SparseSet) {
                // @ts-expect-error
                world.storages().sparse_sets.get(component_id)!.__remove(entity);
            }
        }

        const new_location = location;
        EntityWorldMut.#move_entity_from_remove(
            true,
            entity,
            new_location,
            location.archetype_id,
            location,
            world.entities(),
            world.archetypes(),
            world.storages(),
            new_archetype_id
        )
        return new_location
    }

    remove(bundle: InstanceType<Component>[]): this {
        this.#assert_not_despawned()
        const storages = this.#world.storages();
        const components = this.#world.components();
        const bundle_id = this.#world.bundles().register_info(Bundles.dynamic_bundle(bundle, this.#world), components, storages);
        this.#location = this.#remove_bundle(bundle_id);
        this.#world.flush();
        this.update_location();
        return this
    }

    retain(bundle: Bundle): this {
        const world = this.#world;
        const archetypes = world.archetypes();
        const storages = world.storages();
        const components = world.components();

        const retained_bundle = world.bundles().register_info(bundle, components, storages)
        const retained_bundle_info = world.bundles().get(retained_bundle)!;

        const old_location = this.#location;
        const old_archetype = archetypes.get(old_location.archetype_id)!;

        const to_remove = old_archetype
            .components()
            .filter(c => !retained_bundle_info.contributed_components().includes(c))
            .collect();

        const remove_bundle = world.bundles().__init_dynamic_info(components, world.storages(), to_remove)

        this.#location = this.#remove_bundle(remove_bundle);
        world.flush();
        this.update_location();
        return this
    }

    remove_by_id(component_id: ComponentId) {
        this.#assert_not_despawned();
        const world = this.#world;
        const components = world.components();
        const bundle_id = world.bundles().__init_component_info(components, world.storages(), component_id)
        this.#location = this.#remove_bundle(bundle_id)
        world.flush();
        this.update_location();
        return this
    }

    remove_by_ids(component_ids: ComponentId[]) {
        this.#assert_not_despawned();
        const world = this.#world;
        const components = world.components();
        const bundle_id = world.bundles().__init_dynamic_info(components, world.storages(), component_ids)
        this.#remove_bundle(bundle_id);

        world.flush();
        this.update_location();
        return this;
    }

    clear() {
        this.#assert_not_despawned();
        const component_ids = this.archetype().components().collect();
        const world = this.#world;
        const components = world.components();
        const bundle_id = world.bundles().__init_dynamic_info(components, world.storages(), component_ids)

        this.#location = this.#remove_bundle(bundle_id);
        world.flush();
        this.update_location();
        return this;
    }

    despawn() {
        this.#assert_not_despawned();
        const world = this.#world;
        let archetype = world.archetypes().get(this.#location.archetype_id)!;

        if (archetype.has_replace_observer()) {
            world.trigger_observers(ON_REPLACE, this.#entity, archetype.components())
        }
        world.trigger_on_replace(archetype, this.#entity, archetype.components())
        if (archetype.has_remove_observer()) {
            world.trigger_observers(ON_REMOVE, this.#entity, archetype.components())
        }
        world.trigger_on_remove(archetype, this.#entity, archetype.components())

        for (const component_id of archetype.components()) {
            world.removed_components().send(component_id, this.#entity)
        }

        world.__flush_entities();
        const location = world.entities().free(this.#entity);
        if (!location) throw new Error('Entity should exist at this point')

        let table_row, moved_entity;

        archetype = world.archetypes().get(this.#location.archetype_id)!;
        // @ts-expect-error
        const remove_result = archetype.__swap_remove(location.archetype_row);
        if (remove_result.swapped_entity) {
            const { swapped_entity } = remove_result
            const swapped_location = world.entities().get(swapped_entity)!;
            // @ts-expect-error
            world.entities().__set(swapped_entity.index(), {
                archetype_id: swapped_location.archetype_id,
                archetype_row: location.archetype_row,
                table_id: swapped_location.table_id,
                table_row: swapped_location.table_row
            })
        }
        table_row = remove_result.table_row;

        for (const component_id of archetype.sparse_set_components()) {
            const sparse_set = world.storages().sparse_sets.get(component_id)!;
            // @ts-expect-error
            sparse_set.__remove(this.#entity);
        }


        moved_entity = world
            .storages()
            .tables
            .get(archetype.table_id())!
            // @ts-expect-error
            .__swap_remove_unchecked(table_row);

        if (moved_entity) {
            const moved_location = world.entities().get(moved_entity)!;
            // @ts-expect-error
            world.entities().__set(moved_entity.index(), {
                archetype_id: moved_location.archetype_id,
                archetype_row: moved_location.archetype_row,
                table_id: moved_location.table_id,
                table_row: table_row
            })

            world.archetypes().get(moved_location.archetype_id)!
                .set_entity_table_row(moved_location.archetype_row, table_row);
        }
        world.flush();
        this.update_location();
    }

    flush() {
        this.#world.flush();
        return this.#entity;
    }

    world() {
        return this.#world;
    }

    update_location() {
        this.#location = this.#world.entities().get(this.#entity) ?? EntityLocation.INVALID;
    }

    is_despawned() {
        return this.#location.archetype_id === ArchetypeId.INVALID;
    }
}

function trigger_on_replace_and_on_remove_hooks_and_observers(world: World, archetype: Archetype, entity: Entity, bundle_info: BundleInfo) {
    if (archetype.has_replace_observer()) {
        world.trigger_observers(ON_REPLACE, entity, bundle_info.iter_components());
    }

    world.trigger_on_replace(archetype, entity, bundle_info.iter_components())

    if (archetype.has_remove_observer()) {
        world.trigger_observers(ON_REMOVE, entity, bundle_info.iter_components());
    }

    world.trigger_on_remove(archetype, entity, bundle_info.iter_components())


}

export type TryFromFilteredError = Enum<typeof TryFromFilteredError>;
export const TryFromFilteredError = {
    get MissingReadAllAccess() {
        return new ErrorExt<0>(0, 'Conversion failed, filtered entity ref does not have read access to all components')
    },
    get MissingWriteAllAccess() {
        return new ErrorExt<1>(1, 'Conversion failed, filtered entity ref does not have write access to all components')
    }
} as const;

function insert_dynamic_bundle(
    bundle_inserter: BundleInserter,
    entity: Entity,
    location: EntityLocation,
    components: Iterator<InstanceType<Component>>,
    storage_types: Iterator<StorageType>
) {
    // class DynamicInsertBundle implements DynamicBundle {

    //     #components: Iterator<[StorageType, object]>;

    //     constructor(components: Iterator<[StorageType, object]>) {
    //         this.#components = components;
    //     }

    //     get_components(func: (storage_type: StorageType, ptr: {}) => void): void {
    //         this.#components.for_each(([t, ptr]) => func(t, ptr))
    //     }
    // }

    const it = storage_types.zip(components);
    const bundle: DynamicBundle = {
        get_components(func) {
            it.for_each(([t, ptr]) => func(t, ptr))
        },
    }

    return bundle_inserter.insert(
        entity,
        location,
        bundle,
        InsertMode.Replace
    );
}

function take_component(
    storages: Storages,
    components: Components,
    removed_components: RemovedComponentEvents,
    component_id: ComponentId,
    entity: Entity,
    location: EntityLocation
): object {
    const component_info = components.get_info(component_id)!;
    removed_components.send(component_id, entity);

    if (component_info.storage_type() === StorageType.Table) {
        const table = storages.tables.get(location.table_id)!;
        const components = table.get_column(component_id)!;
        return components.get_data_unchecked(location.table_row);
    } else {
        return storages
            .sparse_sets
            .get(component_id)!
            // @ts-expect-error
            .__remove_and_forget(entity)
    }
}
