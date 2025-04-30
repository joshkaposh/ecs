import { Iterator, iter } from "joshkaposh-iterator";
import { type Option } from 'joshkaposh-option';
import { type Component, type ComponentId, type ComponentInfo, ComponentTicks, ThinComponentInfo, type Tick } from "../component";
import { index, type Entity, type EntityId } from "../entity";
import { Column, type TableRow } from "./table";
import { capacity, swap_remove, swap_remove_typed } from "../array-helpers";
import type { Instance } from "../util";
import { alloc, push, ThinColumn } from "./table/thin-column";

type EntityIndex = EntityId;

export interface PublicThinComponentSparseSet {
    readonly length: number;
    is_empty(): boolean;
    contains(entity: Entity): boolean;
    get(entity: Entity): Option<{}>
    get_with_ticks(): Option<[{}, ComponentTicks]>;
    getAddedTick(entity: Entity): Option<Tick>;
    getChangedTick(entity: Entity): Option<Tick>;
    get_ticks(entity: Entity): Option<ComponentTicks>;
}

export interface InternalThinComponentSparseSet extends PublicThinComponentSparseSet {
    clear(): void;
    insert(entity: Entity, value: number[], change_tick: Tick): void;
    remove_and_forget(entity: Entity): Option<{}>;
    remove(entity: Entity): Option<{}>;
    check_change_ticks(change_tick: Tick): void;
}

export class ThinComponentSparseSet {
    #dense: ThinColumn;
    #entities: Uint32Array<ArrayBuffer>;
    #sparse: Option<number>[];

    constructor(component_info: ThinComponentInfo, capacity: number) {
        this.#dense = ThinColumn.withCapacity(component_info.descriptor.type, capacity);
        this.#entities = new Uint32Array(alloc(0, capacity * Uint32Array.BYTES_PER_ELEMENT))
        this.#sparse = [];
    }

    checkChangeTicks(change_tick: Tick) {
        this.#dense.checkChangeTicks(this.#entities.length, change_tick)
    }

    get length(): number {
        return this.#dense.length;
    }

    get isEmpty(): boolean {
        return this.#dense.length === 0
    }

    clear() {
        this.#dense.clear();
        this.#entities.buffer.resize(0);
        this.#sparse.length = 0;
    }

    insert(entity: Entity, value: number[], change_tick: Tick) {
        const eid = index(entity);

        const dense_index = this.#sparse[eid];
        if (dense_index != null) {
            this.#dense.replace(dense_index, value, change_tick);
        } else {
            const dense_index = this.#dense.length;
            this.#dense.push(value, change_tick, change_tick);
            this.#sparse[eid] = dense_index;
            this.#entities = push(this.#entities, eid);
            const len = this.#entities.length;
            this.#entities.buffer.resize(len * this.#entities.BYTES_PER_ELEMENT)
            this.#entities[len] = index(entity);
        }
    }

    /**
     * Returns true if `ComponentSparseSet` contains the given entity.
     */
    has(entity: Entity): boolean {
        return this.#sparse[index(entity)] != null
    }

    // returns a reference to the entity's component value,
    // or none if entity doesn not have a component in the sparse set
    get(entity: Entity): Option<{}> {
        const dense_index = this.#sparse[index(entity)];
        return dense_index != null ? this.#dense.getDataUnchecked(dense_index) : undefined
    }

    get_with_ticks<T extends Component>(entity: Entity): Option<[InstanceType<T>, ComponentTicks]> {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return;
        }
        const dense = this.#dense;
        return [
            dense.getDataUnchecked(dense_index) as InstanceType<T>,
            new ComponentTicks(dense.getAddedTick(dense_index)!, dense.getChangedTick(dense_index)!)
        ]
    }

    getAddedTick(entity: Entity) {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return
        }

        return this.#dense.getAddedTick(index(entity));
    }

    getChangedTick(entity: Entity) {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return
        }

        return this.#dense.getChangedTick(index(entity));
    }

    getTicks(entity: Entity) {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return
        }
        return this.#dense.getTicksUnchecked(dense_index);
    }

    removeAndForget(entity: Entity) {
        const i = index(entity);
        const dense_index = this.#sparse[i];
        this.#sparse[i] = null;
        if (dense_index == null) {
            return

        }

        swap_remove_typed(this.#entities, dense_index);
        const is_last = dense_index === this.#dense.length - 1;
        const [value] = this.#dense.swapRemoveUnchecked(dense_index) as any
        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse[index] = dense_index;
        }

        return value;
    }

    remove(entity: Entity) {
        const i = index(entity);
        const dense_index = this.#sparse[i];
        this.#sparse[i] = null;

        if (dense_index == null) {
            return false
        }

        swap_remove_typed(this.#entities, dense_index)
        const is_last = dense_index === this.#dense.length - 1;

        this.#dense.swapRemoveUnchecked(dense_index);

        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse[index] = dense_index;
        }

        return true;
    }

    iter() {
        return this.#dense.data
    }
}

