import { Option } from "joshkaposh-option";
import { TableRow } from "./index";
import { check_tick_and_assign, ComponentTicks, Tick } from "../../tick";
import { swap, swap_remove } from "../../array-helpers";
import { debug_assert } from "../../util";

function swapRemoveUnchecked(data: any[], index_to_remove: number, index_to_keep: number) {
    debug_assert(data.length > index_to_keep, '')
    debug_assert(data.length > index_to_remove, '')

    if (index_to_remove !== index_to_keep) {
        return swapRemoveUncheckedNonoverlapping(data, index_to_remove, index_to_keep);
    } else {
        swap_remove(data, index_to_remove);
    }

    return data[index_to_keep];
}

function swapRemoveUncheckedNonoverlapping(data: any[], index_to_remove: number, index_to_keep: number) {
    debug_assert(data.length > index_to_keep, '');
    debug_assert(data.length > index_to_remove, '');
    debug_assert(index_to_remove !== index_to_keep, '');

    swap(data, index_to_keep, index_to_remove);
    data.pop();
    return data[index_to_keep];
}

export class Column {
    data: {}[];
    ticks: ComponentTicks[]
    // added_ticks: Tick[];
    // changed_ticks: Tick[];


    constructor(
        data: {}[] = [],
        ticks: ComponentTicks[] = []
        // added_ticks: Tick[] = [],
        // changed_ticks: Tick[] = []
    ) {
        this.data = data;
        this.ticks = ticks;
        // this.added_ticks = added_ticks;
        // this.changed_ticks = changed_ticks;
    }

    /**
     * Is true if no components are in this [`Column`].
     */
    get isEmpty() {
        return this.data.length === 0;
    }

    /**
     * The total amount of components in this [`Column`].
     */
    get length() {
        return this.data.length;
    }

    __push(ptr: {}, ticks: ComponentTicks) {
        this.data.push(ptr);
        this.ticks.push(ticks);
        // this.added_ticks.push(ticks.added);
        // this.changed_ticks.push(ticks.changed);
    }

    getDataSlice(_len: number) {
        return this.data;
    }

    getTicksSlice(_len: number) {
        return this.ticks;
    }

    // getAddedTicksSlice(_len: number) {
    //     return this.added_ticks;
    //     // return this.added_ticks.slice(0, len);
    // }

    // getChangedTicksSlice(_len: number) {
    //     return this.changed_ticks;
    //     // return this.changed_ticks.slice(0, len);
    // }

    get(row: TableRow): Option<[{}, ComponentTicks]> {
        if (row < this.data.length) {
            return [this.data[row], this.ticks[row]]
        } else {
            return null;
        }
    }

    getDataUnchecked(row: TableRow) {
        return this.data[row]
    }

    getData(row: TableRow): Option<{}> {
        if (row < this.data.length) {
            return this.data[row]

        } else {
            return null;
        }
    }

    getAddedTick(row: number): Option<Tick> {
        return this.ticks[row]?.added;
    }

    getChangedTick(row: number): Option<Tick> {
        return this.ticks[row]?.changed;
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
        return this.ticks[row];
    }

    __swapRemoveUnchecked(row: TableRow): Option<[{}, ComponentTicks]> {
        const d = swap_remove(this.data, row)
        const t = swap_remove(this.ticks, row);

        return d == null ? undefined : [d, t!];

    }

    pop(_last_element_index: number) {
        this.data.pop();
        this.ticks.pop();
        // this.added_ticks.pop();
        // this.changed_ticks.pop();
    }

    __swapRemoveAndDropUncheckedNonoverlapping(last_element_index: number, row: TableRow) {
        swapRemoveUncheckedNonoverlapping(this.data, row, last_element_index);
        swapRemoveUncheckedNonoverlapping(this.ticks, row, last_element_index);
        // swapRemoveUncheckedNonoverlapping(this.added_ticks, row, last_element_index);
        // swapRemoveUncheckedNonoverlapping(this.changed_ticks, row, last_element_index);
    }

    __swapRemoveAndForgetUnchecked(last_element_index: number, row: TableRow) {
        swapRemoveUnchecked(this.data, row, last_element_index);
        swapRemoveUnchecked(this.ticks, row, last_element_index);

        // swapRemoveUnchecked(this.added_ticks, row, last_element_index)
        // swapRemoveUnchecked(this.changed_ticks, row, last_element_index)
    }

    /**
     * Call to expand / shrink the memory allocation for this Column
     * The caller should make sure their saved capacity is updated to new_capacity after this operation
     */
    __realloc(_current_capacity: number, _new_capacity: number) {
        // realloc(this.data, current_capacity, new_capacity)
        // realloc(this.added_ticks, current_capacity, new_capacity)
        // realloc(this.changed_ticks, current_capacity, new_capacity)
    }

    __alloc(_new_capacity: number) {
        // alloc(this.data, new_capacity)
        // alloc(this.added_ticks, new_capacity)
        // alloc(this.changed_ticks, new_capacity)
    }

    /**
     * Writes component data to the column at the given row.
     * Assumes the slot in uninitialized
     * To overwrite existing initialized value, use Column.replace() instead
     */
    __initialize(row: TableRow, data: {}, change_tick: Tick) {
        this.data[row] = data;
        this.ticks[row] = new ComponentTicks(change_tick, change_tick);
        // this.added_ticks[row] = change_tick;
        // this.changed_ticks[row] = change_tick;
    }
    __replace(row: TableRow, data: {}, change_tick: Tick) {
        this.data[row] = data;
        const ticks = this.ticks[row];
        ticks.added = change_tick;
        ticks.changed = change_tick;
    }

    /**
     * Removes the element from `other` at `src_row` and inserts it
     * into the current column to initialize the values at `dst_row`
     */
    __initializeFromUnchecked(other: Column, _other_last_element_index: number, src_row: TableRow, dst_row: TableRow) {
        // Init data

        this.data[dst_row] = swap_remove(other.data, src_row)!;
        this.ticks[dst_row] = swap_remove(other.ticks, src_row)!
        // const added_tick = swap_remove(other.added_ticks, src_row)!;
        // this.added_ticks[dst_row] = added_tick;
        // const changed_tick = swap_remove(other.changed_ticks, src_row)!;
        // this.changed_ticks[dst_row] = changed_tick;
    }

    checkChangeTicks(len: number, change_tick: Tick) {
        const ticks = this.ticks;
        for (let i = 0; i < len; i++) {
            const tick = ticks[i];
            tick.added = check_tick_and_assign(tick.added, change_tick);
            tick.changed = check_tick_and_assign(tick.changed, change_tick);
        }
    }

    clear() {
        this.data.length = 0;
        this.ticks.length = 0;
        // this.added_ticks.length = 0;
        // this.changed_ticks.length = 0;
    }
    __reserve_exact(_additional: number) {
        // reserve(this.data,ca additional);
    }

}