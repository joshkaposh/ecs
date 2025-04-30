import { View, BitSize, TypedArray as Base } from 'joshkaposh-option';
import { reserve, reserve_exact } from './table/column';
import { capacity } from '../array-helpers';

// function new_array<T extends View<ArrayBuffer>>(type: BitSize<32>, buffer: ArrayBuffer): T {
//     return new Base[type](buffer) as T;
// }

export class TypedArray<T extends View> {
    #bytes: number; // bytes per element
    #ty: BitSize<32>;
    #view: T;
    constructor(lenOrBuf?: number | ArrayBuffer, type: BitSize<32> = 'i32', start?: number, end?: number) {
        if (typeof lenOrBuf === 'number') {
            lenOrBuf = new ArrayBuffer(lenOrBuf, { maxByteLength: capacity(lenOrBuf) });
        } else if (!lenOrBuf) {
            lenOrBuf = new ArrayBuffer(0, { maxByteLength: 16 });
        }

        const len = start != null && end != null ? end - start : undefined;

        this.#view = new Base[type](lenOrBuf, start, len) as T;
        this.#ty = type;
        this.#bytes = this.#view.BYTES_PER_ELEMENT;
    }

    static with_capacity<T extends View>(capacity: number, type: BitSize<32> = 'i32') {
        return new TypedArray<T>(new ArrayBuffer(0, { maxByteLength: capacity * Base[type].BYTES_PER_ELEMENT }), type);
    }

    get length() {
        return this.#view.length;
    }

    get byteLength() {
        return this.#view.byteLength;
    }

    get maxByteLength() {
        return this.#view.buffer.maxByteLength;
    }

    get capacity() {
        return this.#view.buffer.maxByteLength / this.#bytes;
    }

    push(...elements: number[]): number {
        const additional = elements.length;
        const len = this.length;
        const increment = len + additional;
        if (increment > this.capacity) {
            const buf = reserve(this.#ty, this.#view, this.capacity, increment);
            this.#view = new Base[this.#ty](buf) as T;
        }
        this.#view.buffer.resize(increment);
        return increment;
    }

    pop(): number | undefined {
        if (this.length === 0) {
            return
        }
        const v = this.#view;
        const n = v[v.length - 1];
        v.buffer.resize(v.byteLength - this.#bytes);
        return n;
    }

    get(i: number) {
        return this.#view[i];
    }

    at(index: number) {
        return this.#view.at(index);
    }

    fill(value: number, start?: number, end?: number) {
        this.#view.fill(value, start, end)
    }

    find(predicate: (value: number, index: number, array: T) => boolean) {
        this.#view.find(predicate as any);
    }

    findIndex(predicate: (value: number, index: number, array: T) => boolean) {
        this.#view.findIndex(predicate as any);
    }

    findLast(predicate: (value: number, index: number, array: T) => boolean) {
        // @ts-expect-error
        this.#view.findLast(predicate as any);
    }

    findLastIndex(predicate: (value: number, index: number, array: T) => boolean) {
        this.#view.findLastIndex(predicate as any);
    }

    forEach(fn: (value: number, index: number, array: T) => void) {
        this.#view.forEach(fn as any);
    }

    reserve(additional: number) {
        const v = this.#view;
        const buf = reserve(this.#ty, v, this.capacity, additional);
        if (buf.maxByteLength !== v.buffer.maxByteLength) {
            this.#view = new Base[this.#ty](buf) as T;
        }
    }

    reserve_exact(additional: number) {
        const v = this.#view;
        const buf = reserve_exact(this.#ty, v.buffer, v.length, additional)
        if (buf.maxByteLength !== v.buffer.maxByteLength) {
            this.#view = new Base[this.#ty](buf) as T;
        }
    }

    resize(newByteLength?: number) {
        this.#view.buffer.resize(newByteLength)
    }

    subarray(begin: number, end: number) {
        return new TypedArray<T>(this.#view.subarray(begin, end).buffer, this.#ty, begin, end)
    }

    slice(start: number, end: number) {
        return new TypedArray<T>(this.#view.slice(start, end).buffer, this.#ty, start, end)
    }

    copyWithin(target: number, start: number, end: number) {
        return new TypedArray<T>(this.#view.copyWithin(target, start, end).buffer, this.#ty, start, end);
    }

    copy(buffer: ArrayBuffer) {
        const old = new Base[this.#ty](buffer);
        const buf = new ArrayBuffer(old.byteLength, { maxByteLength: buffer.maxByteLength })
        const view = new Base[this.#ty](buf);
        view.set(old);
        return new TypedArray<T>(view.buffer, this.#ty);
    }

    clone() {
        return this.copy(this.#view.buffer);
    }

    clone_from(src: TypedArray<T>) {
        const buffer = src.#view.buffer;
        const old = new Base[this.#ty](buffer);
        const buf = new ArrayBuffer(old.byteLength, { maxByteLength: buffer.maxByteLength })
        const view = new Base[this.#ty](buf) as T;
        view.set(old);
        this.#view = view;
    }

    with(index: number, value: number) {
        return new TypedArray<T>(this.#view.with(index, value).buffer, this.#ty)
    }

    every(predicate: (value: number, index: number, array: T) => boolean) {
        return this.#view.every(predicate as any);
    }

    some(predicate: (value: number, index: number, array: T) => boolean) {
        return this.#view.some(predicate as any)
    }

    sort(compare?: (a: number, b: number) => -1 | 0 | 1) {
        this.#view.sort(compare);
        return this;
    }

    values() {
        return this.#view.values();
    }

    transfer(newByteLength?: number) {
        return this.#view.buffer.transfer(newByteLength);
    }

    transferToFixedLength(newByteLength?: number) {
        return this.#view.buffer.transferToFixedLength(newByteLength);
    }

    toLocaleString() {
        return this.#view.toLocaleString();
    }

    toReversed() {
        return new TypedArray<T>(this.#view.toReversed().buffer, this.#ty)
    }

    toSorted(compare?: (a: number, b: number) => -1 | 0 | 1) {
        return new TypedArray<T>(this.#view.toSorted(compare).buffer, this.#ty)
    }

    toString() {
        return this.#view.toString();
    }

    valueOf() {
        return this.#view.valueOf();
    }
}