// a sparse data structure of Component(s)
// Designed for relatively fast insertions and deletions
export class ComponentSparseSet {
    #dense: Column;
    #entities: EntityIndex[];
    #sparse: Option<TableRow>[]

    constructor(_component_info: ComponentInfo, capacity: number) {
        this.#dense = new Column();
        this.#entities = new Array(capacity);
        this.#sparse = [];
    }

    checkChangeTicks(change_tick: Tick) {
        this.#dense.checkChangeTicks(this.#entities.length, change_tick)
    }

    get length(): number {
        return this.#dense.length
    }

    get isEmpty(): boolean {
        return this.#dense.length === 0
    }

    clear() {
        this.#dense.clear();
        this.#entities.length = 0;
        this.#sparse.length = 0;
    }

    // @ts-ignore
    private __set(entity: Entity, value: {}, change_tick: Tick) {
        const i = index(entity);
        const dense_index = this.#sparse[i];
        if (dense_index != null) {
            // @ts-expect-error
            this.#dense.__replace(dense_index, value, change_tick);
        } else {
            const dense_index = this.#dense.length;
            // @ts-expect-error
            this.#dense.__push(value, ComponentTicks.new(change_tick));
            this.#sparse[i] = dense_index;
            this.#entities.push(i);
        }
    }

    /**
     * Returns true if `ComponentSparseSet` contains the given entity.
     */
    contains(entity: Entity): boolean {
        return this.#sparse[index(entity)] != null;
    }

    // returns a reference to the entity's component value,
    // or none if entity doesn not have a component in the sparse set
    get(entity: Entity): Option<{}> {
        const dense_index = this.#sparse[index(entity)];
        return dense_index != null ? this.#dense.getDataUnchecked(dense_index) : undefined
    }

    getWithTicks<T extends Component>(entity: Entity): Option<[InstanceType<T>, ComponentTicks]> {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return;
        }
        const dense = this.#dense;
        return [
            dense.getDataUnchecked(dense_index) as InstanceType<T>,
            new ComponentTicks(dense.getAddedTick(dense_index)!, dense.getChangedTick(dense_index)!)
        ]
    }

    getAddedTick(entity: Entity) {
        const i = index(entity)
        const dense_index = this.#sparse[i];
        if (dense_index == null) {
            return
        }

        return this.#dense.getAddedTick(i)!;
    }


    getChangedTick(entity: Entity) {
        const i = index(entity)
        const dense_index = this.#sparse[i];
        if (dense_index == null) {
            return
        }

        return this.#dense.getChangedTick(i);
    }

    getTicks(entity: Entity) {
        const dense_index = this.#sparse[index(entity)];
        if (dense_index == null) {
            return
        }
        return this.#dense.getTicksUnchecked(dense_index);
    }

    // @ts-ignore
    private __deleteAndForget(entity: Entity) {
        const i = index(entity);
        const dense_index = this.#sparse[i];
        this.#sparse[i] = null;
        if (dense_index == null) {
            return

        }
        swap_remove(this.#entities, dense_index);
        const is_last = dense_index === this.#dense.length - 1;
        // @ts-expect-error
        const [value] = this.#dense.__swap_remove_unchecked(dense_index) as any
        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse[index] = dense_index
        }

        return value;
    }

    // @ts-ignore
    private __delete(entity: Entity) {
        const i = index(entity)
        const dense_index = this.#sparse[i];
        this.#sparse[i] = null;

        if (dense_index == null) {
            return false
        }

        swap_remove(this.#entities, dense_index)
        const is_last = dense_index === this.#dense.length - 1;

        // @ts-expect-error
        this.#dense.__swapRemoveUnchecked(dense_index);

        if (!is_last) {
            const index = this.#entities[dense_index];
            this.#sparse[index] = dense_index;
        }

        return true;
    }
}

export class ThinSparseSet<T> {
    #dense: T[];
    #indices: Uint32Array<ArrayBuffer>;
    #sparse: Option<number>[];

    constructor(
        dense: T[] = [],
        indices: Uint32Array<ArrayBuffer> = new Uint32Array(alloc(0, 0)),
        sparse: number[] = [],
    ) {
        this.#dense = dense;
        this.#indices = indices;
        this.#sparse = sparse;
    }

