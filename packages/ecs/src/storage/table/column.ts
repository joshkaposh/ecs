import { Option } from "joshkaposh-option";
import { Table, TableRow } from ".";
import { ComponentTicks, Tick } from "../..";
import { capacity, replace, reserve, swap, swap_remove } from "../../array-helpers";
import { debug_assert } from "../../util";
import { TODO } from "joshkaposh-iterator/src/util";
import { iter } from "joshkaposh-iterator";

function alloc(array: any[], new_capacity: number) {
    TODO('alloc', array, new_capacity)
}

function realloc(array: any[], current_capacity: number, new_capacity: number) {
    TODO('realloc()', array, current_capacity, new_capacity)
}

function swap_remove_unchecked(data: any[], index_to_remove: number, index_to_keep: number) {
    debug_assert(capacity(data.length) > index_to_keep)
    debug_assert(capacity(data.length) > index_to_remove)

    if (index_to_remove !== index_to_keep) {
        return swap_remove_unchecked_nonoverlapping(data, index_to_remove, index_to_keep);
    } else {
        swap_remove(data, index_to_remove);
    }

    return data[index_to_keep];
}

function swap_remove_unchecked_nonoverlapping(data: any[], index_to_remove: number, index_to_keep: number) {
    debug_assert(capacity(data.length) > index_to_keep);
    debug_assert(capacity(data.length) > index_to_remove);
    debug_assert(index_to_remove !== index_to_keep);

    swap(data, index_to_keep, index_to_remove);
    data.pop();
    return data[index_to_keep];
}

export class Column {

    constructor(public data: {}[], public added_ticks: Tick[], public changed_ticks: Tick[]) { }

    static default() {
        return new Column([], [], []);
    }

    is_empty() {
        return this.data.length === 0;
    }

    len() {
        return this.data.length;
    }

    private __push(ptr: {}, ticks: ComponentTicks) {
        this.data.push(ptr);
        this.added_ticks.push(ticks.added);
        this.changed_ticks.push(ticks.changed);
    }

    get_data_slice(len: number) {
        return this.data.slice(0, len);
    }

    get_added_ticks_slice(len: number) {
        return this.added_ticks.slice(0, len);
    }

    get_changed_ticks_slice(len: number) {
        return this.changed_ticks.slice(0, len);
    }

    get(row: TableRow): Option<[{}, ComponentTicks]> {
        if (row < this.data.length) {
            return [this.data[row], new ComponentTicks(this.added_ticks[row], this.changed_ticks[row])]
        } else {
            return null;
        }
    }

    get_data_unchecked(row: TableRow) {
        return this.data[row]
    }

    get_data(row: TableRow): Option<{}> {
        if (row < this.data.length) {
            return this.data[row]

        } else {
            return null;
        }
    }

    get_added_tick(row: number): Option<Tick> {
        return this.added_ticks[row];
    }

    get_changed_tick(row: number): Option<Tick> {
        return this.changed_ticks[row]
    }

    get_with_ticks(row: number): Option<[{}, ComponentTicks]> {
        const d = this.get_data(row);
        const t = this.get_ticks(row);

        return d && t ? [d, t] : undefined;
    }

    get_ticks(row: number): Option<ComponentTicks> {
        if (row < this.data.length) {
            return this.get_ticks_unchecked(row)
        } else {
            return
        }
    }

    get_ticks_unchecked(row: number) {
        return new ComponentTicks(this.added_ticks[row], this.changed_ticks[row]);
    }

    private __swap_remove_unchecked(row: TableRow) {
        swap_remove(this.data, row)
        swap_remove(this.added_ticks, row)
        swap_remove(this.changed_ticks, row)
    }

    private __drop_last_component(last_element_index: number) {
        this.data.pop();
        this.added_ticks.pop();
        this.changed_ticks.pop();
    }

    private __swap_remove_and_drop_unchecked_nonoverlapping(last_element_index: number, row: TableRow) {
        swap_remove_unchecked_nonoverlapping(this.data, row, last_element_index);
        swap_remove_unchecked_nonoverlapping(this.added_ticks, row, last_element_index);
        swap_remove_unchecked_nonoverlapping(this.changed_ticks, row, last_element_index);
    }

    private __swap_remove_and_forget_unchecked(last_element_index: number, row: TableRow) {
        swap_remove_unchecked(this.data, row, last_element_index)
        swap_remove_unchecked(this.added_ticks, row, last_element_index)
        swap_remove_unchecked(this.changed_ticks, row, last_element_index)
    }

    /**
     * Call to expand / shrink the memory allocation for this Column
     * The caller should make sure their saved capacity is updated to new_capacity after this operation
     */
    private __realloc(current_capacity: number, new_capacity: number) {
        realloc(this.data, current_capacity, new_capacity)
        realloc(this.added_ticks, current_capacity, new_capacity)
        realloc(this.changed_ticks, current_capacity, new_capacity)
    }

    private __alloc(new_capacity: number) {
        alloc(this.data, new_capacity)
        alloc(this.added_ticks, new_capacity)
        alloc(this.changed_ticks, new_capacity)
    }

    /**
     * Writes component data to the column at the given row.
     * Assumes the slot in unintialized
     * To overwrite existing initialized value, use Column.replace() instead
     */
    private __initialize(row: TableRow, data: {}, change_tick: Tick) {
        this.data[row] = data;
        this.added_ticks[row] = change_tick;
        this.changed_ticks[row] = change_tick;
    }

    private __replace(row: TableRow, data: {}, change_tick: Tick) {
        replace(this.data, row, data);
        this.changed_ticks[row].set(change_tick.get());
    }

    /**
     * Removes the element from `other` at `src_row` and inserts it
     * into the current column to initialize the values at `dst_row`
     */
    private __initialize_from_unchecked(other: Column, other_last_element_index: number, src_row: TableRow, dst_row: TableRow) {
        // Init data
        const src_val = swap_remove(other.data, src_row)!;
        this.#initialize_unchecked(this.data, dst_row, src_val)
        const added_tick = swap_remove(other.added_ticks, src_row)!;
        this.#initialize_unchecked(this.added_ticks, dst_row, added_tick)
        const changed_tick = swap_remove(other.changed_ticks, src_row)!;
        this.#initialize_unchecked(this.changed_ticks, dst_row, changed_tick)
    }


    check_change_ticks(len: number, change_tick: Tick) {
        for (let i = 0; i < len; i++) {
            this.added_ticks[i].check_tick(change_tick)
            this.changed_ticks[i].check_tick(change_tick)
        }
    }


    clear() {
        this.data.length = 0;
        this.added_ticks.length = 0;
        this.changed_ticks.length = 0;
    }

    private __reserve_exact(additional: number) {
        reserve(this.data, additional);
    }

    #initialize_unchecked(array: any[], dst_row: TableRow, value: {}) {
        array[dst_row] = value
    }
}