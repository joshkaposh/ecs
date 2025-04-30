import { iter, Iterator, Range } from "joshkaposh-iterator";
import { is_none, u32, type Option } from 'joshkaposh-option'
import type { ComponentId } from "./component";
import type { Entity, EntityLocation } from "./entity";
import type { BundleId } from './bundle';
import { type TableRow, TableId, SparseSet } from "./storage";
import { StorageType } from "./storage";
import { reserve, swap_remove, split_at, swap } from "./array-helpers";
import { entry } from "./util";
import { World } from "./world";
import { SystemMeta } from "./system";

export type ArchetypeGeneration = number;
export const ArchetypeGeneration = {
    initial() {
        return ArchetypeId.EMPTY;
    }
} as const;

export type ArchetypeId = number;
export const ArchetypeId = {
    EMPTY: 0,
    INVALID: u32.MAX,
}


export type ComponentStatus = 0 | 1;
export const ComponentStatus = {
    Added: 0,
    Existing: 1,
} as const;

export class ArchetypeAfterBundleInsert implements BundleComponentStatus {
    constructor(
        public archetype_id: ArchetypeId,
        public bundle_status: ComponentStatus[],
        public required_components: any[],
        public added: ComponentId[],
        public existing: ComponentId[],
    ) { }

    iter_inserted(): Iterator<ComponentId> {
        return iter(this.added).chain(this.existing);
    }

    iter_added(): Iterator<ComponentId> {
        return iter(this.added);
    }

    iter_existing(): Iterator<ComponentId> {
        return iter(this.existing);
    }

    get_status(index: number): ComponentStatus {
        return this.bundle_status[index];
    }
}

export type BundleComponentStatus = {
    get_status(index: number): ComponentStatus;
}

export const SpawnBundleStatus = {
    get_status(_index: number) {
        return ComponentStatus.Added
    }
} as const;

export class Edges {
    #insert_bundle: Option<ArchetypeAfterBundleInsert>[];
    #remove_bundle: Option<ArchetypeId>[]
    #take_bundle: Option<ArchetypeId>[]
    constructor(
        insert_bundle: Option<ArchetypeAfterBundleInsert>[] = [],
        remove_bundle: Option<ArchetypeId>[] = [],
        take_bundle: Option<ArchetypeId>[] = [],
    ) {
        this.#insert_bundle = insert_bundle;
        this.#remove_bundle = remove_bundle;
        this.#take_bundle = take_bundle;
    }

    get_archetype_after_bundle_insert(bundle_id: BundleId): Option<ArchetypeId> {
        return this.get_archetype_after_bundle_insert_internal(bundle_id)?.archetype_id;
    }

    get_archetype_after_bundle_insert_internal(bundle_id: BundleId): Option<ArchetypeAfterBundleInsert> {
        return this.#insert_bundle[bundle_id]
    }

    cache_archetype_after_bundle_insert(bundle_id: BundleId, archetype_id: ArchetypeId, bundle_status: ComponentStatus[], required_components: any[], added: ComponentId[], existing: ComponentId[]) {
        this.#insert_bundle[bundle_id] = new ArchetypeAfterBundleInsert(
            archetype_id,
            bundle_status,
            required_components,
            added,
            existing
        );
    }

    get_archetype_after_bundle_remove(bundle_id: BundleId): Option<ArchetypeId> {
        return this.#remove_bundle[bundle_id]
    }

    cache_archetype_after_bundle_remove(bundle_id: BundleId, archetype_id: Option<ArchetypeId>) {
        this.#remove_bundle[bundle_id] = archetype_id;
    }

    get_archetype_after_bundle_take(bundle_id: BundleId): Option<ArchetypeId> {
        return this.#take_bundle[bundle_id];
    }

    cache_archetype_after_bundle_take(bundle_id: BundleId, archetype_id: Option<ArchetypeId>) {
        this.#take_bundle[bundle_id] = archetype_id;
    }
}

export interface InternalArchetypeEntity {
    entity: Entity;
    table_row: TableRow;
    id(): Entity;
}

export class ArchetypeEntity {
    private entity: Entity;
    private table_row: TableRow;
    constructor(entity: Entity, table_row: TableRow) {
        this.entity = entity;
        this.table_row = table_row;
    }

    id() {
        return this.entity;
    }
}

