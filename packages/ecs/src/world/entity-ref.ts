import { iter, Iterator } from "joshkaposh-iterator";
import { type Option, ErrorExt } from "joshkaposh-option";
import { StorageType, Storages, Tables } from "../storage";
import { type Component, type ComponentId, type Components, ComponentTicks } from "../component";
import { type World } from "./world";
import { Entities, type Entity, EntityLocation, index } from "../entity";
import { BundleEffect, BundleId, BundleInfo, BundleInserter, Bundles, InsertMode, type Bundle, type DynamicBundle } from "../bundle";
import type { QueryItem } from "../query";
import { type Archetype, ArchetypeId, Archetypes, } from '../archetype';
import { get, get_components, get_ref, archetype, get_by_id, contains_type_id, get_mut, get_mut_by_id, contains_id, get_ticks_by_id, get_ticks, components } from "./unsafe-world-cell";
import { RemovedComponentEvents } from '../removal-detection'
import { Mut, Ref } from "../change_detection";
import { TODO } from "joshkaposh-iterator/src/util";
import { Relationship } from "../relationship";
import { ON_REMOVE, ON_REPLACE, triggerObservers, triggerOnRemove, triggerOnReplace } from "./deferred-world";

type BundleInputElement = Bundle | InstanceType<Component> | Component;
export type BundleInput = BundleInputElement[]

export interface EntityReference {
    get id(): Entity;

    get location(): EntityLocation;

    get archetype(): Archetype;

    has(type: Component): boolean;

    hasId(component_id: ComponentId): boolean;

    hasTypeId(type_id: UUID): boolean;

    get<T extends Component>(component: T): Option<InstanceType<T>>;

    getRef<T extends Component>(component: T): Option<Ref<T>>;

    getTicks(component: Component): Option<ComponentTicks>;

    getTicksById(component_id: ComponentId): Option<ComponentTicks>;

    getById<T extends Component>(component_id: ComponentId): Option<InstanceType<T>>;
    /**
     * Returns read-only components for the current entity that match the query.
     * @throws if the entity does not have the components required by the query.
     */
    components<const Q extends any[]>(...query: Q): QueryItem<Q>;

    /**
     * Returns read-only components for the current entity that match the query.
     * Returns None if the entity does not have the components required by the query.
     */
    getComponents<const Q extends any[]>(...query: Q): Option<QueryItem<Q>>;
}

export class EntityRef implements EntityReference {
    #world: World;
    #entity: Entity;
    #location: EntityLocation;

    constructor(world: World, location: EntityLocation, entity: Entity) {
        this.#world = world;
        this.#location = location;
        this.#entity = entity;
    }

    get id() {
        return this.#entity
    }

    get location() {
        return this.#location;
    }

