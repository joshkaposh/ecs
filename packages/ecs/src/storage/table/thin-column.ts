import { Option, TypedArray, u32, View } from "joshkaposh-option";
import { swap, swap_remove_typed, view } from "../../array-helpers";
import { debug_assert } from "../../util";
import { check_tick, ComponentTicks, Tick } from "../../tick";
import { TableRow } from "..";
import { ComponentRecord, ThinComponent } from "define";



export type TypedArrayConstructor =
    Uint8ArrayConstructor |
    Uint16ArrayConstructor |
    Uint32ArrayConstructor |
    Int8ArrayConstructor |
    Int16ArrayConstructor |
    Int32ArrayConstructor |
    // Float16ArrayConstructor |
    Float32ArrayConstructor |
    Float64ArrayConstructor;

const constructor = {
    Uint8Array,
    Uint16Array,
    Uint32Array,

    Int8Array,
    Int16Array,
    Int32Array,

    Float32Array,
    Float64Array
} as const

/**
 * pushes a value to the end of the array and reallocates if there isn't enough space.
 */
export function push<T extends View>(array: T, value: number) {
    if (array.buffer.maxByteLength - array.byteLength < array.BYTES_PER_ELEMENT) {
        const new_cap = array.buffer.maxByteLength === 0 ? 4 : array.buffer.maxByteLength * 2;
        const new_array = new constructor[array.constructor.name as keyof typeof constructor](
            new ArrayBuffer(array.byteLength + array.BYTES_PER_ELEMENT, { maxByteLength: new_cap })
        );
        return new_array as T;
    } else {
        array[array.length - 1] = value;
        return array;
    }
}

/**
 * Creates a new ArrayBuffer.
 * **Safety** - new_capacity should be immediately written.
 */
export function alloc(new_length: number, new_capacity: number) {
    return new ArrayBuffer(new_length, { maxByteLength: new_capacity });
}

export function reserve<T extends View<ArrayBuffer>>(array: T, len: number, current_capacity: number, additional: number) {
    return needsGrow(len, current_capacity, additional) ? growAmortized(array, len, current_capacity, additional, array.BYTES_PER_ELEMENT) : array;
}

export function reserve_exact<T extends View<ArrayBuffer>>(array: T, len: number, additional: number) {
    return needsGrow(len, array.buffer.maxByteLength, additional) ? growExact(array, len, additional) : array;
}

function needsGrow(len: number, current_capacity: number, additional: number) {
    return additional > u32.wrapping_sub(current_capacity, len)
}

function growAmortized<T extends View<ArrayBuffer>>(array: T, len: number, cap: number, additional: number, layout: number) {
    const required_cap = len + additional;
    let new_cap = Math.max(cap * 2, required_cap);
    new_cap = Math.max(minNonZeroCap(layout), new_cap);
    return finishGrow(array, len, new_cap)
}

function growExact<T extends View<ArrayBuffer>>(array: T, len: number, additional: number) {
    return finishGrow(array, len, len + additional)
}

function finishGrow<T extends View<ArrayBuffer>>(array: T, len: number, new_capacity: number) {
    const Ty = TypedArray[view[array.constructor.name as keyof typeof view]];
    const buf = alloc(len * Ty.BYTES_PER_ELEMENT, new_capacity * Ty.BYTES_PER_ELEMENT);
    const new_array = new Ty(buf) as T;
    new_array.buffer.resize(len * Ty.BYTES_PER_ELEMENT);
    new_array.set(array);
    return new_array;
}

function minNonZeroCap(size: number) {
    if (size === 1) {
        return 8
    } else if (size <= 1024) {
        return 4
    } else {
        return 1;
    }
}

export function swap_remove_typed_unchecked(data: View<ArrayBuffer>, index_to_remove: number, index_to_keep: number) {
    debug_assert(data.length > index_to_keep, '');
    debug_assert(data.length > index_to_remove, '');
    debug_assert(index_to_keep !== index_to_remove, '');

    return swap_remove_typed_unchecked_nonoverlapping(data, index_to_remove, index_to_keep);
}

function swap_remove_typed_unchecked_nonoverlapping(data: View<ArrayBuffer>, index_to_remove: number, index_to_keep: number) {

    swap(data, index_to_keep, index_to_remove);

    data.buffer.resize(index_to_remove * data.BYTES_PER_ELEMENT);

    return data[index_to_keep];
}

export class ThinColumn {
    data: View[];
    added_ticks: Uint32Array<ArrayBuffer>;
    changed_ticks: Uint32Array<ArrayBuffer>;
    #length: number;
    constructor(
        data: View[],
        added_ticks: Uint32Array<ArrayBuffer>,
        changed_ticks: Uint32Array<ArrayBuffer>,
        length: number,
    ) {
        this.data = data;
        this.added_ticks = added_ticks;
        this.changed_ticks = changed_ticks;
        this.#length = length;
    }

