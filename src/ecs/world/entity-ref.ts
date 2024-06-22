import { type Option, is_some, once, iter, Iterator, Result, ErrorExt } from "joshkaposh-iterator";
import { TODO, assert } from "joshkaposh-iterator/src/util";
import { StorageType, Storages } from "../storage";
import { type Component } from "../component";
import { World } from ".";
import { Entities, Entity, type EntityLocation } from "../entity";
import { BundleFromComponent, BundleInfo, BundleInserter, type Bundle, type DynamicBundle } from "../bundle";
import { Access, Archetype, ArchetypeId, Archetypes, ComponentId, Components } from "..";
import { UnsafeEntityCell } from "./unsafe-world-cell";
import { RemovedComponentEvents } from "../removal-detection";
import { Enum } from "../../util";

export class EntityRef {
    #cell: UnsafeEntityCell;

    constructor(cell: UnsafeEntityCell) {
        this.#cell = cell;
    }

    static from(value: EntityWorldMut | EntityMut) {
        if (value instanceof EntityWorldMut) {
            return new EntityRef(value.__as_unsafe_entity_cell_readonly());
        }

        if (value instanceof EntityMut) {
            return new EntityRef(value.unsafe_entity_cell())
        }

        throw new Error('`EntityRef.from()` must be called with an instance of `EntityMut` or `EntityWorldMut`.')
    }

    static try_from(value: FilteredEntityRef | FilteredEntityMut): Result<EntityRef, TryFromFilteredError> {
        if (!value.access().has_read_all()) {
            return TryFromFilteredError.MissingReadAllAccess as any;
        }

        return new EntityRef(value.__unsafe_entity_cell());
    }

    insert(bundle: Bundle & DynamicBundle): this {
        const bundle_info = this.#cell.world()
            .bundles()
            .__init_info(
                bundle,
                this.#cell.world().components(),
                this.#cell.world().storages()
            )
        const bundle_inserter = bundle_info.__get_bundle_inserter(
            this.#cell.world().entities(),
            this.#cell.world().archetypes(),
            this.#cell.world().components(),
            this.#cell.world().storages(),
            this.#cell.location().archetype_id,
        )

        this.#cell.__internal_set_location(bundle_inserter.insert(this.#cell.id(), this.#cell.location(), bundle))

        return this;
    }

    id(): Entity {
        return this.#cell.id();
    }

