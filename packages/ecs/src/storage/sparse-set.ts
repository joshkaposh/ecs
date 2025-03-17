import { Iterator, iter } from "joshkaposh-iterator";
import type { Option } from 'joshkaposh-option';
import { type Component, type ComponentId, type ComponentInfo, ComponentTicks, type Tick, TickCells } from "../component";
import { index, type Entity, type EntityId } from "../entity";
import { Column, type TableRow } from "./table";
import { swap_remove } from "../array-helpers";
import type { Instance } from "../util";

type EntityIndex = EntityId;

export class SparseArray<I extends number, V extends any> {
    #values: Option<V>[];

    constructor(values: Option<V>[] = []) {
        this.#values = values;
    }

    into_immutable() {
        // @ts-expect-error
        return new SparseArray(Object.freeze(this.#values))
    }

    contains(index: I): boolean {
        return this.#values[index] != null
    }

    get(index: I): Option<V> {
        return this.#values[index];
    }

    insert(index: I, value: V) {
        if (index >= this.#values.length) {
            // resize_with(index + 1, || None)
            const diff = Math.max(this.#values.length - index, 0);
            this.#values.length += diff + 1;
        }
        this.#values[index] = value;
    }

    remove(index: I): Option<V> {
        const v = this.#values[index];
        this.#values[index] = null;
        return v;
    }

    clear() {
        this.#values.length = 0;
    }
}

// a sparse data structure of Component(s)
// Designed for relatively fast insertions and deletions
export class ComponentSparseSet {
    #dense: Column;
    #entities: EntityIndex[];
    #sparse: SparseArray<EntityIndex, TableRow>

    constructor(_component_info: ComponentInfo, capacity: number) {
        this.#dense = Column.default();
        this.#entities = new Array(capacity);
        this.#sparse = new SparseArray();
    }

    check_change_ticks(change_tick: Tick) {
        this.#dense.check_change_ticks(this.#entities.length, change_tick)
    }

    len(): number {
        return this.#dense.len()
    }

    is_empty(): boolean {
        return this.#dense.len() === 0
    }

    clear() {
        this.#dense.clear();
        this.#entities.length = 0;
        this.#sparse.clear();
    }

    // @ts-ignore
    private __insert(entity: Entity, value: {}, change_tick: Tick) {
        const dense_index = this.#sparse.get(index(entity));
        if (dense_index != null) {
            // @ts-expect-error
            this.#dense.__replace(dense_index, value, change_tick);
        } else {
            const dense_index = this.#dense.len();
            // @ts-expect-error
            this.#dense.__push(value, ComponentTicks.new(change_tick));
            this.#sparse.insert(index(entity), dense_index);
            this.#entities.push(index(entity));
        }
    }

    /**
     * Returns true if `ComponentSparseSet` contains the given entity.
     */
    contains(entity: Entity): boolean {
        return this.#sparse.contains(index(entity))
    }

    // returns a reference to the entity's component value,
    // or none if entity doesn not have a component in the sparse set
    get(entity: Entity): Option<{}> {
        const dense_index = this.#sparse.get(index(entity));
        return dense_index != null ? this.#dense.get_data_unchecked(dense_index) : undefined
    }

    get_with_ticks<T extends Component>(entity: Entity): Option<[InstanceType<T>, TickCells]> {
        const dense_index = this.#sparse.get(index(entity));
        if (dense_index == null) {
            return;
        }
        const dense = this.#dense;
        return [
            dense.get_data_unchecked(dense_index) as InstanceType<T>,
            new TickCells(dense.get_added_tick(dense_index)!, dense.get_changed_tick(dense_index)!)
        ]
    }

    get_added_tick(entity: Entity) {
        const dense_index = this.#sparse.get(index(entity));
        if (dense_index == null) {
            return
        }

        return this.#dense.get_added_tick(index(entity));
    }


    get_changed_tick(entity: Entity) {
        const dense_index = this.#sparse.get(index(entity));
        if (dense_index == null) {
            return
        }

        return this.#dense.get_changed_tick(index(entity));
    }

    get_ticks(entity: Entity) {
        const dense_index = this.#sparse.get(index(entity));
        if (dense_index == null) {
            return
        }
        return this.#dense.get_ticks_unchecked(dense_index);
    }

    // @ts-ignore
    private __remove_and_forget(entity: Entity) {
        const dense_index = this.#sparse.remove(index(entity))
        if (dense_index == null) {
            return

        }
        swap_remove(this.#entities, dense_index);
        const is_last = dense_index === this.#dense.len() - 1;
        // @ts-expect-error
        const [value] = this.#dense.__swap_remove_unchecked(dense_index) as any
        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse.insert(index, dense_index)
        }

        return value;
    }

    // @ts-ignore
    private __remove(entity: Entity) {
        const dense_index = this.#sparse.remove(index(entity));

        if (dense_index == null) {
            return false
        }

        swap_remove(this.#entities, dense_index)
        const is_last = dense_index === this.#dense.len() - 1;

        // @ts-expect-error
        this.#dense.__swap_remove_unchecked(dense_index);

        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse.insert(index, dense_index);
        }

        return true;
    }
}

export class SparseSet<I extends number, V> {
    #dense: V[];
    #indices: I[];
    #sparse: SparseArray<I, number>;
    constructor(indices: I[] = [], dense: V[] = [], sparse: SparseArray<I, number> = new SparseArray()) {
        this.#indices = indices
        this.#dense = dense;
        this.#sparse = sparse;
    }

    static default<I extends number, V>(): SparseSet<I, V> {
        return new SparseSet<I, V>([], [], new SparseArray())
    }

    // @ts-ignore
    static with_capacity<I extends number, V>(capacity: number) {
        // TODO: create with capacity to increase performance (reduce array resizes)
        return new SparseSet<I, V>([], [], new SparseArray());
        // return new SparseSet(new Array(capacity), new Array(capacity), new SparseArray())
    }

    into_immutable(): SparseSet<I, V> {
        return new SparseSet<I, V>(Object.freeze(this.#indices) as I[], Object.freeze(this.#dense) as V[], this.#sparse.into_immutable())
    }

    capacity() {
        return this.#dense.length;
    }

    insert(index: I, value: V) {
        const dense_index = this.#sparse.get(index);
        if (dense_index != null) {
            this.#dense[dense_index] = value
        } else {
            this.#sparse.insert(index, this.#dense.length)
            this.#indices.push(index);
            this.#dense.push(value)
        }
    }

    get_or_insert_with(index: I, func: () => V): Instance<V> {
        const dense_index = this.#sparse.get(index);
        if (dense_index != null) {
            return this.#dense[dense_index] as Instance<V>;
        } else {
            const value = func();
            const dense_index = this.#dense.length
            this.#sparse.insert(index, dense_index);
            this.#indices.push(index)
            this.#dense.push(value);
            return this.#dense[dense_index] as Instance<V>;
        }
    }

    get length(): number {
        return this.#dense.length;
    }

    is_empty(): boolean {
        return this.#dense.length === 0
    }

    remove(index: I): Option<V> {
        const dense_index = this.#sparse.remove(index)
        if (dense_index != null) {
            const index = dense_index;
            const is_last = index === this.#dense.length - 1;
            const value = swap_remove(this.#dense, index);
            swap_remove(this.#indices, index);
            if (!is_last) {
                const swapped_index = this.#indices[index];
                this.#sparse.insert(swapped_index, dense_index)
            }
            return value;
        } else {
            return null;
        }
    }

    clear() {
        this.#dense.length = 0;
        this.#indices.length = 0;
        this.#sparse.clear();
    }

    contains(index: I): boolean {
        return this.#sparse.contains(index);
    }

    get(index: I): Option<V> {
        const dense_index = this.#sparse.get(index);
        return dense_index != null ? this.#dense[dense_index] : null
    }

    get_mut(index: I): Option<V> {
        const dense_index = this.#sparse.get(index);
        return dense_index != null ? this.#dense[dense_index] : null
    }


    // returns an iterator of indices in arbitrary order
    indices(): Iterator<I> {
        return iter(this.#indices);
    }

    __indices_array() {
        return this.#indices
    }

    // returns an iterator of values in arbitrary order
    values(): Iterator<V> {
        return iter(this.#dense)
    }

    __values_array() {
        return this.#dense;
    }

    iter(): Iterator<[I, V]> {
        return iter(this.#indices).zip(this.#dense);
    }

    for_each(callback: (index: I, value: V) => void) {
        const indices = this.#indices;
        const dense = this.#dense;
        for (let i = 0; i < indices.length; i++) {
            callback(indices[i], dense[i])
        }
    }
}

export class SparseSets {
    #sets: SparseSet<ComponentId, ComponentSparseSet>;
    constructor() {
        this.#sets = SparseSet.default();
    }

    static default() {
        return new SparseSets()
    }

    check_change_ticks(change_tick: Tick) {
        this.#sets.values().for_each((s) => s.check_change_ticks(change_tick));
    }

    get length(): number {
        return this.#sets.length;
    }

    is_empty(): boolean {
        return this.#sets.is_empty();
    }

    iter(): Iterator<[ComponentId, ComponentSparseSet]> {
        return this.#sets.iter()
    }

    get(component_id: ComponentId): Option<ComponentSparseSet> {
        return this.#sets.get(component_id);
    }

    __get_or_insert(component_info: ComponentInfo): ComponentSparseSet {
        if (!this.#sets.contains(component_info.id())) {
            const s = new ComponentSparseSet(component_info, 64)
            this.#sets.insert(
                component_info.id(),
                s
            );
            return s;
        }

        return this.#sets.get(component_info.id())!;
    }

    __clear_entities() {
        const values = this.#sets.__values_array();
        for (let i = 0; i < values.length; i++) {
            values[i].clear();
        }
    }
}
