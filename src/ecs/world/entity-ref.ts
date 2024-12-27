import { iter, Iterator } from "joshkaposh-iterator";
import { type Option, type Result, is_some, ErrorExt } from "joshkaposh-option";
import { assert } from "joshkaposh-iterator/src/util";
import { StorageType, Storages } from "../storage";
import { type Component } from "../component";
import { ON_REMOVE, ON_REPLACE, World } from ".";
import { Entities, Entity, EntityLocation } from "../entity";
import { BundleFromComponent, BundleId, BundleInfo, BundleInserter, Bundles, InsertMode, type Bundle, type DynamicBundle } from "../bundle";
import { Access, Archetype, ArchetypeId, Archetypes, ComponentId, Components, ComponentTicks } from "..";
import { UnsafeEntityCell } from "./unsafe-world-cell";
import { RemovedComponentEvents } from "../removal-detection";
import { Enum } from "../../util";
import { $readonly } from "../change_detection";

export class EntityRef {
    #cell: UnsafeEntityCell;

    constructor(cell: UnsafeEntityCell) {
        this.#cell = cell;
    }

    static from(value: EntityWorldMut | EntityMut): EntityRef {
        if (value instanceof EntityWorldMut) {
            return new EntityRef(value.__as_unsafe_entity_cell());
        } else {
            return value.as_readonly();
        }
    }

    static try_from(value: FilteredEntityRef | FilteredEntityMut): Result<EntityRef, TryFromFilteredError> {
        if (!value.access().has_read_all()) {
            return TryFromFilteredError.MissingReadAllAccess as any;
        }

        return new EntityRef(value.__unsafe_entity_cell());
    }

    id(): Entity {
        return this.#cell.id();
    }

    location(): EntityLocation {
        return this.#cell.location();
    }

    archetype(): Archetype {
        return this.#cell.archetype();
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId) {
        return this.#cell.contains_id(component_id);
    }