    static withCapacity<T>(capacity: number): ThinSparseSet<T> {
        const cap = Math.min(capacity, 4) * Uint32Array.BYTES_PER_ELEMENT;
        return new ThinSparseSet<T>(
            [],
            new Uint32Array(alloc(cap, cap)),
            []
        )
    }

    intoImmutable() {
        Object.freeze(this.#dense);
        Object.freeze(this.#indices);
        Object.freeze(this.#sparse);
        return this;
    }

    get length() {
        return this.#dense.length;
    }

    get isEmpty() {
        return this.#dense.length === 0
    }

    get capacity() {
        return capacity(this.#dense.length);
    }

    set(index: number, value: T) {
        const dense_index = this.#sparse[index];

        if (dense_index != null) {
            this.#dense[dense_index] = value;
        } else {
            this.#sparse[index] = this.#dense.length;
            this.#dense.push(value);
            this.#indices = push(this.#indices, index);
        }
    }

    getOrSetWith(index: number, func: () => T) {
        const dense_index = this.#sparse[index];
        if (dense_index != null) {
            return this.#dense[dense_index]
        } else {
            const value = func();
            const dense_index = this.length;
            this.#sparse[index] = dense_index;
            this.#indices = push(this.#indices, index);
            this.#dense[this.length] = value;
            return this.#dense[dense_index];
        }
    }

    delete(index: number) {
        const dense_index = this.#sparse[index];
        this.#sparse[index] = null;

        if (dense_index != null) {
            const index = dense_index;
            const is_last = index === this.#dense.length - 1;
            const value = swap_remove(this.#dense, index);
            swap_remove_typed(this.#indices, index);
            if (!is_last) {
                const swapped_index = this.#indices[index];
                this.#sparse[swapped_index] = dense_index;
            }
            return value;
        } else {
            return null;
        }
    }

    clear() {
        this.#dense.length = 0;
        this.#indices.buffer.resize(0);
        this.#sparse.length = 0;
    }

    has(index: number) {
        return this.#sparse[index] != null;
    }

    get(index: number) {
        const dense_index = this.#sparse[index];
        return dense_index != null ? this.#dense[dense_index] : null
    }

    getMut(index: number) {
        const dense_index = this.#sparse[index];
        return dense_index != null ? this.#dense[dense_index] : null
    }

    // returns an iterator of indices in arbitrary order
    keys(): Iterator<number> {
        return iter(this.#indices);
    }

    inner_keys() {
        return this.#indices;
    }

    // returns an iterator of values in arbitrary order
    values(): Iterator<T> {
        return iter(this.#dense);
    }

    inner_values() {
        return this.#dense;
    }

    iter(): Iterator<[number, T]> {
        return iter(this.#indices).zip(this.#dense);
    }

    forEach(callback: (index: number, value: T) => void) {
        this.#indices.forEach(i => callback(i, this.#dense[i]))
    }

    [Symbol.iterator]() {
        return this.iter();
    }
}

export class SparseSet<T> {
    #dense: T[] | readonly T[];
    #indices: number[] | readonly number[];
    #sparse: Option<number>[] | readonly Option<number>[];
    constructor(indices: number[] | readonly number[] = [], dense: T[] | readonly T[] = [], sparse: Option<number>[] | readonly Option<number>[] = []) {
        this.#indices = indices
        this.#dense = dense;
        this.#sparse = sparse;
    }

    static withCapacity<T>(_capacity: number) {
        // TODO: create with capacity to increase performance (reduce array resizes)
        return new SparseSet<T>([], [], []);
    }

    intoImmutable(): SparseSet<T> {
        return new SparseSet<T>(Object.freeze(this.#indices), Object.freeze(this.#dense), Object.freeze(this.#sparse))
    }

    get capacity() {
        return this.#dense.length;
    }

    get length(): number {
        return this.#dense.length;
    }

    get isEmpty(): boolean {
        return this.#dense.length === 0
    }

    has(index: number): boolean {
        return this.#sparse[index] != null;
    }

    set(index: number, value: T) {
        const dense_index = this.#sparse[index];
        if (dense_index != null) {
            // @ts-expect-error
            this.#dense[dense_index] = value
        } else {
            // @ts-expect-error
            this.#sparse[index] = this.#dense.length;
            // @ts-expect-error
            this.#indices.push(index);
            // @ts-expect-error
            this.#dense.push(value);
        }
    }

    getOrSetWith(index: number, func: () => T): Instance<T> {
        const dense_index = this.#sparse[index];
        if (dense_index != null) {
            return this.#dense[dense_index] as Instance<T>;
        } else {
            const value = func();
            const dense_index = this.#dense.length
            // @ts-expect-error
            this.#sparse[index] = dense_index;
            // @ts-expect-error
            this.#indices.push(index)
            // @ts-expect-error
            this.#dense.push(value);
            return this.#dense[dense_index] as Instance<T>;
        }
    }

    get(index: number): Option<T> {
        const dense_index = this.#sparse[index];
        return dense_index != null ? this.#dense[dense_index] : null
    }

    getMut(index: number): Option<T> {
        const dense_index = this.#sparse[index];
        return dense_index != null ? this.#dense[dense_index] : null
    }

    delete(index: number): Option<T> {
        const dense_index = this.#sparse[index];
        // @ts-expect-error
        this.#sparse[index] = null;
        if (dense_index != null) {
            const index = dense_index;
            const is_last = index === this.#dense.length - 1;
            // @ts-expect-error
            const value = swap_remove(this.#dense, index);
            // @ts-expect-error
            swap_remove(this.#indices, index);
            if (!is_last) {
                const swapped_index = this.#indices[index];
                // @ts-expect-error
                this.#sparse[swapped_index] = dense_index;
            }

            return value;
        } else {
            return null;
        }
    }

    clear() {
        // @ts-expect-error
        this.#dense.length = 0;
        // @ts-expect-error
        this.#indices.length = 0;
        // @ts-expect-error
        this.#sparse.length = 0;
    }

    /**
     * @returns an iterator of indices in arbitrary order.
     */
    keys(): Iterator<number> {
        return iter(this.#indices);
    }

    inner_keys() {
        return this.#indices
    }

    /**
     * @returns an iterator of values in arbitrary order.
     */
    values(): Iterator<T> {
        return iter(this.#dense)
    }

    inner_values() {
        return this.#dense;
    }

    iter(): Iterator<[number, T]> {
        return iter(this.#indices).zip(this.#dense);
    }

    forEach(callback: (index: number, value: T) => void) {
        const indices = this.#indices;
        const dense = this.#dense;
        for (let i = 0; i < indices.length; i++) {
            callback(indices[i], dense[i])
        }
    }
}

export class ThinSparseSets {
    #sets: ThinSparseSet<ThinComponentSparseSet>;
    constructor(sets: ThinSparseSet<ThinComponentSparseSet> = new ThinSparseSet()) {
        this.#sets = sets;
    }

    get length() {
        return this.#sets.length
    }

    get isEmpty() {
        return this.#sets.isEmpty;
    }

    checkChangeTicks(change_tick: Tick) {
        const dense = this.#sets.inner_values();
        for (let i = 0; i < dense.length; i++) {
            dense[i].checkChangeTicks(change_tick);
        }
    }

    iter() {
        return this.#sets.iter();
    }

    get(index: number) {
        return this.#sets.get(index);
    }

    getOrSet(component_info: ThinComponentInfo) {
        if (!this.#sets.has(component_info.id)) {
            const s = new ThinComponentSparseSet(component_info, 64)
            this.#sets.set(component_info.id, s);
            return s;
        }

        return this.#sets.get(component_info.id)!;
    }

    clearEntities() {
        const dense = this.#sets.inner_values();
        for (let i = 0; i < dense.length; i++) {
            dense[i].clear();
        }
    }
}

export class SparseSets {
    #sets: SparseSet<ComponentSparseSet>;
    constructor() {
        this.#sets = new SparseSet();
    }

    get length(): number {
        return this.#sets.length;
    }

    get isEmpty(): boolean {
        return this.#sets.isEmpty;
    }

    checkChangeTicks(change_tick: Tick) {
        const values = this.#sets.inner_values();
        for (let i = 0; i < values.length; i++) {
            values[i].checkChangeTicks(change_tick);
        }
    }

    get(component_id: ComponentId): Option<ComponentSparseSet> {
        return this.#sets.get(component_id);
    }

    __getOrSet(component_info: ComponentInfo): ComponentSparseSet {
        if (!this.#sets.has(component_info.id)) {
            const s = new ComponentSparseSet(component_info, 64)
            this.#sets.set(
                component_info.id,
                s
            );
            return s;
        }

        return this.#sets.get(component_info.id)!;
    }

    clearEntities() {
        const values = this.#sets.inner_values();
        for (let i = 0; i < values.length; i++) {
            values[i].clear();
        }
    }

    iter(): Iterator<[ComponentId, ComponentSparseSet]> {
        return this.#sets.iter();
    }
}