    archetype(): Archetype {
        return this.#cell.archetype();
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_type_id(type_id: UUID): boolean {
        return this.#cell.world().components().has_type_id(type_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        if (component.storage_type === StorageType.Table) {
            const table = this.#cell.world().storages().tables.get(this.#cell.location().table_id)!;
            assert(is_some(table));
            return table.get_column(this.#cell.world().component_id(component)!)?.get_data(this.#cell.location().table_row) as Option<InstanceType<T>>
        } else {
            const sparse_set = this.#cell.world().storages().sparse_sets.get(this.#cell.world().component_id(component)!)!;
            assert(is_some(sparse_set));
            return sparse_set.get(this.#cell.id()) as Option<InstanceType<T>>;
        }
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return this.#cell.get_by_id(component_id);
    }
}

export class EntityMut {
    #c: UnsafeEntityCell;

    constructor(cell: UnsafeEntityCell) {
        this.#c = cell;
    }

    unsafe_entity_cell(): UnsafeEntityCell {
        return this.#c;
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

    contains_type_id(type_id: UUID): boolean {
        return this.#c.contains_type_id(type_id)
    }

    get<T extends Component>(type: T): Option<InstanceType<T>> {
        return this.as_readonly().get(type);
    }

    get_mut<T extends Component>(type: T): Option<InstanceType<T>> {
        //TODO: return this.#c.get_mut(type)
        return this.#c.get(type);
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return this.as_readonly().get_by_id(component_id)
    }

    get_mut_by_id(component_id: ComponentId): Option<object> {
        //TODO: return this.#c.get_mut_by_id(component_id)
        return this.#c.get_by_id(component_id)
    }
}

export class EntityWorldMut {
    #world: World
    #entity: Entity;
    #location: EntityLocation;

    __as_unsafe_entity_cell_readonly(): UnsafeEntityCell {
        return new UnsafeEntityCell(this.#world, this.#entity, this.#location);
    }

    __as_unsafe_entity_cell(): UnsafeEntityCell {
        return new UnsafeEntityCell(this.#world, this.#entity, this.#location);
    }

    constructor(world: World, entity: Entity, location: EntityLocation) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    id(): Entity {
        return this.#entity;
    }

    location(): EntityLocation {
        return this.#location;
    }

    archetype(): Archetype {
        return this.#world.archetypes().get(this.#location.archetype_id)!;
    }

    contains(type: Component): boolean {
        return this.contains_type_id(type.type_id);
    }

    contains_id(component_id: ComponentId) {
        return this.__as_unsafe_entity_cell_readonly()
            .contains_id(component_id)
    }

    contains_type_id(type_id: UUID) {
        return this.__as_unsafe_entity_cell_readonly()
            .contains_type_id(type_id);
    }

    get<T extends Component>(component: T): Option<InstanceType<T>> {
        return new EntityRef(new UnsafeEntityCell(
            this.#world,
            this.#entity,
            this.#location
        )).get(component);
    }

    get_by_id(component_id: ComponentId): Option<object> {
        return new EntityRef(new UnsafeEntityCell(
            this.#world,
            this.#entity,
            this.#location
        )).get_by_id(component_id);
    }

    /// Adds a [`Bundle`] of components to the entity.
    ///
    /// This will overwrite any previous value(s) of the same component type.
    insert(bundle: Bundle & DynamicBundle) {
        const bundle_info = this.#world.bundles().__init_info(
            bundle,
            this.#world.components(),
            this.#world.storages()
        )
        const bundle_inserter = bundle_info.__get_bundle_inserter(
            this.#world.entities(),
            this.#world.archetypes(),
            this.#world.components(),
            this.#world.storages(),
            this.#location.archetype_id
        )

        this.#location = bundle_inserter.insert(this.#entity, this.#location, bundle)

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
    insert_by_id(component_id: ComponentId, component: {}) {
        const bundles = this.#world.bundles();
        const components = this.#world.components();

        const [bundle_info, storage_type] = bundles.__init_component_info(components, component_id);
        const bundle_inserter = bundle_info.__get_bundle_inserter(
            this.#world.entities(),
            this.#world.archetypes(),
            this.#world.components(),
            this.#world.storages(),
            this.#location.archetype_id
        )

        this.#location = insert_dynamic_bundle(
            bundle_inserter,
            this.#entity,
            this.#location,
            once(component),
            once(storage_type)
        )

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
    insert_by_ids(component_ids: ComponentId[], iter_components: Iterator<object>) {
        const bundles = this.#world.bundles();
        const components = this.#world.components();
        const [bundle_info, storage_types] = bundles.__init_dynamic_info(
            components,
            component_ids
        )
        const bundle_inserter = bundle_info.__get_bundle_inserter(
            this.#world.entities(),
            this.#world.archetypes(),
            this.#world.components(),
            this.#world.storages(),
            this.#location.archetype_id,
        )

        this.#location = insert_dynamic_bundle(
            bundle_inserter,
            this.#entity,
            this.#location,
            iter_components,
            iter(storage_types)
        )

        return this;
    }

    take(bundle: Bundle & DynamicBundle) {
        const archetypes = this.#world.archetypes();
        const storages = this.#world.storages();
        const components = this.#world.components();
        const entities = this.#world.entities();
        const removed_components = this.#world.removed_components();

        const bundle_info = this.#world.bundles().__init_info(bundle, components, storages);
        const old_location = this.#location;
        TODO('EntityWordMut::take')
        const new_archetype_id = remove_bundle_from_archetype(
            archetypes,
            storages,
            components,
            old_location.archetype_id,
            bundle_info,
            false
        ) //TODO: ?
        if (!is_some(new_archetype_id)) {
            return null
        }

        // ...

        if (new_archetype_id == old_location.archetype_id) {
            return null;
        }

        const bundle_components = iter(bundle_info.components());
        const entity = this.#entity;
        const result = bundle.from_components(storages, (ptr) => {
            const component_id = bundle_components.next().value;
            return BundleFromComponent(take_component(
                ptr,
                components,
                removed_components,
                component_id,
                entity,
                old_location
            ).constructor as Component)
        })

        EntityWorldMut.move_entity_from_remove(
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

        return result;
    }

    static move_entity_from_remove(
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

        EntityWorldMut.move_entity_from_remove(
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

    remove(bundle: Bundle): this {
        const archetypes = this.#world.archetypes();
        const storages = this.#world.storages();
        const components = this.#world.components();
        const entities = this.#world.entities();
        const removed_components = this.#world.removed_components();

        const bundle_info = this.#world.bundles().__init_info(bundle, components, storages);
        const old_location = this.#location;

        EntityWorldMut.#remove_bundle_info(
            this.#entity,
            this.#location,
            old_location,
            bundle_info,
            archetypes,
            storages,
            components,
            entities,
            removed_components,
        )

        return this
    }

    retain(bundle: Bundle): this {
        const archetypes = this.#world.archetypes();
        const storages = this.#world.storages();
        const components = this.#world.components();
        const entities = this.#world.entities();
        const removed_components = this.#world.removed_components();

        const retained_bundle_info = this.#world.bundles().__init_info(bundle, components, storages)
        const old_location = this.#location;
        const old_archetype = archetypes.get(old_location.archetype_id)!;

        const to_remove = old_archetype
            .components()
            .filter(c => !retained_bundle_info.components().includes(c))
            .collect();

        const remove_bundle_info = this.#world.bundles().__init_dynamic_info(components, to_remove)[0];

        EntityWorldMut.#remove_bundle_info(
            this.#entity,
            this.#location,
            old_location,
            remove_bundle_info,
            archetypes,
            storages,
            components,
            entities,
            removed_components
        )

        return this
    }


    despawn() {
        const world = this.#world;
        world.flush();
        const location = world.entities().free(this.#entity)!;
        assert(is_some(location), 'Entity should exist at this point')

        let table_row, moved_entity;

        const archetype = world.archetypes().get(location.archetype_id)!;

        for (const component_id of archetype.components()) {
            world.removed_components().send(component_id, this.#entity);

        }
        const remove_result = archetype.__swap_remove(location.archetype_row);
        const { swapped_entity } = remove_result
        if (swapped_entity) {
            const swapped_location = world.entities().get(swapped_entity)!;

            world.entities().__set(swapped_entity.index(), {
                archetype_id: swapped_location.archetype_id,
                archetype_row: location.archetype_row,
                table_id: swapped_location.table_id,
                table_row: swapped_location.table_row
            })

            table_row = remove_result.table_row;

            for (const component_id of archetype.sparse_set_components()) {
                const sparse_set = world.storages().sparse_sets.get(component_id)!;
                sparse_set.__remove(this.#entity);
            }

            moved_entity = world.storages().tables.get(archetype.table_id())!.__swap_remove_unchecked(table_row);
        }

        if (moved_entity) {
            const moved_location = world.entities().get(moved_entity)!;
            world.entities().__set(moved_entity.index(), {
                archetype_id: moved_location.archetype_id,
                archetype_row: moved_location.archetype_row,
                table_id: moved_location.table_id,
                table_row: table_row!,
            })

            world.archetypes().get(moved_location.archetype_id)!.__set_entity_table_row(moved_location.archetype_row, table_row!);

        }
    }

    world() {
        return this.#world;
    }

    update_location() {
        this.#location = this.#world.entities().get(this.#entity)!;
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