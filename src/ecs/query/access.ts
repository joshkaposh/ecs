import { Iterator } from "joshkaposh-iterator";
import { FixedBitSet } from "../../fixed-bit-set";
import { extend } from "../../array-helpers";

type SparseSetIndex = number;

type FormattedBitSet = {
    bit_set: FixedBitSet;
    // _marker: PhantomData
}

export class Access<T extends SparseSetIndex> {
    // All accessed elements.
    __reads_and_writes: FixedBitSet;
    // The exclusively-accessed elements.
    __writes: FixedBitSet;
    // Is true if this has access to all elements in the collection.
    // This field is a performance optimization for World (also harder to mess up for soundness).
    __reads_all: boolean;
    // Is true if this has mutable access to all elements in the collection.
    // If this is true, then `reads_all` must also be true.
    __writes_all: boolean;
    // Elements that are not accessed, but whose presence in an archetype affect query results.
    __archetypal: FixedBitSet;

    constructor(reads_all: boolean, writes_all: boolean, reads_and_writes: FixedBitSet, writes: FixedBitSet, archetypal: FixedBitSet) {
        this.__reads_all = reads_all//false;
        this.__writes_all = writes_all//false;
        this.__reads_and_writes = reads_and_writes//new FixedBitSet();
        this.__writes = writes//new FixedBitSet();
        this.__archetypal = archetypal//new FixedBitSet();
    }

    clone(): Access<T> {
        return new Access(this.__reads_all, this.__reads_all, this.__reads_and_writes.clone(), this.__writes.clone(), this.__archetypal.clone());
    }

    eq(other: Access<T>) {
        const reads_writes = other.__reads_all === this.__reads_all
            && other.__writes_all === this.__writes_all;

        if (!reads_writes) {
            return false
        }

        return other.__reads_and_writes.eq(this.__reads_and_writes)
            && other.__writes.eq(this.__writes)
            && other.__archetypal.eq(this.__archetypal)

    }

    static default<T extends SparseSetIndex>(): Access<T> {
        return new Access(
            false,
            false,
            new FixedBitSet(),
            new FixedBitSet(),
            new FixedBitSet(),
        );
    }

    grow(capacity: number) {
        this.__reads_and_writes.grow(capacity);
        this.__writes.grow(capacity);
    }

    /**
     * @summary Adds access to the element given by `index`. 
     */
    add_read(index: T) {
        this.__reads_and_writes.grow(index + 1)
        this.__reads_and_writes.insert(index);
    }

    /**
     * @summary Adds exclusive access to the element given by `index`. 
     */
    add_write(index: T) {
        this.__reads_and_writes.grow(index + 1);
        this.__reads_and_writes.insert(index);
        this.__writes.grow(index + 1);
        this.__writes.insert(index);
    }

    /**
     * @description
     * Adds an archetypal (indirect) access to the element given by `index`.
     * 
     * This is for elements whose values are not accessed (and thus will never cause conflicts),
     * but whose presence in an archetype may affect query results.
     * 
     * Currently, this is only used for [`Has<T>`].
     */
    add_archetypal(index: T) {
        this.__archetypal.grow(index + 1);
        this.__archetypal.insert(index);
    }

    /**
     * @returns Returns `true` if this can access the given element given by `index`.
     */
    has_read(index: T): boolean {
        return this.__reads_all || this.__reads_and_writes.contains(index)
    }
    /**
     * @returns Returns `true` if this can access anything.
     */
    has_any_read(): boolean {
        return this.__reads_all || !this.__reads_and_writes.is_clear()
    }

    /**
     * @returns Returns `true` if this can exclusively access the element given by `index`.
     */
    has_write(index: T): boolean {
        return this.__writes_all || this.__writes.contains(index);
    }
    /**
     * @returns Returns `true` if this accesses anything mutably.
     */
    has_any_write(): boolean {
        return this.__writes_all || !this.__writes.is_clear();
    }

    /**
     * @description
     * Returns true if this has an archetypal (indirect) access to the element given by `index`.
     * 
     * This is an element whose value is not accessed (and thus will never cause conflicts),
     * but whose presence in an archetype may affect query results.
     * 
     * Currently, this is only used for [`Has<T>`].
     */
    has_archetypal(index: T): boolean {
        return this.__archetypal.contains(index);
    }