type ArchetypeSwapRemoveResult = {
    swapped_entity: Option<Entity>;
    table_row: TableRow;
}

type ArchetypeComponentInfo = {
    storage_type: StorageType;
    archetype_component_id: ArchetypeComponentId;
}

export type ArchetypeRow = number;
export const ArchetypeRow = {
    INVALID: u32.MAX
} as const;

export class Archetype {
    #id: ArchetypeId;
    #table_id: TableId;
    #edges: Edges;
    #entities: InternalArchetypeEntity[];
    #components: SparseSet<ArchetypeComponentInfo>;
    #table_components: ComponentId[];
    #sparse_set_components: ComponentId[];

    constructor(
        component_index: ComponentIndex,
        id: ArchetypeId,
        table_id: TableId,
        table_components: Iterator<[ComponentId, ArchetypeComponentId]>,
        sparse_set_components: Iterator<[ComponentId, ArchetypeComponentId]>
    ) {
        const [min_table] = table_components.size_hint();
        const [min_sparse] = sparse_set_components.size_hint();
        const archetype_components = SparseSet.withCapacity<ArchetypeComponentInfo>(min_table + min_sparse);

        const table_c = [];
        const sparse_c = [];
        for (const [idx, [component_id, archetype_component_id]] of table_components.enumerate()) {
            table_c.push(component_id);

            archetype_components.set(component_id, {
                storage_type: StorageType.Table,
                archetype_component_id
            })

            entry(component_index, component_id, () => new Map()).set(component_id, { column: idx });
        }

        for (const [component_id, archetype_component_id] of sparse_set_components) {
            sparse_c.push(component_id);

            archetype_components.set(component_id, {
                storage_type: StorageType.SparseSet,
                archetype_component_id
            })

            entry(component_index, component_id, () => new Map()).set(id, { column: null })
        }

        this.#id = id;
        this.#table_id = table_id;
        this.#entities = [];
        this.#components = archetype_components.intoImmutable();
        this.#table_components = table_c;
        this.#sparse_set_components = sparse_c;
        this.#edges = new Edges();
    }

    get id(): ArchetypeId {
        return this.#id;
    }

    get tableId(): TableId {
        return this.#table_id;
    }

    /**
     * @summary Fetches the entities contained in this archetype.
     */
    get entities(): ArchetypeEntity[] {
        return this.#entities as unknown as ArchetypeEntity[];
    }

