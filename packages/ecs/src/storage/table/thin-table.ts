import { Option, TypedArray, View } from "joshkaposh-option";
import { alloc, reserve, TableId, TableRow, ThinColumn, ThinSparseSet } from "..";
import { split_at, swap, swap_remove_typed, view } from "../../array-helpers";
import { ComponentId, ThinComponentInfo, ThinComponents } from "../../component";
import { Tick } from "../../tick";
import { debug_assert, entry } from "../../util";
import { iter } from "joshkaposh-iterator";
import { Entity } from "../../entity";

type TableMoveResult = {
    swapped_entity: Option<Entity>;
    new_row: TableRow;
}

export class ThinTable {
    #columns: ThinSparseSet<ThinColumn>;
    #entities: Uint32Array<ArrayBuffer>;
    #length: number;

    constructor(columns: ThinSparseSet<ThinColumn>, entities: Uint32Array<ArrayBuffer>, length = 0) {
        this.#columns = columns;
        this.#entities = entities;
        this.#length = length;
    }

    get length() {
        return this.#length
    }

    /** the capacity of this table, in bytes */
    get capacity() {
        return this.#entities.buffer.maxByteLength;
    }

    get entities() {
        return this.#entities;
    }

    get entityCount() {
        return this.#length;
    }

    get componentCount() {
        return this.#columns.length;
    }

    get isEmpty() {
        return this.#length === 0;
    }

    check_change_ticks(change_tick: Tick) {
        const len = this.entityCount;
        const array = this.#columns.inner_values();
        for (let i = 0; i < array.length; i++) {
            array[i].checkChangeTicks(len, change_tick);
        }
    }

    get(component_id: ComponentId) {
        return this.getColumn(component_id)?.get(this.entityCount)
    }

    getColumn(component_id: ComponentId): Option<ThinColumn> {
        return this.#columns.get(component_id);
    }

    getComponent(component_id: ComponentId, row: TableRow): Option<number[]> {
        if (row >= this.#length) {
            return
        }

        return this.getColumn(component_id)?.data.map(r => r[row]);
    }

    getAddedTick(component_id: ComponentId, row: TableRow) {
        return this.getColumn(component_id)?.added_ticks[row];
    }

    getChangedTick(component_id: ComponentId, row: TableRow) {
        return this.getColumn(component_id)?.changed_ticks[row];
    }

    getDataSliceFor(component_id: ComponentId) {
        return this.getColumn(component_id)!.data;
    }

    getChangedTicksSliceFor(component_id: ComponentId) {
        return this.getColumn(component_id)?.getChangedTicksSlice(this.entityCount);
    }

    getAddedTicksSliceFor(component_id: ComponentId) {
        return this.getColumn(component_id)?.getAddedTicksSlice(this.entityCount)
    }

    hasColumn(component_id: ComponentId) {
        return this.#columns.has(component_id);
    }

    iter() {
        return this.#columns.iter();
    }

    iter_columns() {
        return this.#columns.values();
    }

    clear() {
        this.#entities.buffer.resize(0);
        const values = this.#columns.inner_values();
        for (let i = 0; i < values.length; i++) {
            values[i].clear();
        }
    }

    reserveAndSetLength(additional: number, new_length: number) {
        this.#length = new_length;
        if (this.capacity - this.#entities.byteLength < additional * this.#entities.BYTES_PER_ELEMENT) {
            const new_cap = this.capacity * 2;
            const old = this.#entities;
            const new_entities = new Uint32Array(new ArrayBuffer(old.byteLength, { maxByteLength: new_cap }))
            new_entities.set(old);
            this.#entities = new_entities;
            const columns = this.#columns.inner_values();
            for (let i = 0; i < columns.length; i++) {
                const column = columns[i];
                column.grow(new_length, new_cap / Uint32Array.BYTES_PER_ELEMENT);
            }
        } else {
            // columns did not grow but still need resize
            const columns = this.#columns.inner_values();
            for (let i = 0; i < columns.length; i++) {
                const column = columns[i];
                column.resize(new_length);
            }
        }
    }