    /**
     * @summary Sets this as having access to all indexed elements (i.e World).
     */
    read_all(): void {
        this.__reads_all = true;
    }

    /**
     * @summary Sets this as having mutable access to all indexed elements (i.e EntityMut).
     */
    write_all(): void {
        this.__reads_all = true;
        this.__writes_all = true;
    }

    has_read_all(): boolean {
        return this.__reads_all
    }

    has_write_all(): boolean {
        return this.__writes_all;
    }

    /**
     * @summary Removes all writes.
     */
    clear_writes() {
        this.__writes_all = false;
        this.__writes.clear();
    }

    /**
     * @summary Removes all accesses.
     */
    clear() {
        this.__reads_all = false;
        this.__writes_all = false;
        this.__reads_and_writes.clear();
        this.__writes.clear();
    }

    /**
     * @summary Adds all access from `other`
     */
    extend(other: Access<T>) {
        this.__reads_all = this.__reads_all || other.__reads_all
        this.__writes_all = this.__writes_all || other.__writes_all
        this.__reads_and_writes.union_with(other.__reads_and_writes);
        this.__writes.union_with(other.__writes);
    }

    /**
     * @description
     * Returns `true` if the access and `other` can be active at the same time.
     * 
     * [`Access`] instances are incompatible if one can write
     * an element that the other can read or write.
     */
    is_compatible(other: Access<T>) {
        if (this.__writes_all) {
            return !other.has_any_read();
        }

        if (other.__writes_all) {
            return !this.has_any_read();
        }

        if (this.__reads_all) {
            return !other.has_any_write();
        }

        if (other.__reads_all) {
            return !this.has_any_write()
        }

        return (
            this.__writes.is_disjoint(other.__reads_and_writes)
            && other.__writes.is_disjoint(this.__reads_and_writes)
        )
    }

    /**
     * @description
     * Returns true if the set is another subset of another, i.e `other` contains
     * at least all the values in `self`.
    */
    is_subset(other: Access<T>): boolean {
        if (this.__writes_all) {
            return other.__writes_all
        }

        if (other.__writes_all) {
            return true;
        }

        if (this.__reads_all) {
            return other.__reads_all
        }

        if (other.__reads_all) {
            return this.__writes.is_subset(other.__writes)
        }

        return (
            this.__reads_and_writes.is_subset(other.__reads_and_writes)
            && this.__writes.is_subset(other.__writes)
        )
    }

    get_conflicts(other: Access<T>): T[] {
        const conflicts = FixedBitSet.default();

        if (this.__reads_all) {
            conflicts.extend(other.__writes.ones());
        }

        if (other.__reads_all) {
            conflicts.extend(this.__writes.ones());
        }

        if (this.__writes_all) {
            conflicts.extend(other.__reads_and_writes.ones());
        }

        if (other.__writes_all) {
            conflicts.extend(this.__reads_and_writes.ones());
        }

        conflicts.extend(this.__writes.intersection(other.__reads_and_writes));
        conflicts.extend(this.__reads_and_writes.intersection(other.__writes));

        return conflicts.ones().collect() as T[]
    }

    /**
     * @summary Returns the indices of the elements this has access to.
     */
    reads_and_writes(): Iterator<T> {
        return this.__reads_and_writes.ones() as unknown as Iterator<T>
    }
    /**
     * @summary Returns the indices of the elements this has non-exclusive access to.
     */
    reads(): Iterator<T> {
        return this.__reads_and_writes
            .difference(this.__writes)
            // @ts-expect-error
            .map(i => new SparseSetIndex(i))
    }

    writes(): Iterator<T> {
        // @ts-expect-error
        return this.__writes.ones().map(i => new SparseSetIndex(i))
    }


    /**
     * @description
     * Returns the indices of the elements that this has an archetypal access to.
     * 
     * These are elements whos values are not accessed (and thus will never cause conflicts),
     * but whose presence in an archetype may affect query results.
     * 
     * Currently, this is only used for [`Has<T>`].
     */
    archetypal(): Iterator<T> {
        // @ts-expect-error
        return this.__archetypal.ones().map(i => new SparseSetIndex(i));
    }
}

