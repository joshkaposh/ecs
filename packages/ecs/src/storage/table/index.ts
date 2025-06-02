import { iter } from "joshkaposh-iterator";
import { Option, u32 } from 'joshkaposh-option'
import { capacity, swap, swap_remove, split_at } from "../../array-helpers";
import { ComponentId, ComponentInfo, Components, Tick } from "../../component";
import { SparseSet } from "../sparse-set";
import { Entity } from "../../entity";
import { debug_assert, entry } from "../../util";
import { Column } from "./column";

export type TableId = number;
export const TableId = {
    empty: 0,
    INVALID: u32.MAX
} as const;

export type TableRow = number;
export const TableRow = {
    INVALID: u32.MAX
} as const;

type TableMoveResult = {
    swapped_entity: Option<Entity>;
    new_row: TableRow;
}

export { Column } from './column';

export * from './object-store';

export * from './thin-column';
export * from './thin-table';

export class Table {
    #columns: SparseSet<Column>;
    #entities: Entity[];
    constructor(columns: SparseSet<Column>, entities: Entity[]) {
        this.#columns = columns;
        this.#entities = entities;
    }

    get entityCount() {
        return this.#entities.length;
    }

    get componentCount() {
        return this.#columns.length;
    }

    get entityCapacity(): number {
        // javascript arrays do not have a 'capacity'
        // return this.#entities.capacity()x
        return capacity(this.#entities.length)
    }

    get isEmpty() {
        return this.#entities.length === 0;
    }

    get entities() {
        return this.#entities;
    }

    checkChangeTicks(change_tick: Tick) {
        const len = this.entityCount;
        const array = this.#columns.inner_values();
        for (let i = 0; i < array.length; i++) {
            array[i].checkChangeTicks(len, change_tick);
        }
    }

    get(component_id: ComponentId) {
        return this.getColumn(component_id)?.get(this.entityCount);
    }

    getColumn(component_id: ComponentId): Option<Column> {
        return this.#columns.get(component_id);
    }

    getComponent(component_id: ComponentId, row: TableRow): Option<{}> {
        return this.getColumn(component_id)?.data[row];
    }

    getAddedTick(component_id: ComponentId, row: TableRow) {
        return this.getColumn(component_id)?.ticks[row].added;
    }

    getChangedTick(component_id: ComponentId, row: TableRow) {
        return this.getColumn(component_id)?.ticks[row].changed;
    }

    getDataSliceFor(component_id: ComponentId) {
        return this.getColumn(component_id)?.getDataSlice(this.entityCount);
    }

    getTicksSliceFor(component_id: ComponentId) {
        return this.getColumn(component_id)?.getTicksSlice(this.entityCount);
    }

    hasColumn(component_id: ComponentId) {
        return this.#columns.has(component_id);
    }

    clear() {
        this.#entities.length = 0;
        const values = this.#columns.inner_values();
        for (let i = 0; i < values.length; i++) {
            values[i].clear();
        }
    }

    __reserve(_additional: number) {
        // if (capacity(this.#entities.length) - this.#entities.length < additional) {
        //     // use entities vector capacity as driving capacity for all related allocations
        //     let new_capacity = capacity(this.#entities.length);

        //     const values = this.#columns.inner_values();
        //     for (let i = 0; i < values.length; i++) {
        //         const column = values[i]
        //         column.__reserve_exact(new_capacity - column.length);
        //     }
        // }
    }

    /// Allocates space for a new entity
    ///
    /// # Safety
    /// the allocated row must be written to immediately with valid values in each column
    allocate(entity: Entity): TableRow {
        this.__reserve(1);
        const index = this.#entities.length;
        this.#entities.push(entity);

        const values = this.#columns.inner_values()
        for (let i = 0; i < values.length; i++) {
            values[i].data.length = this.#entities.length;

        }
        return index;
    }

    /// Removes the entity at the given row and returns the entity swapped in to replace it (if an
    /// entity was swapped in)
    ///
    /// # Safety
    /// `row` must be in-bounds
    __swapRemoveUnchecked(row: TableRow) {
        debug_assert(row < this.entityCount, '');
        const last_element_index = this.entityCount - 1;

        const values = this.#columns.inner_values();
        if (row !== last_element_index) {
            for (let i = 0; i < values.length; i++) {
                const column = values[i];
                column.__swapRemoveAndDropUncheckedNonoverlapping(last_element_index, row)
            }
        } else {
            for (let i = 0; i < values.length; i++) {
                const column = values[i];
                column.pop(last_element_index);
                // column.__dropLastComponent(last_element_index)
            }

        }

        const is_last = row === last_element_index;
        swap(this.#entities, row, this.#entities.length - 1);
        const ent = is_last ? null : this.#entities[row]
        this.#entities.pop();
        return ent;
    }

    /**
     * Moves the `row` column values to `new_table`, for the columns shared between both tables.
     * Returns the index of the new row in `new_table` and the entity in this table swapped in
     * to replace it (if an entity was swapped in).
     * 
     * # Safety
     * row must be in-bounds
     */

    __moveToAndDropMissingUnchecked(row: TableRow, new_table: Table): TableMoveResult {
        const last_element_index = this.#entities.length - 1
        const is_last = row === last_element_index;
        const new_row = new_table.allocate(swap_remove(this.#entities, row)!);

        this.#columns.forEach((component_id, column) => {
            const new_column = new_table.getColumn(component_id);
            new_column ? new_column.__initializeFromUnchecked(column, last_element_index, row, new_row) : column.__swapRemoveUnchecked(row);
        })

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }
    }

    /// Moves the `row` column values to `new_table`, for the columns shared between both tables.
    /// Returns the index of the new row in `new_table` and the entity in this table swapped in
    /// to replace it (if an entity was swapped in).
    ///
    /// # Safety
    /// `row` must be in-bounds. `new_table` must contain every component this table has
    __moveToSupersetUnchecked(row: TableRow, new_table: Table): TableMoveResult {
        debug_assert(row < this.entityCount, '');
        const last_element_index = this.entityCount - 1;
        const is_last = row === last_element_index;
        const swapped = swap_remove(this.#entities, row)!;
        const new_row = new_table.allocate(swapped)

        this.#columns.forEach((component_id, column) => new_table.getColumn(component_id)!.__initializeFromUnchecked(column, last_element_index, row, new_row))

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }
    }

    iter() {
        return this.#columns.iter();
    }

    iter_columns() {
        return this.#columns.values();
    }

    [Symbol.iterator]() {
        return this.iter();
    }
}

export class TableBuilder {
    #columns: SparseSet<Column>;
    #capacity: number;