    /**
     * Allocates space for a new entity
     * 
     * **Safety**
     * the allocated row must be written to immediately with valid values in each column
     */
    allocate(entity: Entity): TableRow {
        const index = this.#length;
        const len = this.#length + 1;
        this.reserveAndSetLength(1, len);
        const entities = this.#entities;
        entities.buffer.resize(entities.BYTES_PER_ELEMENT * len);
        entities[index] = entity;

        const dense = this.#columns.inner_values();
        for (let i = 0; i < dense.length; i++) {
            const col = dense[i];
            col.added_ticks[index] = 0;
            col.changed_ticks[index] = 0;
        }

        return index;
    }

    /**
     * Removes the entity at the given row and returns the entity swapped in to replace it (if an
     * entity was swapped in).
     * 
     * # Safety
     * `row` must be in-bounds.
     */
    swapRemoveUnchecked(row: TableRow) {
        debug_assert(row < this.entityCount, '');
        const last_element_index = this.entityCount - 1;
        const values = this.#columns.inner_values();
        if (row !== last_element_index) {
            for (let i = 0; i < values.length; i++) {
                // @ts-expect-error
                column.__swap_remove_and_drop_unchecked_nonoverlapping(last_element_index, row)
            }
        } else {
            for (let i = 0; i < values.length; i++) {
                // @ts-expect-error
                column.__drop_last_component(last_element_index)
            }

        }

        const is_last = row === last_element_index;
        swap(this.#entities, row, this.#length - 1);
        const ent = is_last ? null : this.#entities[row]
        this.#entities.buffer.resize(this.#entities.byteLength - this.#entities.BYTES_PER_ELEMENT);
        return ent;
    }

    /**
     * Moves the `row` column values to `new_table`, for the columns shared between both tables.
     * Returns the index of the new row in `new_table` and the entity in this table swapped in
     * to replace it (if an entity was swapped in). missing columns will be "forgotten". It is
     * the caller's responsibility to drop them.  Failure to do so may result in resources not
     * being released (i.e. files handles not being released, memory leaks, etc.)
     *
     * # Safety
     * Row must be in-bounds
     */
    moveToAndForgetMissingUnchecked(row: TableRow, new_table: ThinTable): TableMoveResult {
        const last_element_index = this.#length - 1
        const is_last = row === last_element_index;

        const new_row = new_table.allocate(swap_remove_typed(this.#entities, row)!);

        this.#columns.forEach((component_id, column) => {
            let new_column = new_table.getColumn(component_id);
            if (new_column != null) {
                new_column.initializeFromUnchecked(column, last_element_index, row, new_row)
            } else {
                column.swapRemoveUnchecked(row)
            }
        })

        this.#length = last_element_index;

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }
    }