    contains_type_id(type_id: UUID): boolean {
        return this.#cell.contains_type_id(type_id);
    }


    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return this.#cell.get(component);
    }

    get_ref<T extends Component>(component: T) {
        return this.#cell.get_ref(component);
    }

    get_change_ticks(type: Component): Option<ComponentTicks> {
        return this.#cell.get_change_ticks(type);
    }

    get_change_ticks_by_id(component_id: ComponentId) {
        return this.#cell.get_change_ticks_by_id(component_id);
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return this.#cell.get_by_id(component_id);
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Throws an error if the entity does not have the components required by the query
     */
    components<Q extends readonly any[]>(query: Q) {
        const components = this.#cell.get_components(query);
        if (!components) throw new Error('Query Mismatch Error')
        return components;
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Returns None if the entity does not have the components required by the query.
     */
    get_components<Q extends readonly any[]>(query: Q) {
        return this.#cell.get_components(query)
    }
}

export class EntityMut {
    #c: UnsafeEntityCell;

    constructor(cell: UnsafeEntityCell) {
        this.#c = cell;
    }

    static from(value: EntityWorldMut) {
        return new EntityMut(value.__as_unsafe_entity_cell());
    }

    as_readonly(): EntityRef {
        return new EntityRef(this.#c);
    }

    id(): Entity {
        return this.#c.id();
    }

    location(): EntityLocation {
        return this.#c.location();
    }

    archetype(): Archetype {
        return this.#c.archetype();
    }


    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId) {
        return this.#c.contains_id(component_id);
    }


    get<T extends Component>(type: T): Option<InstanceType<T>> {
        return this.as_readonly().get(type);
    }

    components<Q extends readonly any[]>(query: Q) {
        const components = this.get_components(query);
        if (!components) throw new Error('Query Mismatch Error');
        return components;
    }

    get_components<Q extends readonly any[]>(query: Q) {
        return this.#c.get_components(query);
    }

    get_ref<T extends Component>(component: T) {
        return this.as_readonly().get_ref(component);
    }

    get_mut<T extends Component>(type: T): Option<InstanceType<T>> {
        return this.#c.get_mut(type);
    }

    get_change_ticks(component: Component): Option<ComponentTicks> {
        return this.as_readonly().get_change_ticks(component);
    }

    get_change_ticks_by_id(component_id: ComponentId) {
        return this.as_readonly().get_change_ticks_by_id(component_id);
    }

    contains_type_id(type_id: UUID): boolean {
        return this.#c.contains_type_id(type_id)
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return this.as_readonly().get_by_id(component_id)
    }

    get_mut_by_id(component_id: ComponentId): Option<object> {
        return this.#c.get_mut_by_id(component_id)
    }

    unsafe_entity_cell(): UnsafeEntityCell {
        return this.#c;
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
        const remove_result = old_archetype.__swap_remove(old_location.archetype_row);
        if (remove_result.swapped_entity) {
            const { swapped_entity } = remove_result;
            const swapped_location = entities.get(swapped_entity)!;

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
            new_location = new_archetype.__allocate(entity, old_table_row);
        } else {
            const [old_table, new_table] = storages.tables.__get_2(old_table_id, new_archetype.table_id())
            const move_result = DROP ?
                old_table.__move_to_and_drop_missing_unchecked(old_table_row, new_table) :
                old_table.__move_to_and_forget_missing_unchecked(old_table_row, new_table);

            const new_loc = new_archetype.__allocate(entity, move_result.new_row);

            if (move_result.swapped_entity) {
                const { swapped_entity } = move_result
                const swapped_location = entities.get(swapped_entity)!;

                entities.__set(swapped_entity.index(), {
                    archetype_id: swapped_location.archetype_id,
                    archetype_row: swapped_location.archetype_row,
                    table_id: swapped_location.table_id,
                    table_row: old_location.table_row
                })

                archetypes.get(swapped_location.archetype_id)!.__set_entity_table_row(swapped_location.archetype_row, old_table_row);
            }
            new_location = new_loc;
        }

        self_location.archetype_id = new_location.archetype_id;
        self_location.archetype_row = new_location.archetype_row;
        self_location.table_id = new_location.table_id;
        self_location.table_row = new_location.table_row;

        entities.__set(entity.index(), new_location);
    }

    static #remove_bundle_info(
        entity: Entity,
        self_location: EntityLocation,
        old_location: EntityLocation,
        bundle_info: BundleInfo,
        archetypes: Archetypes,
        storages: Storages,
        components: Components,
        entities: Entities,
        removed_components: RemovedComponentEvents
    ) {
        const new_archetype_id = remove_bundle_from_archetype(
            archetypes,
            storages,
            components,
            old_location.archetype_id,
            bundle_info,
            true
        )
        if (!is_some(new_archetype_id)) {
            throw new Error('Intersections should always return a result')
        }

        if (new_archetype_id === old_location.archetype_id) {
            return
        }

        const old_archetype = archetypes.get(old_location.archetype_id)!;
        for (const component_id of bundle_info.components()) {
            if (old_archetype.contains(component_id)) {
                removed_components.send(component_id, entity);

                // Make sure to drop components stored in sparse sets.
                // Dense components are dropped later in `move_to_and_drop_missing_unchecked`.
                if (old_archetype.get_storage_type(component_id) === StorageType.SparseSet) {
                    storages.sparse_sets.get(component_id)!.__remove(entity);
                }
            }
        }

        EntityWorldMut.#move_entity_from_remove(
            true,
            entity,
            self_location,
            old_location.archetype_id,
            old_location,
            entities,
            archetypes,
            storages,
            new_archetype_id,
        )
    }

    #error_despawned() {
        throw new Error(`Entity ${this.#entity} does not exist`)
    }

    #assert_not_despawned() {
        if (this.#location.archetype_id === ArchetypeId.INVALID) {
            this.#error_despawned();
        }
    }

    // __as_unsafe_entity_cell_readonly(): UnsafeEntityCell {
    //     this.#assert_not_despawned();
    //     return new UnsafeEntityCell(this.#world, this.#entity, this.#location);
    // }

    __as_unsafe_entity_cell(): UnsafeEntityCell {
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

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId) {
        return this.__as_unsafe_entity_cell()
            .contains_id(component_id)
    }

    contains_type_id(type_id: UUID) {
        return this.__as_unsafe_entity_cell()
            .contains_type_id(type_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return EntityRef.from(this).get(component)
    }

    components<Q extends readonly any[]>(query: Q) {
        return EntityRef.from(this).components(query)
    }

    get_components<Q extends readonly any[]>(query: Q) {
        return EntityRef.from(this).get_components(query)
    }

    get_ref<T extends Component>(component: T) {
        return EntityRef.from(this).get_ref(component);
    }

    get_mut<T extends Component>(component: T) {
        return this.__as_unsafe_entity_cell().get_mut(component);
    }

    get_change_ticks(component: Component) {
        return EntityRef.from(this).get_change_ticks(component)
    }

    get_change_ticks_by_id(component_id: ComponentId) {
        return EntityRef.from(this).get_change_ticks_by_id(component_id)
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return EntityRef.from(this).get_by_id(component_id);
    }

    get_mut_by_id(component_id: ComponentId) {
        return this.__as_unsafe_entity_cell().get_mut_by_id(component_id);
    }

    /// Adds a [`Bundle`] of components to the entity.
    ///
    /// This will overwrite any previous value(s) of the same component type.
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
            bundle = Bundles.dynamic_bundle(bundle);
        }
        const change_tick = this.#world.change_tick();
        console.log('EntityWorldMut', bundle, this.#world, this.#location.archetype_id, change_tick);

        const bundle_inserter = BundleInserter.new(bundle, this.#world, this.#location.archetype_id, change_tick)
        this.#location = bundle_inserter.__insert(this.#entity, this.#location, bundle, mode)
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
        const change_tick = this.#world.change_tick();
        const bundle_id = this.#world.bundles().__init_component_info(this.#world.components(), component_id)[0].id();
        const storage_type = this.#world.bundles().get_storage_unchecked(bundle_id);

        const bundle_inserter = BundleInserter.new_with_id(
            component,
            this.#world,
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
        this.#world.flush();
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
        const change_tick = this.#world.change_tick();
        const [bundle_id, storage_types] = this.#world.bundles().__init_dynamic_info(this.#world.components(), component_ids);
        const bundle_inserter = BundleInserter.new_with_id(
            iter_components as any,
            this.#world,
            this.#location.archetype_id,
            bundle_id.id(),
            change_tick
        )
        this.#location = insert_dynamic_bundle(
            bundle_inserter,
            this.#entity,
            this.#location,
            iter(iter_components),
            iter(storage_types),
        )

        this.#world.bundles().set_storages_unchecked(bundle_id.id(), storage_types as any);
        this.#world.flush();
        this.update_location();
        return this;
    }

    take(bundle: Bundle & DynamicBundle) {
        this.#assert_not_despawned();
        const world = this.#world;
        const archetypes = world.archetypes();
        const storages = world.storages();
        const components = world.components();
        const bundle_id = world.bundles().register_info(bundle, components, storages);
        const bundle_info = world.bundles().get(bundle_id)!;
        const old_location = this.#location;

        const new_archetype_id = bundle_info.remove_bundle_from_archetype(
            world.archetypes(),
            storages,
            components,
            old_location.archetype_id,
            false
        )

        if (new_archetype_id === old_location.archetype_id) {
            return
        }
        const entity = this.#entity;

        const old_archetype = archetypes.get(old_location.archetype_id);

        trigger_on_replace_and_on_remove_hooks_and_observers(
            world,
            old_archetype,
            entity,
            bundle_info
        )

        const entities = world.entities();
        const removed_components = world.removed_components();

        const bundle_components = bundle_info.iter_components();

        const result = bundle.from_components(storages, (ptr) => {
            const component_id = bundle_components.next().value;
            take_component(ptr,
                components,
                removed_components,
                component_id,
                entity,
                old_location
            )
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

    __remove_bundle(bundle: BundleId) {
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

    remove(bundle: Bundle): this {
        this.#assert_not_despawned()
        const storages = this.#world.storages();
        const components = this.#world.components();
        const bundle_info = this.#world.bundles().register_info(bundle, components, storages);
        this.#location = this.__remove_bundle(bundle_info);
        this.#world.flush();
        this.update_location();
        return this
    }

    retain(bundle: Bundle): this {
        const archetypes = this.#world.archetypes();
        const storages = this.#world.storages();
        const components = this.#world.components();

        const retained_bundle = this.#world.bundles().register_info(bundle, components, storages)
        const retained_bundle_info = this.#world.bundles().get(retained_bundle)!;

        const old_location = this.#location;
        const old_archetype = archetypes.get(old_location.archetype_id)!;

        const to_remove = old_archetype
            .components()
            .filter(c => !retained_bundle_info.contributed_components().includes(c))
            .collect();

        const remove_bundle = this.#world.bundles().__init_dynamic_info(components, to_remove)[0].id()

        this.#location = this.__remove_bundle(remove_bundle);
        this.#world.flush();
        this.update_location();
        return this
    }

    remove_by_id(component_id: ComponentId) {
        this.#assert_not_despawned();
        const components = this.#world.components();
        const bundle_id = this.#world.bundles().__init_component_info(components, component_id)[0].id();
        this.#location = this.__remove_bundle(bundle_id)
        this.#world.flush();
        this.update_location();
        return this
    }

    remove_by_ids(component_ids: ComponentId[]) {
        this.#assert_not_despawned();
        const components = this.#world.components();

        const bundle_id = this.#world.bundles().__init_dynamic_info(components, component_ids)[0].id();
        this.__remove_bundle(bundle_id);

        this.#world.flush();
        this.update_location();
        return this;
    }

    clear() {
        this.#assert_not_despawned();
        const component_ids = this.archetype().components().collect();
        const components = this.#world.components();

        const bundle_id = this.#world.bundles().__init_dynamic_info(components, component_ids)[0].id();

        this.#location = this.__remove_bundle(bundle_id);
        this.#world.flush();
        this.update_location();
        return this;
    }

    despawn() {
        this.#assert_not_despawned();
        const world = this.#world;
        let archetype = world.archetypes().get(this.#location.archetype_id)!;

        // TODO:
        // if (archetype.has_replace_observer()) {
        //     world.trigger_observers(ON_REPLACE, this.#entity, archetype.components())
        // }
        // if (archetype.has_remove_observer()) {
        //     world.trigger_observers(ON_REMOVE, this.#entity, archetype.components())
        // }
        // world.trigger_on_remove(archetype, this.#entity, archetype.components())

        for (const component_id of archetype.components()) {
            world.removed_components().send(component_id, this.#entity)
        }

        world.__flush_entities();
        const location = world.entities().free(this.#entity);
        if (!location) throw new Error('Entity should exist at this point')

        let table_row, moved_entity;

        archetype = world.archetypes().get(this.#location.archetype_id)!;
        const remove_result = archetype.__swap_remove(location.archetype_row);
        if (remove_result.swapped_entity) {
            const { swapped_entity } = remove_result
            const swapped_location = world.entities().get(swapped_entity)!;
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
            sparse_set.__remove(this.#entity);
        }

        moved_entity = world.storages().tables.get(archetype.table_id())?.__swap_remove_unchecked(table_row);
        if (is_some(moved_entity)) {
            const moved_location = world.entities().get(moved_entity)!;
            world.entities().__set(moved_entity.index(), {
                archetype_id: moved_location.archetype_id,
                archetype_row: moved_location.archetype_row,
                table_id: moved_location.table_id,
                table_row: table_row
            })

            world.archetypes().get(moved_location.archetype_id)?.set_entity_table_row(moved_location.archetype_row, table_row);
        }
        world.flush();
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

export class FilteredEntityRef {
    #entity: UnsafeEntityCell;
    #access: Access<ComponentId>;

    constructor(entity: UnsafeEntityCell, access: Access<ComponentId>) {
        this.#entity = entity;
        this.#access = access;
    }

    id(): Entity {
        return this.#entity.id();
    }

    location() {
        return this.#entity.location();
    }

    archetype(): Archetype {
        return this.#entity.archetype();
    }

    components(): Iterator<ComponentId> {
        return this.#access.reads_and_writes();
    }

    access(): Access<ComponentId> {
        return this.#access
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId): boolean {
        return this.#entity.contains_id(component_id);
    }

    contains_type_id(type_id: UUID) {
        return this.#entity.contains_type_id(type_id);
    }

    get<T extends Component>(type: T): Option<InstanceType<T>> {
        const id = this.#entity.world().components().get_id(type);
        if (!is_some(id)) {
            return;
        }
        return this.#access.has_read(id) ? this.#entity.get_by_id(id) as InstanceType<T> : null

    }

    get_by_id(component_id: ComponentId) {
        return this.#access.has_read(component_id) ?
            this.#entity.get_by_id(component_id) :
            null

    }

    __unsafe_entity_cell() {
        return this.#entity;
    }
}

export class FilteredEntityMut {
    #entity: UnsafeEntityCell;
    #access: Access<ComponentId>;

    constructor(entity: UnsafeEntityCell, access: Access<ComponentId>) {
        this.#entity = entity;
        this.#access = access;
    }

    static from(entity: EntityWorldMut | EntityMut): FilteredEntityMut {
        const access = Access.default();
        access.read_all();
        access.write_all();
        if (entity instanceof EntityWorldMut) {
            return new FilteredEntityMut(entity.__as_unsafe_entity_cell(), access);
        }
        if (entity instanceof EntityMut) {
            return new FilteredEntityMut(entity.unsafe_entity_cell(), access)
        }

        throw new Error('`FilteredEntityMut.from()`` must be called with an instance of `EntityWorldMut` or `EntityMut`.')
    }

    as_readonly() {
        return new FilteredEntityRef(this.#entity.clone(), this.#access.clone());
    }

    id(): Entity {
        return this.#entity.id();
    }

    location(): EntityLocation {
        return this.#entity.location();
    }

    archetype(): Archetype {
        return this.#entity.archetype()
    }

    components(): Iterator<ComponentId> {
        return this.#access.reads_and_writes()
    }

    access(): Access<ComponentId> {
        return this.#access
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId): boolean {
        return this.#entity.contains_id(component_id);
    }

    contains_type_id(type_id: UUID): boolean {
        return this.#entity.contains_type_id(type_id);
    }

    get<T extends Component>(type: T): Option<InstanceType<T>> {
        return this.as_readonly().get(type);
    }

    get_mut<T extends Component>(type: T): Option<InstanceType<T>> {
        const id = this.#entity.world().components().get_id(type);
        if (!is_some(id)) {
            return null;
        }
        return this.#access.has_write(id) ? this.#entity.get_mut(type) : null;
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return this.as_readonly().get_by_id(component_id)
    }

    get_mut_by_id(component_id: ComponentId): Option<object> {
        return this.#access.has_write(component_id) ?
            this.#entity.get_by_id(component_id)! :
            null
    }

    __unsafe_entity_cell(): UnsafeEntityCell {
        return this.#entity;
    }

}

function trigger_on_replace_and_on_remove_hooks_and_observers(world: World, archetype: Archetype, entity: Entity, bundle_info: BundleInfo) {
    // if (archetype.has_replace_observer()) {
    //     world.trigger_observers(ON_REPLACE, entity, bundle_info.iter_components());
    // }

    // world.trigger_on_replace(archetype, entity, bundle_info.iter_components())

    //    if (archetype.has_remove_observer()) {
    //     world.trigger_observers(ON_REMOVE, entity, bundle_info.iter_components());
    // }

    // world.trigger_on_remove(archetype, entity, bundle_info.iter_components())


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
    components: Iterator<object>,
    storage_types: Iterator<StorageType>
) {
    class DynamicInsertBundle implements DynamicBundle {

        #components: Iterator<[StorageType, object]>;

        constructor(components: Iterator<[StorageType, object]>) {
            this.#components = components;
        }

        get_components(func: (storage_type: StorageType, ptr: {}) => void): void {
            this.#components.for_each(([t, ptr]) => func(t, ptr))
        }
    }

    const bundle = new DynamicInsertBundle(storage_types.zip(components));
    return bundle_inserter.insert(entity, location, bundle);
}

function remove_bundle_from_archetype(
    archetypes: Archetypes,
    storages: Storages,
    components: Components,
    archetype_id: ArchetypeId,
    bundle_info: BundleInfo,
    intersection: boolean
): Option<ArchetypeId> {
    let remove_bundle_result;
    const edges = archetypes.get(archetype_id)!.edges();
    if (intersection) {
        remove_bundle_result = edges.get_remove_bundle(bundle_info.id());
    } else {
        remove_bundle_result = edges.get_take_bundle(bundle_info.id());
    }

    let result
    if (is_some(remove_bundle_result)) {
        result = remove_bundle_result;
    } else {
        let next_table_components, next_sparse_set_components, next_table_id;

        const current_archetype = archetypes.get(archetype_id)!;
        const removed_table_components = [];
        const removed_sparse_set_components = [];
        for (const component_id of bundle_info.components()) {
            if (current_archetype.contains(component_id)) {
                const component_info = components.get_info(component_id)!;
                if (component_info.storage_type() === StorageType.Table) {
                    removed_table_components.push(component_id)
                } else {
                    removed_sparse_set_components.push(component_id);
                }
            } else if (!intersection) {
                current_archetype.edges().__insert_take_bundle(bundle_info.id(), null)
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
            storages.tables.__get_id_or_insert(next_table_components, components);

        const new_archetype_id = archetypes.__get_id_or_insert(
            next_table_id,
            next_table_components,
            next_sparse_set_components
        );
        return new_archetype_id;
    }

    const current_archetype = archetypes.get(archetype_id)!;

    if (intersection) {
        current_archetype.edges().__insert_remove_bundle(bundle_info.id(), result);
    } else {
        current_archetype.edges().__insert_take_bundle(bundle_info.id(), result);
    }

    return result;
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

    switch (component_info.storage_type()) {
        case StorageType.Table: {
            const table = storages.tables.get(location.table_id)!;
            const components = table.get_column(component_id)!;
            return components.get_data_unchecked(location.table_row);
        }
        case StorageType.SparseSet: {
            return storages
                .sparse_sets
                .get(component_id)!
                .__remove_and_forget(entity)
        }

        default:
            throw new Error('Unreachable')
    }
}

function sorted_remove(source: number[], remove: number[]) {
    let remove_index = 0;
    // TODO: function retain(array: T[], fn: (value: T) => boolean)
    // @ts-expect-error
    retain(source, value => {
        while (remove_index < remove.length && value > remove[remove_index]) {
            remove_index += 1;
        }

        if (remove_index < source.length) {
            // TODO: *value '!'= remove[remove_index] 
            return value += !remove[remove_index];
        } else {
            return true
        }
    })
}