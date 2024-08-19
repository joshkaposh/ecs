import { iter } from "joshkaposh-iterator";
import { Option, is_some } from 'joshkaposh-option'
import { capacity, reserve, swap_remove, swap_remove_unchecked } from "../../array-helpers";
import { ComponentId, ComponentInfo, Components } from "../component";
import { SparseSet } from "./sparse-set";
import { Entity } from "../entity";
import { TODO } from "joshkaposh-iterator/src/util";
import { u32 } from "../../Intrinsics";

export type TableId = number;
export const TableId = {
    empty: 0,
    INVALID: u32.MAX
} as const;

export type TableRow = number;
export const TableRow = {
    INVALID: u32.MAX
} as const;

export class Column {
    data: {}[]
    constructor(data: {}[]) {
        this.data = data;
    }

    static with_capacity(_component_info: ComponentInfo, _capacity: number) {
        return new Column([]);
    }

    clear() {
        this.data.length = 0;
    }

    get(row: TableRow): Option<{}> {
        if (row < this.data.length) {
            return {
                data: this.data[row]
            }
        } else {
            return null;
        }
    }

    get_data(row: TableRow): Option<{}> {
        if (row < this.data.length) {
            return this.data[row]
        } else {
            return null;
        }
    }

    get_data_unchecked(row: TableRow) {
        return this.data[row]
    }

    is_empty() {
        return this.data.length === 0;
    }

    len() {
        return this.data.length;
    }

    __replace(row: TableRow, data: {}) {
        const index = row;
        if (index >= this.len()) {
            throw new Error(`Column:__replace - Index ${index} cannot exceed ${this.len()}`)
        }

        this.data[index] = data
        // this.data
    }

    __swap_remove_unchecked(row: TableRow) {
        return swap_remove(this.data, row);
    }

    __initialize_from_unchecked(other: Column, src_row: TableRow, _dst_row: TableRow) {
        // const ptr = this.data[dst_row];

        swap_remove(other.data, src_row)
    }

    __initialize(row: TableRow, data: {}) {
        this.data[row] = data;
    }

    __push(ptr: {}) {
        this.data.push(ptr);
    }

    __reserve_exact(additional: number) {
        reserve(this.data, additional);
    }
}

type TableMoveResult = {
    swapped_entity: Option<Entity>;
    new_row: TableRow;
}

export class Table {
    #columns: SparseSet<ComponentId, Column>;
    #entities: Entity[]
    constructor(columns: SparseSet<ComponentId, Column>, entities: Entity[]) {
        this.#columns = columns;
        this.#entities = entities;
    }

    entities() {
        return this.#entities;
    }

    get_column(component_id: ComponentId): Option<Column> {
        return this.#columns.get(component_id);
    }

    has_column(component_id: ComponentId) {
        return this.#columns.contains(component_id);
    }

    entity_count() {
        return this.#entities.length;
    }

    component_count() {
        return this.#columns.len();
    }