    constructor(columns: SparseSet<Column>, capacity: number) {
        this.#capacity = capacity;
        this.#columns = columns;
    }

    static withCapacity(capacity: number, column_capacity: number) {
        return new TableBuilder(SparseSet.withCapacity(column_capacity), capacity)
    }

    addColumn(component_info: ComponentInfo) {
        this.#columns.set(component_info.id, new Column())
        return this
    }

    build() {
        return new Table(this.#columns, new Array(this.#capacity))
    }
}

export class Tables {
    #tables: Table[];
    #table_ids: Map<string, TableId>;

    constructor(tables: Table[] = [TableBuilder.withCapacity(0, 0).build()], table_ids = new Map()) {
        this.#tables = tables;
        this.#table_ids = table_ids;
    }

    /**
     * The total amount of tables.
     */
    get length(): number {
        return this.#tables.length;
    }

    /**
     * Is true if no tables exist.
     */
    get isEmpty() {
        return this.#tables.length === 0;
    }

    checkChangeTicks(change_tick: Tick) {
        for (let i = 0; i < this.#tables.length; i++) {
            this.#tables[i].checkChangeTicks(change_tick);
        }
    }

    /**
     * @returns a table at the index `id`.
     */
    get(id: TableId): Option<Table> {
        return this.#tables[id];
    }

    /**
     * @returns two tables at the indices `a` and `b`.
     */
    get2(a: TableId, b: TableId): [Table, Table] {
        if (a > b) {
            const [b_slice, a_slice] = split_at(this.#tables, a)!;
            return [a_slice[0], b_slice[b]];
        } else {
            const [a_slice, b_slice] = split_at(this.#tables, b)!;
            return [a_slice[a], b_slice[0]];
        }
    }

    /**
     * Attempts to fetch a table based on the provided components,
     * creating and returning a new [`Table`] if one did not already exist.
     * 
     * # Safety
     * `component_ids` must contain components that exist in `components`
     */
    __getIdOrSet(component_ids: ComponentId[], components: Components): TableId {
        if (component_ids.length === 0) {
            return TableId.empty;
        }

        const tables = this.#tables;

        return entry(this.#table_ids, component_ids.join(','), () => {
            const id = tables.length;
            const table = TableBuilder.withCapacity(0, component_ids.length)
            for (let i = 0; i < component_ids.length; i++) {
                table.addColumn(components.getInfo(component_ids[i])!)
            }
            tables.push(table.build());
            return id;
        })
    }

    iter() {
        return iter(this.#tables);
    }

    /**
     * Empties all the tables.
     */
    clear() {
        const tables = this.#tables;
        for (let i = 0; i < tables.length; i++) {
            tables[i].clear();
        }
    }
}