export class FilteredAccess<T extends SparseSetIndex> {
    __access: Access<T>;
    __required: FixedBitSet;
    __filter_sets: AccessFilters<T>[];

    constructor(access: Access<T>, required: FixedBitSet, filter_sets: AccessFilters<T>[]) {
        this.__access = access;
        this.__required = required;
        this.__filter_sets = filter_sets;
    }

    eq(other: FilteredAccess<T>): boolean {
        return this.__access.eq(other.__access)
            && this.__required.eq(other.__required)
            && this.__filter_sets.every((v, i) => v.eq(other.__filter_sets[i]))
    }

    clone(): FilteredAccess<T> {
        return new FilteredAccess<T>(this.__access.clone(), this.__required.clone(), structuredClone(this.__filter_sets))
    }

    static default<T extends SparseSetIndex>(): FilteredAccess<T> {
        return new FilteredAccess(
            Access.default(),
            FixedBitSet.default(),
            [AccessFilters.default()]
        );
    }

    access(): Access<T> {
        return this.__access;
    };

    add_read(index: T): void {
        this.__access.add_read(index);
        this.__add_required(index);
        this.and_with(index);
    };

    add_write(index: T): void {
        this.__access.add_write(index);
        this.__add_required(index);
        this.and_with(index);
    }

    __add_required(index: T): void {
        const i = index;
        this.__required.grow(i + 1);
        this.__required.insert(i);
    }

    /**
    *@description
    * Adds a `With` filter: corresponds to a conjuction (AND) operation.
    *
    * Suppose we begin with `Or<[With<A>, With<B>]>`, which is represented by an array of two `AccessFilter` instances.
    * Adding `AND With<C>` via this method transforms it into the equivalent of `Or<[[With<A>, With<C>], [With<B>, With<C>]]>`
    */
    and_with(index: T): void {
        const i = index;
        for (const filter of this.__filter_sets) {
            filter.with.grow(i + 1);
            filter.with.insert(i);
        }
    }

    and_without(index: T): void {
        const i = index;
        for (const filter of this.__filter_sets) {
            filter.without.grow(i + 1);
            filter.without.insert(i);
        }
    }

    append_or(other: FilteredAccess<T>): void {
        this.__filter_sets.push(...other.__filter_sets)
    }

    extend_access(other: FilteredAccess<T>): void {
        this.__access.extend(other.__access);
    }

    is_compatible(other: FilteredAccess<T>): boolean {
        if (this.__access.is_compatible(other.__access)) {
            return true;
        }

        return this.__filter_sets.every((filter) => {
            return other.__filter_sets.every(other_filter => {
                filter.is_ruled_out_by(other_filter);
            })
        })
    }

    get_conflicts(other: FilteredAccess<T>) {
        if (!this.is_compatible(other)) {
            return this.__access.get_conflicts(other.__access);
        }

        return [];
    }

    extend(other: FilteredAccess<T>) {
        this.__access.extend(other.__access);
        this.__required.union_with(other.__required);

        if (other.__filter_sets.length === 1) {
            for (const filter of this.__filter_sets) {
                filter.with.union_with(other.__filter_sets[0].with)
                filter.without.union_with(other.__filter_sets[0].without)
            }
            return
        }

        // Vec::with_capacity(self.filter_sets.len() * other.filter_sets.len());
        const new_filters = []
        for (const filter of this.__filter_sets) {
            for (const other_filter of other.__filter_sets) {
                const new_filter = filter.clone();
                new_filter.with.union_with(other_filter.with);
                new_filter.without.union_with(other_filter.without);
                new_filters.push(new_filter);
            }
        }

        this.__filter_sets = new_filters;
    }

    read_all() {
        this.__access.read_all();
    }

    write_all() {
        this.__access.write_all()
    }

    is_subset(other: FilteredAccess<T>): boolean {
        return this.__required.is_subset(other.__required) && this.__access.is_subset(other.access());
    }

    /**
    * @description
    * Returns `true` if the set is a subset of another, i.e. `other` contains
    * at least all the values in `self`.
    */
    with_filters(): Iterator<T> {
        // @ts-expect-error;
        return this.__filter_sets.flatMap(filter => filter.with.ones().map(i => new SparseSetIndex(i)));
    }

