import { Iterator, Range, iter, range, done, IterInputType } from "joshkaposh-iterator";
import { is_some } from 'joshkaposh-option'
import { carrot_left, clear, set, set_to, trailing_zeros } from "./bit";
import { assert, resize, split_first } from 'joshkaposh-iterator/src/util';
import { u32 } from "./Intrinsics";

const BITS = 32;

type usize = number;
type u32 = number;
type Block = u32;

function div_rem(x: usize, d: usize): [usize, usize] {
    return [Math.floor(x / d), Math.floor(x % d)];
}

export class FixedBitSet {
    #data: Block[];
    #length: usize;

    format(type: 'b' | '#b' = 'b') {
        let bstring = type === '#b' ? '0b' : '';
        for (let i = 0; i < this.len(); i++) {
            // @ts-expect-error;
            bstring += this.contains(i) * 1;
        }
        return bstring;
    }

    toString(type?: '#') {
        if (!type) {
            return this.format()
        }
        return this.format('#b')
    }

    constructor(data: Block[] = [], length: usize = 0) {
        this.#data = data;
        this.#length = length;
    }

    static from(src: IterInputType<usize>) {
        const fb = FixedBitSet.with_capacity(0);
        fb.extend(src);
        return fb;
    }

    static and(a: FixedBitSet, b: FixedBitSet): FixedBitSet {
        const [short, long] = a.len() <= b.len() ?
            [a.#data, b.#data] :
            [b.#data, a.#data]
        const data = Array.from(short, (k, i) => k & long[i])
        const len = Math.min(a.len(), b.len())
        return new FixedBitSet(data, len);
    }

    and(other: FixedBitSet) {
        const l = other.len()
        for (let i = 0; i < l; i++) {
            if (!is_some(this.#data[i])) {
                break;
            }
            this.#data[i] &= other.#data[i]
        }
    }

    static or(a: FixedBitSet, b: FixedBitSet): FixedBitSet {
        const [short, long] = a.len() <= b.len() ?
            [a.#data, b.#data] :
            [b.#data, a.#data]
        const data = Array.from(short, (k, i) => k | long[i])
        const len = Math.max(a.len(), b.len())
        return new FixedBitSet(data, len);
    }

    or(other: FixedBitSet) {
        const len = other.len()
        if (this.#data.length < len) {
            this.grow(len);
        }
        for (let i = 0; i < len; i++) {
            this.#data[i] |= other.#data[i]
        }
    }

    static xor(a: FixedBitSet, b: FixedBitSet): FixedBitSet {
        const [short, long] = a.len() <= b.len() ?
            [a.#data, b.#data] :
            [b.#data, a.#data]
        const data = Array.from(short, (k, i) => k ^ long[i])
        const len = Math.max(a.len(), b.len())
        return new FixedBitSet(data, len);
    }

    xor(other: FixedBitSet) {
        const len = other.len()
        if (this.#data.length < len) {
            this.grow(len);
        }
        for (let i = 0; i < len; i++) {
            this.#data[i] ^= other.#data[i]
        }
    }

    static default() {
        return FixedBitSet.with_capacity(0);
    }

    static with_capacity(bits: usize) {
        let [blocks, rem] = div_rem(bits, BITS);
        // @ts-expect-error
        blocks += (rem > 0) * 1
        return new FixedBitSet(Array.from({ length: blocks }, () => 0), bits)
    }

    static with_capacity_and_blocks(bits: usize, blocks: Iterable<Block>) {
        let [n_blocks, rem] = div_rem(bits, BITS)
        // @ts-expect-error
        n_blocks += (rem > 0) * 1
        const data = Array.from(blocks);
        if (data.length !== n_blocks) {
            resize(data, n_blocks, 0);
        }
        const end = data.length * 32;
        for (const [block, mask] of new Masks(range(bits, end), end)) {
            // @ts-expect-error
            data[block] &= !mask;
        }
        return new FixedBitSet(data, bits)
    }

    eq(other: FixedBitSet) {
        for (let i = 0; i < this.#data.length; i++) {
            if (!is_some(other.#data[i])) {
                break;
            }
            if (this.#data[i] != other.#data[i]) {
                return false
            }
        }
        return true
    }

    extend(src: IterInputType<usize>) {
        const it = iter(src)
        for (const i of it) {
            if (i >= this.len()) {
                this.grow(i + 1)
            }
            this.put(i);
        }
    }

    clone() {
        return new FixedBitSet(structuredClone(this.#data), this.len())
    }

    grow(bits: usize) {
        let [blocks, rem] = div_rem(bits, BITS);
        // @ts-expect-error
        blocks += (rem > 0) * 1;
        if (bits > this.#length) {
            this.#length = bits;
            resize(this.#data, blocks, 0);
        }
    }

    len() {
        return this.#length;
    }

    is_empty() {
        return this.#length === 0;
    }
    is_clear(): boolean {
        return iter(this.#data).all(v => v === 0)
    }

    get(bit: usize): boolean {
        return this.contains(bit)
    }

    contains(bit: usize): boolean {
        const [block, i] = div_rem(bit, BITS)
        const b = this.#data[block]
        if (!is_some(b)) {
            return false
        }
        return (b & (1 << i)) !== 0
    }

    clear() {
        for (let i = 0; i < this.#data.length; i++) {
            this.#data[i] = 0;
        }
    }

    /**
     * @summary Enable `bit`
     */
    insert(bit: usize) {
        assert(bit < this.#length);
        const [block, i] = div_rem(bit, BITS);
        this.#data[block] = set(this.#data[block], i);
    }

    /**
     * @summary Enable 'bit' and return its previous value
     */
    put(bit: usize): 0 | 1 {
        assert(bit < this.#length)
        const [block, i] = div_rem(bit, BITS)
        let word = this.#data[block];
        const prev = (word & (1 << i)) !== 0
        word |= 1 << i;
        this.#data[block] = word;
        // @ts-expect-error
        return prev * 1
    }


    /**
     * @summary Toggle `bit`.
     * @description 
     * Toggles `bit`
     * 
     *  If `bit` is set to 0,
     *  it is set to 1.
     *  If `bit` is set to 0,
     *  it is set to 1 
     */
    toggle(bit: usize) {
        assert(bit < this.#length)
        const [block, i] = div_rem(bit, BITS)
        this.#data[block] ^= 1 << i;
    }

    /**
     * @description Sets a target bit to a target value.
     * @example
     * const f = FixedBitSet.with_capacity(0);
     * 
     * f.set(0, true)
     * f.contains(0) // true
     *
     *  f.set(1, true)
     * f.set(1, false)
     * f.contains(1) // false
    * 
    */
    set(bit: usize, enabled: 0 | 1 | false | true) {
        assert(bit < this.#length)
        const [block, i] = div_rem(bit, BITS);
        let elt = this.#data[block];
        elt = enabled ? set(elt, i) : clear(elt, i)
        this.#data[block] = elt;
    }


    copy_bit(from: usize, to: usize) {
        assert(to < this.#length);
        const [to_block, t] = div_rem(to, BITS);
        const enabled = this.contains(from);
        const to_elt = this.#data[to_block];
        this.#data[to_block] = set_to(to_elt, t, enabled);
    }

    count_ones(range: Range): number {
        assert(range.start <= range.end && range.end <= this.#length);
        let count = 0;
        for (const i of range) {
            if (this.contains(i)) {
                count++;
            }
        }
        return count;
    }

    set_range(range: Range, enabled: 0 | 1 | false | true) {
        for (const i of range) {
            this.set(i, enabled)
        }
    }


    insert_range(range: Range = new Range(0, this.#length)) {
        this.set_range(range, 1);
    }

    toggle_range(range: Range) {
        for (const i of range) {
            this.toggle(i);
        }
    }

    as_slice() {
        return this.#data;
    }

    ones() {
        const opt = split_first(this.#data);
        if (opt) {
            const [block, rem] = opt
            return new Ones(block, 0, rem)
        } else {
            return new Ones(0, 0, []);
        }
    }

    intersection(other: FixedBitSet) {
        return new Intersection(this.ones(), other)
    }

    // in-place intersection of two 'FixedBitSet's;
    // 'self's capacity will remain the same
    intersect_with(other: FixedBitSet) {
        const l = this.#data.length;
        for (let i = 0; i < l; i++) {
            this.#data[i] &= other.#data[i];
        }
        let mn = Math.min(this.#data.length, other.#data.length);
        for (let i = mn; i < this.#data.length; i++) {
            this.#data[i] = 0;
        }
    }

    union(other: FixedBitSet) {
        return new Union(this.ones().chain(other.difference(this)))
    }

    difference(other: FixedBitSet) {
        return new Difference(this.ones(), other);
    }

    // in-place difference of two 'FixedBitSet's;
    // 'self's capacity will remain the same
    difference_with(other: FixedBitSet) {
        const l = this.#data.length;
        for (let i = 0; i < l; i++) {
            // @ts-expect-error;
            this.#data[i] &= !other.#data[i];
        }
    }

    symmetric_difference(other: FixedBitSet) {
        return new SymmetricDifference(this.difference(other).chain(other.difference(this)))
    }



    // in-place symmetric difference of two 'FixedBitSet's;
    // 'self's capacity may be increased to match 'other's
    symmetric_difference_with(other: FixedBitSet) {
        if (other.len() >= this.len()) {
            this.grow(other.len())
        }
        const m = Math.max(this.#data.length, other.#data.length)
        for (let i = 0; i < m; i++) {
            this.#data[i] ^= other.#data[i];
        }
    }

    union_with(other: FixedBitSet) {
        if (other.len() >= this.len()) {
            this.grow(other.len())
        }
        for (let i = 0; i < this.len(); i++) {
            const y = other.as_slice()[i];
            this.#data[i] |= y
        }
    }

    // returns 'true' if 'self' has no elements in common with 'other' 
    is_disjoint(other: FixedBitSet): boolean {
        return iter(this.#data)
            .zip(iter(other.as_slice()))
            .all(([x, y]) => (x & y) === 0)
    }

    is_subset(other: FixedBitSet): boolean {
        return iter(this.#data)
            .zip(iter(other.as_slice()))
            // @ts-expect-error
            .all(([x, y]) => (x & !y) === 0)
            && iter(this.#data).skip(other.as_slice().length).all(x => x === 0)
    }

    is_superset(other: FixedBitSet) {
        return other.is_subset(this)
    }

    [Symbol.iterator]() {
        return this.#data[Symbol.iterator]();
    }
}

class Difference extends Iterator<number> {
    #iter: Ones;
    #other: FixedBitSet;
    constructor(iter: Ones, other: FixedBitSet) {
        super()
        this.#iter = iter;
        this.#other = other;
    }

    override into_iter(): Iterator<number> {
        this.#iter.into_iter();
        return this
    }

    override next(): IteratorResult<number> {
        let n;
        while (!(n = this.#iter.next()).done) {
            if (!this.#other.contains(n.value)) {
                return {
                    done: false,
                    value: n.value
                }
            }
        }
        return done()
    }
}

class SymmetricDifference extends Iterator<number> {
    #iter: Iterator<number>
    constructor(iter: Iterator<number>) {
        super()
        this.#iter = iter;
    }
    override into_iter(): Iterator<number> {
        this.#iter.into_iter()
        return this
    }
    override next(): IteratorResult<number> {
        return this.#iter.next();
    }
}

class Intersection extends Iterator<number> {
    #iter: Ones;
    #other: FixedBitSet;
    constructor(iter: Ones, other: FixedBitSet) {
        super()
        this.#iter = iter;
        this.#other = other
    }
    override into_iter(): Iterator<number> {
        this.#iter.into_iter()
        return this;
    }
    override next(): IteratorResult<number> {
        let n;
        while (!(n = this.#iter.next()).done) {
            if (this.#other.contains(n.value)) {
                return n;
            }
        }
        return done();
    }
}


class Union extends Iterator<number> {
    #iter: Iterator<number>;
    constructor(iter: Iterator<number>) {
        super();
        this.#iter = iter;
    }
    override into_iter(): Iterator<number> {
        this.#iter.into_iter()
        return this;
    }
    override next(): IteratorResult<number> {
        return this.#iter.next();
    }
}

function new_mask(start: number, end: number) {
    const [first_block, first_rem] = div_rem(start, BITS);
    const [last_block, last_rem] = div_rem(end, BITS);

    const lr = carrot_left(
        carrot_left(u32.MAX, 1),
        BITS - last_rem - 1
    );

    return [
        first_block,
        carrot_left(u32.MAX, first_rem),
        last_block,
        lr
    ] as const

}

class Masks extends Iterator<[usize, Block]> {
    #first_block: usize;
    #first_mask: Block;
    #last_block: usize;
    #last_mask: Block;


    #masks: readonly [usize, Block, usize, Block];

    constructor(range: Range, len: usize) {
        super();
        const start = range.start ?? 0;
        const end = range.end ?? len;

        assert(start <= end && end <= len);

        const masks = new_mask(start, end);
        this.#masks = masks;
        const [first_block, first_mask, last_block, last_mask] = masks

        this.#first_block = first_block;
        this.#first_mask = first_mask;
        this.#last_block = last_block;
        this.#last_mask = last_mask;
    }

    into_iter(): Iterator<[number, number]> {
        this.#first_block = this.#masks[0];
        this.#first_mask = this.#masks[1];
        this.#last_block = this.#masks[2];
        this.#last_mask = this.#masks[3];
        return this;
    }

    next(): IteratorResult<[number, number]> {
        if (this.#first_block < this.#last_block) {
            const res = [this.#first_block, this.#first_mask] as [usize, Block];
            this.#first_block += 1;
            // @ts-expect-error
            this.#first_mask = !0;
            return { done: false, value: res }

        } else if (this.#first_block === this.#last_block) {
            const mask = this.#first_mask & this.#last_mask;
            const res = mask === 0 ? done() : { done: false, value: [this.#first_block, mask] }
            this.#first_block += 1;
            return res as IteratorResult<[usize, Block]>
        } else {
            return done();
        }
    }
}

class Ones extends Iterator<usize> {
    #bitset: Block;
    #block_index: usize;
    #remaining_blocks: Block[];
    #copy: [
        bitset: Block,
        block_index: usize,
        remaining_blocks: Block[]
    ]

    constructor(bitset: Block, block_index: usize, remaining_blocks: Block[]) {
        super()
        this.#bitset = bitset;
        this.#block_index = block_index;
        this.#remaining_blocks = remaining_blocks;
        this.#copy = [bitset, block_index, remaining_blocks];
    }

    into_iter(): Iterator<number> {
        this.#bitset = this.#copy[0];
        this.#block_index = this.#copy[1];
        this.#remaining_blocks = this.#copy[2];
        return this;
    }

    override next(): IteratorResult<usize> {
        while (this.#bitset === 0) {
            if (this.#remaining_blocks.length === 0) {
                return done()
            }
            this.#bitset = this.#remaining_blocks[0];
            this.#remaining_blocks = this.#remaining_blocks.slice(1, this.#remaining_blocks.length);
            this.#block_index++;
        }
        const t = this.#bitset & u32.wrapping_sub(0, this.#bitset)
        const r = trailing_zeros(this.#bitset);
        this.#bitset ^= t;
        return {
            done: false,
            value: this.#block_index * BITS + r
        }
    }
}