    /**
     * @description
     * Gets an iterator of all of the components stored in [`Table`]s.
     * 
     * All of the IDs are unique.
     */
    tableComponents(): Iterator<ComponentId> {
        // return this.#components.iter().filter_map(([id, component]) => component.storage_type === StorageType.Table ? id : null)
        return iter(this.#table_components);
    }

    /**
     * @description
     * Gets an iterator of all of the components stored in [`ComponentSparseSet`]s.
     * 
     * All of the IDs are unique.
     */
    sparseSetComponents(): Iterator<ComponentId> {
        // return this.#components.iter().filter_map(([id, component]) => component.storage_type === StorageType.SparseSet ? id : null)
        return iter(this.#sparse_set_components);
    }

    /**
     * @description
     * Gets an iterator of all of the components in the archetype.
     * 
     * All of the IDs are unique.
     */
    components(): Iterator<ComponentId> {
        return this.#components.keys();
    }

    __componentsArray(): ComponentId[] {
        return this.#components.inner_keys() as ComponentId[];
    }

    get component_count() {
        return this.#components.length;
    }

    __componentsWithArchetypeComponentId() {
        return this.#components.iter().map(([component_id, info]) => [component_id, info.archetype_component_id])
    }

    /**
     * @description
     * 
     * `Edges` is a Graph data structure used by internal systems for lookups of `Component`s
     * 
     * @returns Returns a reference to `Edges` of an `Archetype`.
     */
    edges(): Edges {
        return this.#edges;
    }

    get length(): number {
        return this.#entities.length;
    }

    /**
     * @returns Returns true if and only if no `Component`s are in this `Archetype`
     */
    get isEmpty(): boolean {
        return this.#entities.length === 0;
    }

    /**
     * @summary Checks if the archetype contains a specific component. This runs in `O(1)` time.
     */
    has(component_id: ComponentId): boolean {
        return this.#components.has(component_id)
    }

    /**
     * @description
     * Gets the type of storage where a component in the archetype can be found.
     * Returns `None` if the component is not part of the archetype.
     * This runs in `O(1)` time.
     */

    getStorageType(component_id: ComponentId): Option<StorageType> {
        return this.#components.get(component_id)?.storage_type
    }

    /**
     * @summary Gets the `ArchetypeComponentId` for the given `ComponentId`.
     * @returns Returns None if component is not in archetype.
     */
    getArchetypeComponentId(component_id: ComponentId): Option<ArchetypeComponentId> {
        return this.#components.get(component_id)?.archetype_component_id;
    }

    entityTableRow(row: ArchetypeRow) {
        return this.#entities[row].table_row;
    }

    setEntityTableRow(row: ArchetypeRow, table_row: TableRow) {
        this.#entities[row].table_row = table_row;
    }

    hasAddObserver() {
        return false
    }
    hasInsertObserver() {
        return false
    }
    hasReplaceObserver() {
        return false
    }
    hasRemoveObserver() {
        return false
    }

    /**
     * @summary Allocates an entity to the archetype
     * @description 
     * **Safety** - valid component values must be immediately written to the relevant storages.
     */
    // @ts-ignore
    allocate(entity: Entity, table_row: TableRow): EntityLocation {
        const archetype_row = this.#entities.length;
        this.#entities.push(new ArchetypeEntity(entity, table_row) as unknown as InternalArchetypeEntity);
        return {
            archetype_id: this.#id,
            archetype_row,
            table_id: this.#table_id,
            table_row
        }
    }

    // @ts-ignore
    private __reserve(additional: number) {
        reserve(this.#entities, additional)
    }

    /**
     * @description
     * Removes the entity at `index` by swapping it out. Returns the table row the entity is stored
     * in.
     * @throws This function will **throw** if `index >= this.len()`
     */
    // @ts-ignore
    private __swapRemove(row: ArchetypeRow): ArchetypeSwapRemoveResult {

        if (row >= this.length) {
            throw new RangeError(`index ${row} exceeds length ${this.length}`)
        }
        const last_idx = this.#entities.length - 1;
        const is_last = row === last_idx;
        const entity = swap_remove(this.#entities, row);

        // console.log('Archetype swap_remove: ', row, entity, this.#entities);

        return {
            swapped_entity: is_last ? null : this.#entities[row].entity,
            table_row: entity!.table_row
        }
    }

    // @ts-ignore
    private __clearEntities() {
        this.#entities.length = 0;
    }
}

type ArchetypeComponents = {
    table_components: ComponentId[];
    sparse_set_components: ComponentId[];
};

/// An opaque unique joint ID for a [`Component`] in an [`Archetype`] within a [`World`].
///
/// A component may be present within multiple archetypes, but each component within
/// each archetype has its own unique `ArchetypeComponentId`. This is leveraged by the system
/// schedulers to opportunistically run multiple systems in parallel that would otherwise
/// conflict. For example, `Query<&mut A, With<B>>` and `Query<&mut A, Without<B>>` can run in
/// parallel as the matched `ArchetypeComponentId` sets for both queries are disjoint, even
/// though `&mut A` on both queries point to the same [`ComponentId`].
///
/// In SQL terms, these IDs are composite keys on a [many-to-many relationship] between archetypes
/// and components. Each component type will have only one [`ComponentId`], but may have many
/// [`ArchetypeComponentId`]s, one for every archetype the component is present in. Likewise, each
/// archetype will have only one [`ArchetypeId`] but may have many [`ArchetypeComponentId`]s, one
/// for each component that belongs to the archetype.
///
/// Every [`Resource`] is also assigned one of these IDs. As resources do not belong to any
/// particular archetype, a resource's ID uniquely identifies it.
///
/// These IDs are only valid within a given World, and are not globally unique.
/// Attempting to use an ID on a world that it wasn't sourced from will
/// not point to the same archetype nor the same component.
///
/// [`Component`]: crate::component::Component
/// [`World`]: crate::world::World
/// [`Resource`]: crate::system::Resource
/// [many-to-many relationship]: https://en.wikipedia.org/wiki/Many-to-many_(data_model)
export type ArchetypeComponentId = number;

type ArchetypeRecord = {
    column: Option<number>;
}

type ComponentIndex = Map<ComponentId, Map<ArchetypeId, ArchetypeRecord>>

function hashByComponents(ident: ArchetypeComponents) {
    return `Table:${ident.table_components.join(',')}, Sparse:${ident.sparse_set_components.join(',')}` as const
}

export class Archetypes {
    #archetypes: Archetype[];
    #archetype_component_count: number;
    #by_components: Map<ReturnType<typeof hashByComponents>, ArchetypeId>;
    // #by_components: Map<ArchetypeComponents, ArchetypeId>;
    #by_component: ComponentIndex

    constructor() {
        this.#archetypes = [];
        this.#by_components = new Map();
        this.#by_component = new Map();
        this.#archetype_component_count = 0;

        this.getIdOrSet(TableId.empty, [], [])
    }

    static init_state() { }

    static get_param(_state: void, _system_meta: SystemMeta, world: World) {
        return world.archetypes;
    }

    get inner() {
        return this.#archetypes;
    }

    get generation() {
        return this.#archetypes.length;
    }

    /**
     * The total number of `Archetype`s registered to this world.
     */
    get length(): number {
        return this.#archetypes.length;
    }

    /**
     * @returns Returns a reference to the `Archetype` located at `ArchetypeId::EMPTY`
     */

    get empty(): Archetype {
        return this.#archetypes[ArchetypeId.EMPTY];
    }

    newArchetypeComponentId(): ArchetypeComponentId {
        const id = this.#archetype_component_count;
        const count = u32.checked_add(this.#archetype_component_count, 1);
        if (is_none(count)) {
            throw new Error('archetype component count overflow')
        }
        this.#archetype_component_count = count;
        return id;
    }

    /**
 * @summary Gets a reference to an `Archetype` by its `ArchetypeId`.
 * @returns Returns a reference to an `Archetype` or None if it doesn't exist.
 */
    get(archetype_id: ArchetypeId): Option<Archetype> {
        return this.#archetypes[archetype_id];
    }


    __get2Mut(a: ArchetypeId, b: ArchetypeId): [Archetype, Archetype] {
        if (a > b) {
            const [b_slice, a_slice] = split_at(this.#archetypes, a)!;
            return [a_slice[0], b_slice[b]];
        } else {
            const [a_slice, b_slice] = split_at(this.#archetypes, b)!;
            return [a_slice[a], b_slice[0]];
        }
    }

    /**
     * @returns Returns an iterator over all the `Archetype`s contained in `Archetypes`
     */
    iter(): Iterator<Archetype> {
        return iter(this.#archetypes);
    }


    /**
     * @description
     *  Gets the archetype id matching the given inputs or inserts a new one if it doesn't exist.
     * `table_components` and `sparse_set_components` must be sorted
     * 
     *  **Safety**
     * 
     * [`TableId`] must exist in tables
     */
    getIdOrSet(table_id: TableId, table_components: ComponentId[], sparse_set_components: ComponentId[]): ArchetypeId {

        const archetype_identity: ArchetypeComponents = {
            sparse_set_components: structuredClone(sparse_set_components),
            table_components: structuredClone(table_components),
        }

        const archetypes = this.#archetypes;
        const component_index = this.#by_component;

        return entry(this.#by_components, hashByComponents(archetype_identity), () => {
            const { table_components, sparse_set_components } = archetype_identity;
            const id = archetypes.length;
            const table_start = this.#archetype_component_count;
            this.#archetype_component_count += table_components.length;
            const table_archetype_components = new Range(table_start, this.#archetype_component_count);

            const sparse_start = this.#archetype_component_count;
            this.#archetype_component_count += sparse_set_components.length;
            const sparse_set_archetype_components = new Range(sparse_start, this.#archetype_component_count);
            archetypes.push(new Archetype(
                component_index,
                id,
                table_id,
                iter(table_components).zip(table_archetype_components),
                iter(sparse_set_components).zip(sparse_set_archetype_components)
            ))
            return id;
        })
    }

    componentIndex() {
        return this.#by_component;
    }

    archetypeComponentsLen() {
        return this.#archetype_component_count;
    }

    iterRange(from = 0, to = this.#archetypes.length) {
        const amount = to - from;
        return iter(this.#archetypes).skip(from).take(amount);
    }

    clearEntities() {
        for (const archetype of this.#archetypes) {
            // @ts-expect-error
            archetype.__clearEntities();
        }
    }

}