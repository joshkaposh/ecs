import { Option, View } from 'joshkaposh-option'
import { ComponentRecord, CtoA, ThinComponent } from "define";
import { push, swap_remove_typed_unchecked } from './table/column';
import { swap, swap_remove_typed } from '../array-helpers';

export type ComponentRows<T extends ComponentRecord> = {
    [K in keyof T]: CtoA<T[K], ArrayBuffer>;
}

export class Rows {
    #rows: View[];

    constructor(rows: View[]) {
        this.#rows = rows;
    }

    static with_capacity(type: ThinComponent<ComponentRecord>, capacity: number) {

        if (!capacity || capacity < 4) {
            capacity = 4;
        }

        const keys = type.keys;
        const rows: View[] = [];
        for (let i = 0; i < keys.length; i++) {
            const Ty = type[keys[i]].constructor;
            rows[i] = Ty(new ArrayBuffer(capacity * type[keys[i]].BYTES_PER_ELEMENT))
        }

        return new Rows(rows);
    }

    get length() {
        return this.#rows[0].length;
    }

    get capacity() {
        return this.#rows[0].buffer.maxByteLength / this.#rows[0].BYTES_PER_ELEMENT
    }

    get(index: number): Option<number[]> {

        return this.#rows.map(r => r[index]);
    }

    push(value: ArrayLike<number>) {
        for (let i = 0; i < value.length; i++) {
            this.#rows[i] = push(this.#rows[i], value[i])
        }
    }

    pop(): Option<number[]> {
        const len = this.length;
        if (len === 0) {
            return
        }
        const index = len - 1;
        const values = this.#rows.map(r => r[index]);
        this.resize(index);
        return values;

    }

    swap_remove(index: number) {
        const len = this.length;
        if (len === 0) {
            return
        }

        if (index === len) {
            return this.pop();
        }

        const values = new Array(this.#rows.length);
        for (let i = 0; i < this.#rows.length; i++) {
            values[i] = swap_remove_typed(this.#rows[i], index);
        }

        return values;
    }

    insert(index: number, value: ArrayLike<number>) {
        for (let i = 0; i < value.length; i++) {
            this.#rows[i][index] = value[i];
        }
    }

    resize(new_length = 0) {
        const rows = this.#rows;
        for (let i = 0; i < this.#rows.length; i++) {
            const row = rows[i];
            const bytes = row.BYTES_PER_ELEMENT;
            row.buffer.resize(new_length * bytes)
        }
    }

    clear() {
        this.resize();
    }
}