    get archetype() {
        return archetype(this.#world, this.#location);
    }

    has(type: Component) {
        return contains_type_id(this.#world, this.#location, type.type_id);
    }

    hasId(component_id: ComponentId) {
        return contains_id(this.#world, this.#location, component_id);
    }

    hasTypeId(type_id: UUID) {
        return contains_type_id(this.#world, this.#location, type_id);
    }

    get<T extends Component>(component: T) {
        return get(this.#world, this.#entity, this.#location, component);
    }

    getRef<T extends Component>(component: T) {
        return get_ref(this.#world, this.#entity, this.#location, component);
    }

    getTicks(component: Component) {
        return get_ticks(this.#world, this.#entity, this.#location, component);
    }

    getTicksById(component_id: ComponentId) {
        return get_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    getById<T extends Component>(component_id: ComponentId) {
        return get_by_id<T>(this.#world, this.#entity, this.#location, component_id);
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Throws an error if the entity does not have the components required by the query
     */
    components<const Q extends any[]>(...query: Q) {
        return components(query, this.#world, this.#location, this.#entity);
    }

    /**
     * Returns read-only components for the current entity that match the query.
     * Returns None if the entity does not have the components required by the query.
     */
    getComponents<const Q extends any[]>(...query: Q) {
        return get_components(query, this.#world, this.#location, this.#entity);
    }
}

export interface EntityReferenceMut extends EntityRef { }

interface EntityMutReference extends EntityReference {
    asReadonly(): EntityRef;
    getMut<T extends Component>(type: T): Option<Mut<T>>;
    getMutById<T extends Component>(component_id: ComponentId): Option<Mut<T>>;
}


export class EntityMut implements EntityMutReference {
    #world: World;
    #entity: Entity;
    #location: EntityLocation;

    constructor(world: World, entity: Entity, location: EntityLocation) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    get id() {
        return this.#entity;
    }

    get location() {
        return this.#location;
    }

    get archetype() {
        return archetype(this.#world, this.#location);
    }

    asReadonly() {
        return new EntityRef(this.#world, this.#location, this.#entity);
    }

    has(type: Component) {
        return contains_type_id(this.#world, this.#location, type.type_id);
    }

    hasId(component_id: ComponentId) {
        return contains_id(this.#world, this.#location, component_id);
    }

    hasTypeId(type_id: UUID) {
        return contains_type_id(this.#world, this.#location, type_id);
    }

    get<T extends Component>(component: T) {
        return get(this.#world, this.#entity, this.#location, component);
    }

    components<const Q extends any[]>(...query: Q) {
        return components(query, this.#world, this.#location, this.#entity);
    }

    getComponents<const Q extends any[]>(...query: Q) {
        return get_components(query, this.#world, this.#location, this.#entity);
    }

    getRef<T extends Component>(component: T) {
        return get_ref(this.#world, this.#entity, this.#location, component);
    }

    getMut<T extends Component>(component: T) {
        return get_mut(this.#world, this.#entity, this.#location, component);
    }

    getTicks(component: Component) {
        return get_ticks(this.#world, this.#entity, this.#location, component);
    }

    getTicksById(component_id: ComponentId) {
        return get_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    getById<T extends Component>(component_id: ComponentId) {
        return get_by_id<T>(this.#world, this.#entity, this.#location, component_id);
    }

    getMutById<T extends Component>(component_id: ComponentId) {
        return get_mut_by_id<T>(this.#world, this.#entity, this.#location, component_id);
    }
}

function assertNotDespawned(location_archetype_id: ArchetypeId, id: Entity) {
    if (location_archetype_id === ArchetypeId.INVALID) {
        throw new Error(`Entity ${id} does not exist`)
    }
}

function copyLoc(src: EntityLocation, dst: EntityLocation) {
    dst.archetype_id = src.archetype_id;
    dst.archetype_row = src.archetype_row;
    dst.table_id = src.table_id;
    dst.table_row = src.table_row;
}

function withRelated(world: World, bundle: Bundle[], relationship: Relationship, entity: Entity) {
    world.spawn([bundle, relationship.from(entity)]);
}

export function withRelatedEntities<R extends Relationship>(world: World, relationship: R, entity: Entity, func: (spawner: RelatedSpawner<R>) => void) {
    func(new RelatedSpawner(world, relationship, entity))
}

function addRelated<R extends Relationship>(world: World, relationship: R, related: Entity[]) {
    const target = relationship.RelationshipTarget;
    for (let i = 0; i < related.length; i++) {
        world.entityMut(related[i]).insert(target);
    }
}

function clearRelated<R extends Relationship>(world: World, location: EntityLocation, entity: Entity, relationship: R) {
    remove(world, location, entity, relationship.RelationshipTarget);
}

function insertRelated<R extends Relationship>(_relationship: R, _index: number, related: Entity[]) {

}

function remove(world: World, location: EntityLocation, entity: Entity, ...bundle: BundleInput) {
    assertNotDespawned(location.archetype_id, entity);
    const storages = world.storages,
        components = world.components,
        bundle_id = world.bundles.registerInfo(Bundles.dynamicBundle(bundle), components, storages);
    const new_loc = removeBundle(world, location, entity, bundle_id);
    copyLoc(new_loc, location);
    world.flush();
    updateLocation(world, location, entity);
}

function removeBundle(world: World, location: EntityLocation, entity: Entity, bundle: BundleId) {
    const bundle_info = world.bundles.get(bundle)!;
    const new_archetype_id = bundle_info.removeBundleFromArchetype(
        world.archetypes,
        world.storages,
        world.components,
        location.archetype_id,
        true
    )

    if (new_archetype_id == null) {
        throw new Error('Intersections should always return a result')
    } else if (new_archetype_id === location.archetype_id) {
        return location;
    }

    const old_archetype = world.archetypes.get(location.archetype_id)!;

    triggerOnReplaceAndOnRemoveHooksAndObservers(
        world,
        old_archetype,
        entity,
        bundle_info
    )

    for (const component_id of bundle_info.iterExplicitComponents()) {
        if (old_archetype.has(component_id)) {
            world.removedComponents.send(component_id, entity)
        }

        if (old_archetype.getStorageType(component_id) === StorageType.SparseSet) {
            world.storages.sparse_sets.get(component_id)!.__delete(entity);
        }
    }

    moveEntityFromRemove(
        entity,
        location,
        location.archetype_id,
        location,
        world.entities,
        world.archetypes,
        world.storages.tables,
        new_archetype_id
    )
    return location;
}

function moveEntityFromRemove(
    entity: Entity,
    self_location: EntityLocation,
    old_archetype_id: ArchetypeId,
    old_location: EntityLocation,
    entities: Entities,
    archetypes: Archetypes,
    tables: Tables,
    new_archetype_id: ArchetypeId
) {
    const old_archetype = archetypes.get(old_archetype_id)!;
    const remove_result = old_archetype.__swapRemove(old_location.archetype_row);
    if (remove_result.swapped_entity) {
        const { swapped_entity } = remove_result;
        const swapped_location = entities.get(swapped_entity)!;

        entities.__set(index(swapped_entity), {
            archetype_id: swapped_location.archetype_id,
            archetype_row: old_location.archetype_row,
            table_id: swapped_location.table_id,
            table_row: swapped_location.table_row
        })
    }

    const old_table_row = remove_result.table_row;
    const old_table_id = old_archetype.tableId;
    const new_archetype = archetypes.get(new_archetype_id)!;

    let new_location: EntityLocation;
    if (old_table_id === new_archetype.tableId) {
        new_location = new_archetype.allocate(entity, old_table_row);
    } else {
        const [old_table, new_table] = tables.get2(old_table_id, new_archetype.tableId)
        const move_result = old_table.__moveToAndDropMissingUnchecked(old_table_row, new_table)

        const new_loc = new_archetype.allocate(entity, move_result.new_row);

        if (move_result.swapped_entity) {
            const { swapped_entity } = move_result
            const swapped_location = entities.get(swapped_entity)!;
            entities.__set(index(swapped_entity), {
                archetype_id: swapped_location.archetype_id,
                archetype_row: swapped_location.archetype_row,
                table_id: swapped_location.table_id,
                table_row: old_location.table_row
            })

            archetypes.get(swapped_location.archetype_id)!.setEntityTableRow(swapped_location.archetype_row, old_table_row);
        }
        new_location = new_loc;
    }

    copyLoc(self_location, new_location);

    entities.__set(index(entity), new_location);
}

function updateLocation(world: World, location: EntityLocation, entity: Entity) {
    const new_loc = world.entities.get(entity) ?? EntityLocation.INVALID;
    if (new_loc !== location) {
        copyLoc(new_loc, location);
    }
}

function insert(world: World, location: EntityLocation, entity: Entity, mode: InsertMode, bundle: (InstanceType<Component> | Bundle)[]) {
    assertNotDespawned(location.archetype_id, entity);
    bundle = Bundles.dynamicBundle(bundle) as any;

    const new_loc = BundleInserter.new(
        bundle as unknown as Bundle,
        world,
        location.archetype_id,
        world.changeTick
    ).insert(
        entity,
        location,
        bundle as unknown as Bundle,
        mode
    );
    copyLoc(new_loc, location);
    world.flush();
    updateLocation(world, location, entity);
}

function removeById(world: World, location: EntityLocation, entity: Entity, component_id: ComponentId) {
    assertNotDespawned(location.archetype_id, entity);
    removeBundleUpdateLocation(world, location, entity, world.bundles.initComponentInfo(world.components, world.storages, component_id));
}

function removeByIds(world: World, location: EntityLocation, entity: Entity, component_ids: ComponentId[]) {
    assertNotDespawned(location.archetype_id, entity);
    removeBundleUpdateLocation(world, location, entity, world.bundles.initDynamicInfo(world.components, world.storages, component_ids));
}

function removeBundleUpdateLocation(world: World, location: EntityLocation, entity: Entity, bundle_id: BundleId) {
    const new_loc = removeBundle(world, location, entity, bundle_id);
    copyLoc(new_loc, location);
    world.flush();
    updateLocation(world, location, entity);
}

function insertDynamicBundle(
    bundle_inserter: BundleInserter,
    entity: Entity,
    location: EntityLocation,
    components: Iterator<InstanceType<Component>>,
    storage_types: Iterator<StorageType>
) {
    const it = storage_types.zip(components);
    const bundle: DynamicBundle = {
        Effect: BundleEffect.NoEffect,
        getComponents(func) {
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

function takeComponent(
    storages: Storages,
    components: Components,
    removed_components: RemovedComponentEvents,
    component_id: ComponentId,
    entity: Entity,
    location: EntityLocation
): object {
    const component_info = components.getInfo(component_id)!;
    removed_components.send(component_id, entity);

    if (component_info.storage_type === StorageType.Table) {
        const table = storages.tables.get(location.table_id)!;
        const components = table.getColumn(component_id)!;
        return components.getDataUnchecked(location.table_row);
    } else {
        return storages
            .sparse_sets
            .get(component_id)!
            .__deleteAndForget(entity) as object
    }
}

interface EntityWorldMutReference extends EntityMutReference {
    withRelated(bundle: Bundle & Relationship): void;
    withRelatedEntities<R extends Relationship>(relationship: R, func: (spawner: RelatedSpawner<R>) => void): void;

    addRelated<R extends Relationship>(relationship: R, related: Entity[]): EntityWorldMutReference;

    clearRelated<R extends Relationship>(relationship: R): EntityWorldMutReference;

    insertRelated<R extends Relationship>(relationship: R, index: number, related: Entity[]): EntityWorldMutReference;

    getMut<T extends Component>(component: T): Option<Mut<T>>;

    getMutById<T extends Component>(component_id: ComponentId): Option<Mut<T>>

    /**
     * Adds a [`Bundle`] of components to the entity.
     * 
     * This will overwrite any previous value(s) of the same component type.
     */
    insert(...bundle: BundleInput): EntityWorldMutReference;

    insertIfNew(...bundle: BundleInput): EntityWorldMutReference;

    /**
     * Inserts a dynamic [`Component`] into the entity.
     * This will overwrite any previous value(s) of the same component type.
     * You should prefer to use the typed API [`EntityWorldMut::insert`] where possible.
     * # Safety
     * - [`ComponentId`] must be from the same world as [`EntityWorldMut`]
     * - [`OwningPtr`] must be a valid reference to the type represented by [`ComponentId`]
    */
    insertById(component_id: ComponentId, component: InstanceType<Component>): EntityWorldMutReference;
    /**
     * Inserts a dynamic [`Bundle`] into the entity.
     * 
     * This will overwrite any previous value(s) of the same component type.
     * 
     *  You should prefer to use the typed API [`EntityWorldMut::insert`] where possible.
     *  If your [`Bundle`] only has one component, use the cached API [`EntityWorldMut::insert_by_id`].
     * 
     * If possible, pass a sorted slice of `ComponentId` to maximize caching potential.
     * 
     * # Safety
     * - Each [`ComponentId`] must be from the same world as [`EntityWorldMut`]
     * - Each [`OwningPtr`] must be a valid reference to the type represented by [`ComponentId`]
   
     */
    insertByIds(component_ids: ComponentId[], iter_components: InstanceType<Component>[]): EntityWorldMutReference;

    cloneComponents(target: Entity, ...components: BundleInput): EntityWorldMutReference;

    moveComponents(target: Entity, ...components: BundleInput): EntityWorldMutReference;

    take(...bundle: BundleInput): any;
    remove(...bundle: BundleInput): EntityWorldMutReference;

    removeWithRequires(bundle: BundleInput): EntityWorldMutReference;

    /**
     * Removes any components expect those in the Bundle (and its Required Components) from the entity.
     * 
     * Throws an error if the entity has been despawned while this EntityWorldMut is still alive.
     */
    retain(...bundle: BundleInput): EntityWorldMutReference;

    removeById(component_id: ComponentId): EntityWorldMutReference

    removeByIds(component_ids: ComponentId[]): EntityWorldMutReference;

    clear(): EntityWorldMutReference;

    despawn(): void;
    flush(): Entity;

    /**
     * Gives mutable access to this entity's `World` in a temporary scope. This is a safe alternative to `EntityWorldMut.world_mut()`
     */
    worldScope<U>(scope: (world: World) => U): U;

    updateLocation(): void;

    isDespawned(): boolean;
}

export class EntityWorldMut implements EntityWorldMutReference {
    #world: World
    #entity: Entity;
    #location: EntityLocation;

    constructor(world: World, location: EntityLocation, entity: Entity) {
        this.#world = world;
        this.#entity = entity;
        this.#location = location;
    }

    asReadonly() {
        return new EntityRef(this.#world, this.#location, this.#entity)
    }

    get id() {
        return this.#entity;
    }

    get world() {
        return this.#world;
    }

    get location() {
        const location = this.#location;
        assertNotDespawned(location.archetype_id, this.#entity);
        return location;
    }

    get archetype() {
        return archetype(this.#world, this.#location);
    }

    has(component: Component) {
        return contains_type_id(this.#world, this.#location, component.type_id);
    }

    hasTypeId(type_id: UUID) {
        return contains_type_id(this.#world, this.#location, type_id);
    }

    hasId(component_id: ComponentId) {
        return contains_id(this.#world, this.#location, component_id);
    }

    get<T extends Component>(component: T) {
        return get(this.#world, this.#entity, this.#location, component);
    }

    withRelated(bundle: Bundle & Relationship) {
        this.#world.spawn([bundle, bundle.from(this.#entity)]);
    }

    withRelatedEntities<R extends Relationship>(relationship: R, func: (spawner: RelatedSpawner<R>) => void) {
        func(new RelatedSpawner(this.#world, relationship, this.#entity))
    }

    addRelated<R extends Relationship>(relationship: R, related: Entity[]) {
        addRelated(this.#world, relationship, related);
        return this;
    }

    clearRelated<R extends Relationship>(relationship: R) {
        remove(this.#world, this.#location, this.#entity, relationship.RelationshipTarget);
        return this;
    }

    insertRelated<R extends Relationship>(relationship: R, index: number, related: Entity[]) {
        insertRelated(relationship, index, related);
        return this;
    }

    components<const Q extends any[]>(...query: Q) {
        return components(query, this.#world, this.#location, this.#entity);
    }

    getComponents<const Q extends any[]>(...query: Q) {
        return get_components(query, this.#world, this.#location, this.#entity);
    }

    getRef<T extends Component>(component: T) {
        return get_ref(this.#world, this.#entity, this.#location, component);
    }

    getMut<T extends Component>(component: T) {
        return get_mut(this.#world, this.#entity, this.#location, component);
    }

    getTicks(component: Component) {
        return get_ticks(this.#world, this.#entity, this.#location, component);
    }

    getTicksById(component_id: ComponentId) {
        return get_ticks_by_id(this.#world, this.#entity, this.#location, component_id);
    }

    getById<T extends Component>(component_id: ComponentId) {
        return get_by_id<T>(this.#world, this.#entity, this.#location, component_id);
    }

    getMutById<T extends Component>(component_id: ComponentId) {
        return get_mut_by_id<T>(this.#world, this.#entity, this.#location, component_id);
    }

    /**
     * Adds a [`Bundle`] of components to the entity.
     * 
     * This will overwrite any previous value(s) of the same component type.
     */
    insert(...bundle: BundleInput) {
        insert(this.#world, this.#location, this.#entity, InsertMode.Replace, bundle);
        return this;
    }

    insertIfNew(...bundle: BundleInput) {
        insert(this.#world, this.#location, this.#entity, InsertMode.Keep, bundle);
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
    insertById(component_id: ComponentId, component: InstanceType<Component>) {
        assertNotDespawned(this.#location.archetype_id, this.#entity);
        const world = this.#world;
        const change_tick = world.changeTick;
        const bundle_id = world.bundles.initComponentInfo(world.components, world.storages, component_id)
        const storage_type = world.bundles.getStorageUnchecked(bundle_id);

        const location = this.#location, entity = this.#entity;

        const bundle_inserter = BundleInserter.newWithId(
            world,
            location.archetype_id,
            bundle_id,
            change_tick
        );

        const new_loc = insertDynamicBundle(
            bundle_inserter,
            entity,
            location,
            iter([component]),
            iter([storage_type])
        );
        copyLoc(new_loc, location);
        world.flush();
        updateLocation(world, location, entity);
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
    insertByIds(component_ids: ComponentId[], iter_components: InstanceType<Component>[]) {
        assertNotDespawned(this.#location.archetype_id, this.#entity);
        const world = this.#world;
        const change_tick = world.changeTick;
        const bundle_id = world.bundles.initDynamicInfo(world.components, world.storages, component_ids);
        const bundles = world.bundles;
        const storage_types_old = bundles.getStoragesUnchecked(bundle_id);
        const storage_types = storage_types_old.slice();
        storage_types_old.length = 0;

        const location = this.#location, entity = this.#entity;

        const bundle_inserter = BundleInserter.newWithId(
            world,
            this.#location.archetype_id,
            bundle_id,
            change_tick
        )

        const new_loc = insertDynamicBundle(
            bundle_inserter,
            entity,
            location,
            iter(iter_components),
            iter(storage_types),
        );
        copyLoc(new_loc, location);

        bundles.setStoragesUnchecked(bundle_id, storage_types.slice());
        storage_types.length = 0;
        updateLocation
        world.flush();
        updateLocation(world, location, entity);
        return this;
    }

    // clone_with(target: Entity, config: (builder: EntityClonerBuilder) => void) {
    //     const builder = EntityCloner.build(this.#world);
    //     config(builder);
    //     builder.clone_entity(this.#entity, target);
    //     this.#world.flush();
    //     this.updateLocation();
    //     return this;
    // }

    // clone_and_spawn() {
    //     return this.clone_and_spawn_with(() => { });
    // }

    // clone_and_spawn_with(config: (builder: EntityClonerBuilder) => void): Entity {
    //     this.#assertNotDespawned();

    //     const world = this.#world;
    //     // const entity_clone = world.entities().reserve_entity();
    //     // world.flush();

    //     // const builder = EntityCloner.build(this.#world);
    //     // config(builder);
    //     // builder.clone_entity(this.#entity, entity_clone);

    //     world.flush();
    //     this.updateLocation();
    //     return TODO('EntityWorldMut.clone_and_spawn_with()', config);
    //     // return entity_clone;
    // }

    cloneComponents(target: Entity, ...components: BundleInput) {
        const world = this.#world, location = this.#location, entity = this.#entity;
        assertNotDespawned(location.archetype_id, entity);

        TODO('EntityWorldMut.clone_components', target, components)
        // EntityCloner
        //     .build(this.#world)
        //     .deny_all()
        //     .allow(components)
        //     .clone_entity(this.#entity, target);

        world.flush();
        updateLocation(world, location, entity);
        return this;
    }

    moveComponents(target: Entity, ...components: BundleInput) {
        const world = this.#world, location = this.#location, entity = this.#entity;
        assertNotDespawned(location.archetype_id, entity);

        TODO('EntityWorldMut.move_components', target, components)
        // EntityCloner
        //     .build(world)
        //     .allow(components)
        //     .move_components(true)
        //     .clone_entity(this.#entity, world)

        world.flush();
        updateLocation(world, location, entity);
        return this;
    }

    take(...bundle: BundleInput) {
        assertNotDespawned(this.#location.archetype_id, this.#entity);
        const world = this.#world;
        const archetypes = world.archetypes,
            storages = world.storages,
            components = world.components;
        const bundle_info = world.bundles.get(world.bundles.registerInfo(Bundles.dynamicBundle(bundle), components, storages))!;
        const old_location = this.#location;

        const new_archetype_id = bundle_info.removeBundleFromArchetype(
            archetypes,
            storages,
            components,
            old_location.archetype_id,
            false
        )!

        if (new_archetype_id === old_location.archetype_id) {
            return
        }
        const old_archetype = archetypes.get(old_location.archetype_id)!;

        const entity = this.#entity;
        triggerOnReplaceAndOnRemoveHooksAndObservers(
            world,
            old_archetype,
            entity,
            bundle_info
        )

        const entities = world.entities,
            removed_components = world.removedComponents;


        const result = (bundle as unknown as { fromComponents(...args: any[]): any }).fromComponents(storages, (ptr: any) => {
            return takeComponent(ptr,
                components,
                removed_components,
                bundle_info.iterExplicitComponents().next().value,
                entity,
                old_location
            ) as any
        })

        moveEntityFromRemove(
            entity,
            this.#location,
            old_location.archetype_id,
            old_location,
            entities,
            archetypes,
            storages.tables,
            new_archetype_id
        )

        world.flush();
        updateLocation(world, this.#location, entity);
        return result;
    }

    remove(...bundle: BundleInput) {
        const world = this.#world, location = this.#location, entity = this.#entity;
        assertNotDespawned(location.archetype_id, entity);
        removeBundleUpdateLocation(world, location, entity, world.bundles.registerInfo(
            Bundles.dynamicBundle(bundle),
            world.components,
            world.storages
        ));
        return this;
    }

    removeWithRequires(bundle: BundleInput) {
        TODO('EntityWorldMut.remove_with_requires', bundle);
        return this;
    }

    /**
     * Removes any components expect those in the Bundle (and its Required Components) from the entity.
     * 
     * Throws an error if the entity has been despawned while this EntityWorldMut is still alive.
     */
    retain(...bundle: BundleInput) {
        const world = this.#world;
        bundle = Bundles.dynamicBundle(bundle) as any

        const archetypes = world.archetypes,
            storages = world.storages,
            components = world.components;

        const retained_bundle_info = world.bundles.get(world.bundles.registerInfo(
            bundle as unknown as Bundle,
            components,
            storages
        ))!;

        removeBundleUpdateLocation(world, this.#location, this.#entity, world.bundles.initDynamicInfo(
            components,
            storages,
            archetypes.get(this.#location.archetype_id)!
                .__componentsArray()
                .filter(c => !retained_bundle_info.contributedComponents().includes(c))
        ));
        return this
    }

    removeById(component_id: ComponentId) {
        removeById(this.#world, this.#location, this.#entity, component_id);
        return this;

    }

    removeByIds(component_ids: ComponentId[]) {
        removeByIds(this.#world, this.#location, this.#entity, component_ids);
        return this;
    }

    clear() {
        const world = this.#world, location = this.#location;
        removeByIds(world, location, this.#entity, world.archetypes.get(location.archetype_id)!.__componentsArray())
        return this;
    }

    despawn() {
        assertNotDespawned(this.#location.archetype_id, this.#entity);
        let archetype = this.#world.archetypes.get(this.#location.archetype_id)!;
        const world = this.#world;
        if (archetype.hasReplaceObserver) {
            triggerObservers(world, ON_REPLACE, this.#entity, archetype.components())
        }

        triggerOnReplace(world, archetype, this.#entity, archetype.components())

        if (archetype.hasRemoveObserver) {
            triggerObservers(world, ON_REMOVE, this.#entity, archetype.components())
        }

        triggerOnRemove(world, archetype, this.#entity, archetype.components())

        const components = archetype.__componentsArray();
        for (let i = 0; i < components.length; i++) {
            world.removedComponents.send(components[i], this.#entity)
        }

        world.__flushEntities();
        const location = world.entities.free(this.#entity);
        if (!location) throw new Error('Entity should exist at this point')

        let table_row, moved_entity;

        archetype = world.archetypes.get(this.#location.archetype_id)!;
        const remove_result = archetype.__swapRemove(location.archetype_row);

        if (remove_result.swapped_entity) {
            const { swapped_entity } = remove_result
            const swapped_location = world.entities.get(swapped_entity)!;
            world.entities.__set(index(swapped_entity), {
                archetype_id: swapped_location.archetype_id,
                archetype_row: location.archetype_row,
                table_id: swapped_location.table_id,
                table_row: swapped_location.table_row
            })
        }

        table_row = remove_result.table_row;

        for (const component_id of archetype.sparseSetComponents()) {
            const sparse_set = world
                .storages
                .sparse_sets
                .get(component_id)!;
            sparse_set.__delete(this.#entity);
        }

        moved_entity = world
            .storages
            .tables
            .get(archetype.tableId)!
            .__swapRemoveUnchecked(table_row);

        if (moved_entity) {
            const moved_location = world.entities.get(moved_entity)!;
            world.entities.__set(index(moved_entity), {
                archetype_id: moved_location.archetype_id,
                archetype_row: moved_location.archetype_row,
                table_id: moved_location.table_id,
                table_row: table_row
            })

            world
                .archetypes
                .get(moved_location.archetype_id)!
                .setEntityTableRow(moved_location.archetype_row, table_row);
        }

        world.flush();
        updateLocation(world, this.#location, this.#entity);
    }

    flush() {
        this.#world.flush();
        return this.#entity;
    }

    /**
     * Gives mutable access to this entity's `World` in a temporary scope. This is a safe alternative to `EntityWorldMut.world_mut()`
     */
    worldScope<U>(scope: (world: World) => U) {
        const w = this.#world;
        const u = scope(w);
        updateLocation(w, this.#location, this.#entity);
        return u;
    }

    updateLocation() {
        copyLoc(this.#world.entities.get(this.#entity) ?? EntityLocation.INVALID, this.#location);
    }

    isDespawned() {
        return this.#location.archetype_id === ArchetypeId.INVALID;
    }
}

function triggerOnReplaceAndOnRemoveHooksAndObservers(world: World, archetype: Archetype, entity: Entity, bundle_info: BundleInfo) {
    if (archetype.hasReplaceObserver) {
        triggerObservers(world, ON_REPLACE, entity, bundle_info.iterContributedComponents());
    }

    triggerOnReplace(world, archetype, entity, bundle_info.iterContributedComponents())

    if (archetype.hasRemoveObserver) {
        triggerObservers(world, ON_REMOVE, entity, bundle_info.iterContributedComponents());
    }

    triggerOnRemove(world, archetype, entity, bundle_info.iterContributedComponents())
}

export type TryFromFilteredError = ErrorExt<'MissingReadAllAccess'> | ErrorExt<'MissingWriteAllAccess'>;
export const TryFromFilteredError = {
    get MissingReadAllAccess() {
        return new ErrorExt('MissingReadAllAccess' as const, 'Conversion failed, filtered entity ref does not have read access to all components')
    },
    get MissingWriteAllAccess() {
        return new ErrorExt('MissingWriteAllAccess' as const, 'Conversion failed, filtered entity ref does not have write access to all components')
    }
} as const;

class RelatedSpawner<R extends Relationship> {
    // @ts-ignore
    #world: World;
    // @ts-ignore
    #R: R;
    // @ts-ignore
    #parent: Entity
    constructor(world: World, relationship: R, parent: Entity) {
        this.#world = world;
        this.#R = relationship;
        this.#parent = parent
    }
}