    without_filters(): Iterator<T> {
        // @ts-expect-error
        return this.__filter_sets.flatMap(filter => filter.without.ones().map(i => new SparseSetIndex(i)));
    }
}

export class AccessFilters<T extends SparseSetIndex> {
    with: FixedBitSet;
    without: FixedBitSet;

    constructor(_with: FixedBitSet, without: FixedBitSet) {
        this.with = _with;
        this.without = without;
    }

    static default<T extends SparseSetIndex>(): AccessFilters<T> {
        return new AccessFilters(FixedBitSet.default(), FixedBitSet.default());
    }

    eq(other: AccessFilters<T>) {
        return other.with.eq(this.with) && other.without.eq(this.without);
    }

    clone() {
        return new AccessFilters(
            this.with.clone(),
            this.without.clone()
        )
    }

    is_ruled_out_by(other: AccessFilters<T>): boolean {
        return this.with.is_disjoint(other.without) || !this.without.is_disjoint(other.with)
    }
}

export class FilteredAccessSet<T extends SparseSetIndex> {
    #combined_access: Access<T>;
    #filtered_accesses: FilteredAccess<T>[];

    constructor(combined_access: Access<T>, filtered_accesses: FilteredAccess<T>[]) {
        this.#combined_access = combined_access;
        this.#filtered_accesses = filtered_accesses;
    }

    static default<T extends SparseSetIndex>(): FilteredAccessSet<T> {
        return new FilteredAccessSet(Access.default<T>(), [])
    }

    static from<T extends SparseSetIndex>(filtered_access: FilteredAccess<T>): FilteredAccessSet<T> {
        const base = FilteredAccessSet.default<T>();
        base.add(filtered_access);
        return base;
    }

    eq(other: FilteredAccessSet<T>): boolean {
        return this.#combined_access.eq(other.#combined_access) && other.#filtered_accesses.every((v, i) => v.eq(this.#filtered_accesses[i]));
    }

    combined_access(): Access<T> {
        return this.#combined_access
    }

    is_compatible(other: FilteredAccessSet<T>): boolean {
        if (this.#combined_access.is_compatible(other.#combined_access)) {
            return true;
        }

        for (const filtered of this.#filtered_accesses) {
            for (const other_filtered of other.#filtered_accesses) {
                if (!filtered.is_compatible(other_filtered)) {
                    return false
                }
            }
        }

        return true
    }

    get_conflicts(other: FilteredAccessSet<T>): T[] {
        const conflicts = new Set<T>();

        if (!this.#combined_access.is_compatible(other.combined_access())) {
            for (const filtered of this.#filtered_accesses) {
                for (const other_filtered of other.#filtered_accesses) {
                    extend(conflicts, filtered.get_conflicts(other_filtered))
                }
            }
        }

        return Array.from(conflicts);
    }

    get_conflicts_single(filtered_access: FilteredAccess<T>): T[] {
        const conflicts = new Set<T>();

        if (!this.#combined_access.is_compatible(filtered_access.access())) {
            for (const filtered of this.#filtered_accesses) {
                extend(conflicts, filtered.get_conflicts(filtered_access))
            }
        }

        return Array.from(conflicts)
    }

    /**
     * @summary Adds the filtered access to the set.
     */
    add(filtered_access: FilteredAccess<T>): void {
        this.#combined_access.extend(filtered_access.access());
        this.#filtered_accesses.push(filtered_access);
    }

    /**
     * @summary Adds a read access without filters to the set.
     */
    __add_unfiltered_read(index: T): void {
        const filter = FilteredAccess.default<T>();
        filter.add_read(index);
        this.add(filter);
    }
    /**
     * @summary Adds a write access without filters to the set.
     */
    __add_unfiltered_write(index: T): void {
        const filter = FilteredAccess.default<T>();
        filter.add_write(index);
        this.add(filter);
    }

    extend(filtered_access_set: FilteredAccessSet<T>): void {
        this.#combined_access.extend(filtered_access_set.#combined_access);
        extend(this.#filtered_accesses, filtered_access_set.#filtered_accesses);
    }

    clear() {
        this.#combined_access.clear();
        this.#filtered_accesses.length = 0;
    }
}