    static withCapacity(type: ThinComponent<ComponentRecord>, capacity: number) {
        const keys = type.keys;
        const data = new Array(keys.length);
        for (let i = 0; i < keys.length; i++) {
            const Ty = type[keys[i]];
            const cap = capacity * Ty.BYTES_PER_ELEMENT;
            // @ts-expect-error
            data[i] = new Ty.constructor(alloc(cap, cap));
        }

        const tick_capacity = capacity * Uint32Array.BYTES_PER_ELEMENT
        return new ThinColumn(
            data,
            new Uint32Array(alloc(tick_capacity, tick_capacity)),
            new Uint32Array(alloc(tick_capacity, tick_capacity)),
            0
        )
    }

    get length() {
        return this.#length;
    }

    /** the capacity of this Column, in bytes. */
    get capacity() {
        return this.added_ticks.buffer.maxByteLength;
    }

    push(value: number[], added: Tick, changed: Tick) {
        const index = this.#length;
        this.#length += 1;

        if (index > this.capacity) {
            this.grow(this.#length, this.capacity);
        }

        for (let i = 0; i < this.data.length; i++) {
            this.data[i][index] = value[i];
        }

        this.added_ticks[index] = added;
        this.changed_ticks[index] = changed;

        return this.#length;
    }

    getDataSlice(len: number) {
        return this.data.map(r => r.subarray(0, len))
    }

    getAddedTicksSlice(len: number) {
        return this.added_ticks.subarray(0, len);
    }

    getChangedTicksSlice(len: number) {
        return this.changed_ticks.subarray(0, len);
    }

    get(row: TableRow): Option<[number[], ComponentTicks]> {
        if (row < this.data.length) {
            return [this.data.map(r => r[row]), new ComponentTicks(this.added_ticks[row], this.changed_ticks[row])]
        } else {
            return null;
        }
    }

    getDataUnchecked(row: TableRow) {
        return this.data.map(r => r[row]);
    }

    getData(row: TableRow): Option<number[]> {
        if (row < this.data.length) {
            return this.data.map(r => r[row]);

        } else {
            return null;
        }
    }

    getAddedTick(row: number): Tick {
        return this.added_ticks[row];
    }

    getChangedTick(row: number): Tick {
        return this.changed_ticks[row]
    }

    getWithTicks(row: number): Option<[{}, ComponentTicks]> {
        const d = this.getData(row);
        const t = this.getTicks(row);

        return d && t ? [d, t] : undefined;
    }

    getTicks(row: number): Option<ComponentTicks> {
        if (row < this.data.length) {
            return this.getTicksUnchecked(row)
        } else {
            return
        }
    }

    getTicksUnchecked(row: number) {
        return new ComponentTicks(this.added_ticks[row], this.changed_ticks[row]);
    }

    swapRemoveUnchecked(row: TableRow): Option<[number[], Tick, Tick]> {
        if (this.#length === 0) {
            return;
        }

        const len = this.#length - 1;
        this.#length--;

        const d = this.data.map(r => {
            swap(r, row, len);
            return r[len];
        })


        swap(this.added_ticks, row, len);
        swap(this.changed_ticks, row, len);

        const a = this.added_ticks[len];
        const c = this.changed_ticks[len];

        return [d, a!, c!];
    }

    pop(last_element_index: number) {
        this.resize(last_element_index);
    }

    swapRemoveAndDropUncheckedNonoverlapping(last_element_index: number, row: TableRow) {
        for (let i = 0; i < this.data.length; i++) {
            swap_remove_typed_unchecked_nonoverlapping(this.data[i], row, last_element_index);
        }
        swap_remove_typed_unchecked_nonoverlapping(this.added_ticks, row, last_element_index);
        swap_remove_typed_unchecked_nonoverlapping(this.changed_ticks, row, last_element_index);
    }

    swapRemoveAndForgetUnchecked(last_element_index: number, row: TableRow) {
        for (let i = 0; i < this.data.length; i++) {
            swap_remove_typed_unchecked(this.data[i], row, last_element_index)
        }
        swap_remove_typed_unchecked(this.added_ticks, row, last_element_index)
        swap_remove_typed_unchecked(this.changed_ticks, row, last_element_index)
    }

    resize(new_length: number) {
        this.#length = new_length;
        for (let i = 0; i < this.data.length; i++) {
            const field = this.data[i];
            field.buffer.resize(new_length * field.BYTES_PER_ELEMENT);
        }

        const tick_len = new_length * Uint32Array.BYTES_PER_ELEMENT;
        this.added_ticks.buffer.resize(tick_len);
        this.changed_ticks.buffer.resize(tick_len);
    }

    grow(new_length: number, new_capacity: number) {
        this.#length = new_length
        for (let i = 0; i < this.data.length; i++) {
            const field = this.data[i];
            const Ty = constructor[field.constructor.name as keyof typeof constructor];
            const new_cap = new_capacity * Ty.BYTES_PER_ELEMENT;
            const new_field = new Ty(new ArrayBuffer(new_length * Ty.BYTES_PER_ELEMENT, { maxByteLength: new_cap }))
            new_field.set(field);
            this.data[i] = new_field;
        }

        const added_ticks = this.added_ticks;
        const changed_ticks = this.changed_ticks;

        const tick_len = new_length * Uint32Array.BYTES_PER_ELEMENT;
        const tick_cap = new_capacity * Uint32Array.BYTES_PER_ELEMENT;
        const new_added_ticks = new Uint32Array(new ArrayBuffer(tick_len, { maxByteLength: tick_cap }))
        const new_changed_ticks = new Uint32Array(new ArrayBuffer(tick_len, { maxByteLength: tick_cap }))

        new_added_ticks.set(added_ticks);
        new_changed_ticks.set(changed_ticks);

        this.added_ticks = new_added_ticks;
        this.changed_ticks = new_changed_ticks;
    }

    /**
     * Call to expand / shrink the memory allocation for this Column
     * The caller should make sure their saved capacity is updated to new_capacity after this operation
     */
    realloc(additional: number) {
        for (let i = 0; i < this.data.length; i++) {
            const field = this.data[i];
            const Ty = constructor[field.constructor.name as keyof typeof constructor];
            const additional_bytes = additional * Ty.BYTES_PER_ELEMENT;
            const new_field = new Ty(new ArrayBuffer(
                field.byteLength + additional_bytes,
                { maxByteLength: field.buffer.maxByteLength + additional_bytes }
            ));
            new_field.set(field);
            this.data[i] = new_field;
        }

        const additional_tick_bytes = additional * Uint32Array.BYTES_PER_ELEMENT
        const new_tick_capacity = this.capacity + additional_tick_bytes;

        const added_ticks = new Uint32Array(new ArrayBuffer(this.added_ticks.byteLength + additional_tick_bytes, { maxByteLength: new_tick_capacity }));
        const changed_ticks = new Uint32Array(new ArrayBuffer(this.changed_ticks.byteLength + additional_tick_bytes, { maxByteLength: new_tick_capacity }));

        added_ticks.set(this.added_ticks);
        changed_ticks.set(this.changed_ticks);

        this.added_ticks = added_ticks;
        this.changed_ticks = changed_ticks;
    }

    /**
     * Allocates a block of memory for the array. This should be used to initialize the array, do not use this method if
     * there are elements already in the array, use `realloc`.
     */
    alloc(new_capacity: number) {
        debug_assert(new_capacity > this.capacity, '');
        const tick_cap = new_capacity * Uint32Array.BYTES_PER_ELEMENT;

        // @ts-expect-error
        this.data = this.data.map(r => new r.constructor(alloc(0, new_capacity * r.BYTES_PER_ELEMENT)))
        this.added_ticks = new Uint32Array(alloc(tick_cap, tick_cap));
        this.changed_ticks = new Uint32Array(alloc(tick_cap, tick_cap));
    }

    /**
     * Writes component data to the column at the given row.
     * Assumes the slot in uninitialized
     * To overwrite existing initialized value, use Column.replace() instead
     */
    initialize(row: TableRow, data: number[], change_tick: Tick) {
        for (let i = 0; i < this.data.length; i++) {
            this.data[i][row] = data[i];
        }
        this.added_ticks[row] = change_tick;
        this.changed_ticks[row] = change_tick;
    }

    replace(row: TableRow, data: number[], change_tick: Tick) {
        for (let i = 0; i < this.data.length; i++) {
            this.data[i][row] = data[i];
        }
        this.changed_ticks[row] = change_tick;
    }

    /**
     * Removes the element from `other` at `src_row` and inserts it
     * into the current column to initialize the values at `dst_row`
     */
    initializeFromUnchecked(other: ThinColumn, other_last_element_index: number, src_row: TableRow, dst_row: TableRow) {

        for (let i = 0; i < this.data.length; i++) {
            const data = this.data[i];
            const src_val = swap_remove_typed(other.data[i], src_row)!;
            data[dst_row] = src_val;
        }

        const added_tick = swap_remove_typed(other.added_ticks, src_row)!;
        this.added_ticks[dst_row] = added_tick;
        const changed_tick = swap_remove_typed(other.changed_ticks, src_row)!;
        this.changed_ticks[dst_row] = changed_tick;
    }

    checkChangeTicks(len: number, change_tick: Tick) {
        for (let i = 0; i < len; i++) {
            check_tick(this.added_ticks[i], change_tick);
            check_tick(this.changed_ticks[i], change_tick);
        }
    }

    clear() {
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].buffer.resize(0);
        }
        this.added_ticks.buffer.resize(0);
        this.changed_ticks.buffer.resize(0);
    }
}