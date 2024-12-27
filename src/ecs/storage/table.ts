import { iter } from "joshkaposh-iterator";
import { Option, is_some } from 'joshkaposh-option'
import { capacity, replace, reserve, swap_remove, swap_remove_unchecked } from "../../array-helpers";
import { ComponentId, ComponentInfo, Components, ComponentTicks, Tick } from "../component";
import { SparseSet } from "./sparse-set";
import { Entity } from "../entity";
import { split_at } from "joshkaposh-iterator/src/util";
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

    __swap_remove_unchecked(row: TableRow) {
        swap_remove_unchecked(this.data, row)
        swap_remove_unchecked(this.added_ticks, row)
        swap_remove_unchecked(this.changed_ticks, row)
    }

    __push(ptr: {}, ticks: ComponentTicks) {
        this.data.push(ptr);
        this.added_ticks.push(ticks.added);
        this.changed_ticks.push(ticks.changed);
    }

    get_data_slice() {
        return this.data.slice();
    }

    get_added_ticks_slice() {
        return this.added_ticks;
    }

    get_changed_ticks_slice() {
        return this.changed_ticks;
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

    clear() {
        this.data.length = 0;
        this.added_ticks.length = 0;
        this.changed_ticks.length = 0;
    }

    check_change_ticks(change_tick: Tick) {
        for (let i = 0; i < this.added_ticks.length; i++) {
            const component_ticks = this.added_ticks[i];
            component_ticks.check_tick(change_tick);
        }

        for (let i = 0; i < this.changed_ticks.length; i++) {
            const component_ticks = this.changed_ticks[i];
            component_ticks.check_tick(change_tick);
        }
    }

    __replace(row: TableRow, data: {}, change_tick: Tick) {
        replace(this.data, row, data);
        this.changed_ticks[row].set(change_tick.get());
    }

    __initialize_from_unchecked(other: Column, src_row: TableRow, _dst_row: TableRow) {
        // const ptr = this.data[dst_row];

        swap_remove(other.data, src_row)
    }

    __initialize(row: TableRow, data: {}, change_tick: Tick) {
        this.data[row] = data;
        this.added_ticks[row] = change_tick;
        this.changed_ticks[row] = change_tick;
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

    check_change_ticks(change_tick: Tick) {
        this.#columns.iter().for_each(([_, c]) => c.check_change_ticks(change_tick))
    }

    entities() {
        return this.#entities;
    }

    get(component_id: ComponentId) {
        return this.get_column(component_id)?.get(this.entity_count())
    }

    get_column(component_id: ComponentId): Option<Column> {
        return this.#columns.get(component_id);
    }

    get_data_slice_for(component_id: ComponentId) {
        // @ts-expect-error
        return this.get_column(component_id)?.get_data_slice(this.entity_count())
    }

    get_changed_ticks_slice_for(component_id: ComponentId) {
        // @ts-expect-error
        return this.get_column(component_id)?.get_changed_ticks_slice(this.entity_count())
    }

    get_added_ticks_slice_for(component_id: ComponentId) {
        // @ts-expect-error
        return this.get_column(component_id)?.get_changed_ticks_slice(this.entity_count())
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
            console.log('TABLE ALLOCATE', column);

            column.data.length = this.#entities.length;
        }

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
        this.#columns.insert(component_info.id(), Column.default())
        return this
    }

    build() {
        return new Table(this.#columns, new Array(this.#capacity))
    }
}

function hash_component_ids(component_ids: ComponentId[]): string {
    return component_ids.join(' ');
}

export class Tables {
    #tables: Table[];
    #table_ids: Map<string, TableId>;

    constructor(tables: Table[] = [], table_ids: Map<string, TableId> = new Map()) {
        this.#tables = tables;
        this.#table_ids = table_ids;
    }

    static default() {
        const empty_table = TableBuilder.with_capacity(0, 0).build()
        return new Tables([empty_table], new Map())
    }

    check_change_ticks(change_tick: Tick) {
        for (let i = 0; i < this.#tables.length; i++) {
            this.#tables[i].check_change_ticks(change_tick);
        }
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
            const [b_slice, a_slice] = split_at(this.#tables, a) ?? [[], []];
            return [a_slice[0], b_slice[b]] as const;
        } else {
            // let (b_slice, a_slice) = self.tables.split_at_mut(b);
            const [a_slice, b_slice] = split_at(this.#tables, b) ?? [[], []];
            return [a_slice[a], b_slice[0]] as const
        }
    }

    /// Attempts to fetch a table based on the provided components,
    /// creating and returning a new [`Table`] if one did not already exist.
    ///
    /// # Safety
    /// `component_ids` must contain components that exist in `components`
    __get_id_or_insert(component_ids: ComponentId[], components: Components): TableId {
        if (component_ids.length === 0) {
            return TableId.empty
        }

        const tables = this.#tables;


        let value!: TableId;
        const hash = hash_component_ids(component_ids)
        if (!this.#table_ids.has(hash)) {
            const table = TableBuilder.with_capacity(0, component_ids.length)
            for (let i = 0; i < component_ids.length; i++) {
                table.add_column(components.get_info(component_ids[i])!)
            }
            tables.push(table.build());
            value = tables.length - 1;
            this.#table_ids.set(hash, value);
        } else {
            value = this.#table_ids.get(hash)!
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