    entity_capacity(): number {
        // javascript arrays do not have a 'capacity'
        // return this.#entities.capacity()
        return capacity(this.#entities.length)
    }

    is_empty() {
        return this.#entities.length === 0;
    }

    iter() {
        return this.#columns.values();
    }

    clear() {
        this.#entities.length = 0;
        for (const column of this.#columns.values()) {
            column.clear();
        }
    }


    __reserve(additional: number) {
        // this.#entities.capacity() - this.#entities.length < additional
        if (capacity(this.#entities.length) - this.#entities.length < additional) {
            // this.entities.reserve(additional);
            reserve(this.#entities, additional)

            // use entities vector capacity as driving capacity for all related allocations
            let new_capacity = capacity(this.#entities.length);

            for (const column of this.#columns.values()) {
                column.__reserve_exact(new_capacity - column.len());
            }
        }
    }

    /// Allocates space for a new entity
    ///
    /// # Safety
    /// the allocated row must be written to immediately with valid values in each column
    __allocate(entity: Entity): TableRow {
        this.__reserve(1);
        const index = this.#entities.length;
        this.#entities.push(entity);

        for (const column of this.#columns.values()) {
            column.data.length = this.#entities.length;
        }

        // return new TableRow(index);
        return index;
    }

    /// Removes the entity at the given row and returns the entity swapped in to replace it (if an
    /// entity was swapped in)
    ///
    /// # Safety
    /// `row` must be in-bounds
    __swap_remove_unchecked(row: TableRow) {
        for (const column of this.#columns.values()) {
            column.__swap_remove_unchecked(row)
        }
        const is_last = row === this.#entities.length - 1;

        swap_remove_unchecked(this.#entities, row)

        return is_last ? null : this.#entities[row]
    }

    /// Moves the `row` column values to `new_table`, for the columns shared between both tables.
    /// Returns the index of the new row in `new_table` and the entity in this table swapped in
    /// to replace it (if an entity was swapped in). missing columns will be "forgotten". It is
    /// the caller's responsibility to drop them.  Failure to do so may result in resources not
    /// being released (i.e. files handles not being released, memory leaks, etc.)
    ///
    /// # Safety
    /// Row must be in-bounds
    __move_to_and_forget_missing_unchecked(row: TableRow, new_table: Table): TableMoveResult {
        const is_last = row === this.#entities.length - 1;
        const new_row = new_table.__allocate(swap_remove(this.#entities, row)!)
        for (const [component_id, column] of this.#columns.iter()) {
            let new_column = new_table.get_column(component_id);
            if (is_some(new_column)) {
                new_column.__initialize_from_unchecked(column, row, new_row)
            } else {
                column.__swap_remove_unchecked(row)
            }
        }
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
    /// row must be in-bounds
    __move_to_and_drop_missing_unchecked(row: TableRow, new_table: Table): TableMoveResult {
        const is_last = row < this.#entities.length - 1;
        const new_row = new_table.__allocate(swap_remove(this.#entities, row as number)!)
        for (const [component_id, column] of this.#columns.iter()) {
            const new_column = new_table.get_column(component_id)
            if (new_column) {
                new_column.__initialize_from_unchecked(column, row, new_row)
            } else {
                column.__swap_remove_unchecked(row)
            }
        }
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
    __move_to_superset_unchecked(row: TableRow, new_table: Table): TableMoveResult {
        const is_last = row === this.#entities.length - 1;
        const new_row = new_table.__allocate(swap_remove(this.#entities, row)!)

        for (const [component_id, column] of this.#columns.iter()) {
            new_table.get_column(component_id)?.__initialize_from_unchecked(column, row, new_row)
        }

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }
    }
}

export class TableBuilder {
    #columns: SparseSet<ComponentId, Column>;
    #capacity: number;

    constructor(columns: SparseSet<ComponentId, Column>, capacity: number) {
        this.#capacity = capacity;
        this.#columns = columns;
    }

    static with_capacity(capacity: number, column_capacity: number) {
        return new TableBuilder(SparseSet.with_capacity(column_capacity) as SparseSet<ComponentId, Column>, capacity)
    }

    add_column(component_info: ComponentInfo) {
        this.#columns.insert(component_info.id(), Column.with_capacity(component_info, this.#capacity))
        return this
    }

    build() {
        return new Table(this.#columns, new Array(this.#capacity))
    }
}

export class Tables {
    #tables: Table[];
    #table_ids: Map<ComponentId[], TableId>;

    constructor(tables: Table[], table_ids: Map<ComponentId[], TableId>) {
        this.#tables = tables;
        this.#table_ids = table_ids;
    }

    static default() {
        const empty_table = TableBuilder.with_capacity(0, 0).build()
        return new Tables([empty_table], new Map())
    }

    len(): number {
        return this.#tables.length;
    }

    is_empty() {
        return this.#tables.length === 0;
    }

    get(id: TableId): Option<Table> {
        return this.#tables[id];
    }

    __get_2(a: TableId, b: TableId) {
        if (a < b) {
            // let (b_slice, a_slice) = self.tables.split_at_mut(a);
            const [b_slice, a_slice] = TODO<[Table[], Table[]]>()
            return [a_slice[0], b_slice[b]] as const;
        } else {
            // let (b_slice, a_slice) = self.tables.split_at_mut(b);
            const [a_slice, b_slice] = TODO<[Table[], Table[]]>()

            return [a_slice[a], b_slice[0]] as const
        }
    }

    /// Attempts to fetch a table based on the provided components,
    /// creating and returning a new [`Table`] if one did not already exist.
    ///
    /// # Safety
    /// `component_ids` must contain components that exist in `components`
    __get_id_or_insert(component_ids: ComponentId[], components: Components): TableId {
        const tables = this.#tables;
        // compute from component_ids;
        // const hash = TODO<any>();
        let value!: TableId;
        if (!this.#table_ids.has(component_ids)) {
            let table = TableBuilder.with_capacity(0, component_ids.length)
            for (const component_id of component_ids) {
                table.add_column(components.get_info(component_id)!)
            }
            tables.push(table.build());
            value = tables.length - 1;
        } else {
            value = this.#table_ids.get(component_ids)!
        }
        return value;

    }

    iter() {
        return iter(this.#tables);
    }

    clear() {
        for (const table of this.#tables) {
            table.clear();
        }
    }
}