    /**
     * Moves the `row` column values to `new_table`, for the columns shared between both tables.
     * Returns the index of the new row in `new_table` and the entity in this table swapped in
     * to replace it (if an entity was swapped in).
     * 
     * # Safety
     * row must be in-bounds
     */
    moveToAndDropMissingUnchecked(row: TableRow, new_table: ThinTable): TableMoveResult {
        const last_element_index = this.#length - 1
        const is_last = row === last_element_index;
        const new_row = new_table.allocate(swap_remove_typed(this.#entities, row)!);

        this.#columns.forEach((component_id, column) => {
            const new_column = new_table.getColumn(component_id);
            if (new_column) {
                new_column.initializeFromUnchecked(column, last_element_index, row, new_row)
            } else {
                column.swapRemoveUnchecked(row)
            }
        })

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }
    }

    /**
     * Moves the `row` column values to `new_table`, for the columns shared between both tables.
     * Returns the index of the new row in `new_table` and the entity in this table swapped in
     * to replace it (if an entity was swapped in).
     *
     * **Safety**
     * `row` must be in-bounds. `new_table` must contain every component this table has
     */
    moveToSupersetUnchecked(row: TableRow, new_table: ThinTable): TableMoveResult {
        debug_assert(row < this.entityCount, '');
        const last_element_index = this.entityCount - 1;
        const is_last = row === last_element_index;
        const new_row = new_table.allocate(swap_remove_typed(this.#entities, row)!);
        this.#length--;

        for (const [id, col] of this.#columns.iter()) {
            new_table.getColumn(id)?.initializeFromUnchecked(col, last_element_index, row, new_row);
        }

        return {
            new_row,
            swapped_entity: is_last ? null : this.#entities[row]
        }

    }

    [Symbol.iterator]() {
        return this.iter();
    }
}

export class ThinTableBuilder {
    #columns: ThinSparseSet<ThinColumn>;
    #capacity: number;

    constructor(columns: ThinSparseSet<ThinColumn>, capacity: number) {
        this.#capacity = capacity;
        this.#columns = columns;
    }

    static withCapacity(capacity: number, column_capacity: number) {
        return new ThinTableBuilder(ThinSparseSet.withCapacity(column_capacity), capacity)
    }

    addColumn(component_info: ThinComponentInfo) {
        const type = component_info.descriptor.type;
        // const cap = Math.max(this.#capacity, 4);
        const cap = 4;
        // console.log('table add column', cap);

        const data = type.keys.map((k) => {
            const name = view[type[k].constructor.name as keyof typeof view];
            const Ty = TypedArray[name];
            const field_cap = cap * Ty.BYTES_PER_ELEMENT;
            return new Ty(new ArrayBuffer(0, { maxByteLength: field_cap }));
        }) as View[]

        const tick_cap = cap * Uint32Array.BYTES_PER_ELEMENT;

        this.#columns.set(component_info.id, new ThinColumn(
            data,
            new Uint32Array(new ArrayBuffer(0, { maxByteLength: tick_cap })),
            new Uint32Array(new ArrayBuffer(0, { maxByteLength: tick_cap })),
            0
        ));

        return this
    }

    build() {

        // const _cap = this.#capacity * Uint32Array.BYTES_PER_ELEMENT;
        // const cap = _cap === 0 ? 4 * Uint32Array.BYTES_PER_ELEMENT : _cap;
        const cap = 4;

        return new ThinTable(this.#columns, new Uint32Array(new ArrayBuffer(0, { maxByteLength: cap * Uint32Array.BYTES_PER_ELEMENT })));
    }
}

export class ThinTables {
    #tables: ThinTable[];
    #table_ids: Map<string, TableId>;

    constructor(tables: ThinTable[] = [ThinTableBuilder.withCapacity(0, 0).build()], table_ids: Map<string, TableId> = new Map()) {
        this.#tables = tables;
        this.#table_ids = table_ids;
    }

    get length(): number {
        return this.#tables.length;
    }

    get isEmpty() {
        return this.#tables.length === 0;
    }

    checkChangeTicks(change_tick: Tick) {
        for (let i = 0; i < this.#tables.length; i++) {
            this.#tables[i].check_change_ticks(change_tick);
        }
    }

    get(id: TableId): ThinTable {
        return this.#tables[id];
    }

    get2(a: TableId, b: TableId) {
        if (a > b) {
            const [b_slice, a_slice] = split_at(this.#tables, a)!;
            return [a_slice[0], b_slice[b]] as const;
        } else {
            const [a_slice, b_slice] = split_at(this.#tables, b)!;
            return [a_slice[a], b_slice[0]] as const
        }
    }

    /**
     * 
     * Attempts to fetch a table based on the provided components,
     * creating and returning a new [`Table`] if one did not already exist.
     * **Safety**
     * `component_ids` must contain components that exist in `components`
     */
    getIdOrSet(component_ids: ComponentId[], components: ThinComponents): TableId {
        if (component_ids.length === 0) {
            return TableId.empty
        }

        const tables = this.#tables;

        return entry(this.#table_ids, component_ids.join(','), () => {
            const table = ThinTableBuilder.withCapacity(component_ids.length, 0)
            for (let i = 0; i < component_ids.length; i++) {
                table.addColumn(components.getInfo(component_ids[i])!)
            }
            tables.push(table.build());
            return tables.length - 1;
        })
    }

    iter() {
        return iter(this.#tables);
    }

    /**
     * Clears each table in [`Tables`].
     * This does not remove any [`Table`].
     */
    clear() {
        const tables = this.#tables;
        for (let i = 0; i < tables.length; i++) {
            tables[i].clear();
        }
    }

}

