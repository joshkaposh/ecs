import { iter, Iterator } from "joshkaposh-iterator";
import { FixedBitSet } from "fixed-bit-set";
import { extend } from "../../array-helpers";
import { is_some, Option } from "joshkaposh-option";

type SparseSetIndex = number;

export class Access<T extends SparseSetIndex = SparseSetIndex> {
    constructor(
        public __component_read_and_writes: FixedBitSet = new FixedBitSet(),
        /// All exclusively-accessed components, or components that may not be
        /// exclusively accessed if `Self::component_writes_inverted` is set.
        public __component_writes = new FixedBitSet(),
        /// All accessed resources.
        public __resource_read_and_writes = new FixedBitSet(),
        /// The exclusively-accessed resources.
        public __resource_writes = new FixedBitSet(),
        /// Is `true` if this component can read all components *except* those
        /// present in `Self::component_read_and_writes`.
        public __component_read_and_writes_inverted = false,
        /// Is `true` if this component can write to all components *except* those
        /// present in `Self::component_writes`.
        public __component_writes_inverted = false,
        /// Is `true` if this has access to all resources.
        /// This field is a performance optimization for `&World` (also harder to mess up for soundness).
        public __reads_all_resources = false,
        /// Is `true` if this has mutable access to all resources.
        /// If this is true, then `reads_all` must also be true.
        public __writes_all_resources = false,
        // Components that are not accessed, but whose presence in an archetype affect query results.
        public __archetypal = new FixedBitSet(),
    ) {
    }

    clone_from(other: Access) {
        return new Access(
            other.__component_read_and_writes.clone(),
            other.__component_writes.clone(),
            other.__resource_read_and_writes.clone(),
            other.__resource_writes.clone(),
            other.__component_read_and_writes_inverted,
            other.__component_writes_inverted,
            other.__reads_all_resources,
            other.__writes_all_resources,
            other.__archetypal.clone()
        );
    }

    clone(): Access<T> {
        return new Access(
            this.__component_read_and_writes.clone(),
            this.__component_writes.clone(),
            this.__resource_read_and_writes.clone(),
            this.__resource_writes.clone(),
            this.__component_read_and_writes_inverted,
            this.__component_writes_inverted,
            this.__reads_all_resources,
            this.__writes_all_resources,
            this.__archetypal.clone()
        );
    }

    static default<T extends SparseSetIndex>(): Access<T> {
        return new Access();
    }

    add_component_read(index: T) {
        if (!this.__component_read_and_writes_inverted) {
            this.__component_read_and_writes.grow_insert(index);
        } else if (index < this.__component_read_and_writes.len()) {
            this.__component_read_and_writes.set(index, false);
        }
    }

    add_component_write(index: T) {
        this.add_component_read(index);
        if (!this.__component_writes_inverted) {
            this.__component_writes.grow_insert(index);
        } else if (index < this.__component_writes.len()) {
            this.__component_writes.set(index, false);
        };
    }

    add_resource_read(index: T) {
        this.__resource_read_and_writes.grow_insert(index);
    }

    add_resource_write(index: T) {
        this.__resource_read_and_writes.grow_insert(index);
        this.__resource_writes.grow_insert(index);
    }

    __remove_component_read(index: T) {
        if (this.__component_read_and_writes_inverted) {
            this.__component_read_and_writes.grow_insert(index)
        } else if (index < this.__component_read_and_writes.len()) {
            this.__component_read_and_writes.set(index, false);
        }
    }

    __remove_component_write(index: T) {
        if (this.__component_writes_inverted) {
            this.__component_writes.grow_insert(index)
        } else if (index < this.__component_writes.len()) {
            this.__component_writes.set(index, false);
        }
    }

    remove_component_read(index: T) {
        this.__remove_component_write(index);
        this.__remove_component_read(index);
    }

    remove_component_write(index: T) {
        this.__remove_component_write(index);
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

    has_component_read(index: T) {
        // @ts-expect-error
        return Boolean(this.__component_read_and_writes_inverted ^ this.__component_read_and_writes.contains(index))
    }

    has_any_component_read(index?: T): boolean {
        if (this.__component_writes_inverted) {
            return true
        } else if (is_some(index)) {
            return this.__component_read_and_writes.contains(index)
        } else {
            return !this.__component_read_and_writes.is_clear()
        }
    }

    has_component_write(index: T): boolean {
        // @ts-expect-error
        return Boolean(this.__component_read_and_writes_inverted ^ this.__component_writes.contains(index))
    }

    has_any_component_write(index?: T): boolean {
        if (this.__component_writes_inverted) {
            return true
        } else if (is_some(index)) {
            return this.__component_writes.contains(index)
        } else {
            return !this.__component_writes.is_clear()
        }
    }

    has_resource_read(index: T): boolean {
        return this.__reads_all_resources || this.__resource_read_and_writes.contains(index);
    }

    has_any_resource_read(index?: T): boolean {
        if (this.__reads_all_resources) {
            return true
        } else if (is_some(index)) {
            return this.__component_read_and_writes.contains(index)
        } else {
            return this.__component_read_and_writes.is_clear();
        }
    }

    has_resource_write(index: T): boolean {

        return true;
    }

    has_any_resource_write(index?: T): boolean {
        return true
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
    read_all_components(): void {
        this.__component_read_and_writes_inverted = true;
        this.__component_read_and_writes.clear();
    }

    write_all_components(): void {
        this.__component_writes_inverted = true;
        this.__component_writes.clear();
    }

    write_all_resources(): void {
        this.__reads_all_resources = true;
        this.__writes_all_resources = true;
    }

    read_all_resources() {
        this.__reads_all_resources = true;
    }

    read_all() {
        this.read_all_components();
        this.read_all_resources();
    }

    write_all() {
        this.write_all_components();
        this.write_all_resources();
    }

    has_read_all_components() {
        return this.__component_read_and_writes_inverted;
    }

    has_write_all_components() {
        return this.__component_writes_inverted && this.__component_writes.is_clear();
    }

    has_read_all_resources() {
        return this.__reads_all_resources;
    }

    has_write_all_resources() {
        return this.__writes_all_resources;
    }

    has_read_all() {
        return this.has_read_all_components() && this.has_read_all_resources();
    }

    has_write_all() {
        return this.has_write_all_components() && this.has_write_all_resources();
    }

    clear_writes() {
        this.__writes_all_resources = false;
        this.__component_writes_inverted = false;
        this.__component_writes.clear();
        this.__resource_writes.clear();
    }

    clear() {
        this.__reads_all_resources = false;
        this.__writes_all_resources = false;
        this.__component_read_and_writes_inverted = false;
        this.__component_writes_inverted = false;
        this.__component_read_and_writes.clear();
        this.__component_writes.clear();
        this.__resource_read_and_writes.clear();
        this.__resource_writes.clear();
    }

    /**
     * @summary Adds all access from `other`
     */
    extend(other: Access<T>) {
        const component_read_and_writes_inverted = this.__component_read_and_writes_inverted || other.__component_read_and_writes_inverted
        const component_writes_inverted = this.__component_writes_inverted || other.__component_writes_inverted

        const trw = this.__component_read_and_writes_inverted
        const orw = other.__component_read_and_writes_inverted



        if (trw && orw) {
            this.__component_read_and_writes.intersect_with(other.__component_read_and_writes);
        } else if (trw && !orw) {
            this.__component_read_and_writes.difference_with(other.__component_read_and_writes)
        } else if (!trw && orw) {
            this.__component_read_and_writes.grow(Math.max(this.__component_read_and_writes.len(), other.__component_read_and_writes.len()));
            this.__component_read_and_writes.toggle_range();
            this.__component_read_and_writes.intersect_with(other.__component_read_and_writes)

        } else {
            this.__component_read_and_writes.union_with(other.__component_read_and_writes);
        }

        const tw = this.__component_writes_inverted
        const ow = other.__component_writes_inverted

        if (tw && ow) {
            this.__component_writes.intersect_with(other.__component_writes);
        } else if (tw && !ow) {
            this.__component_writes.difference_with(other.__component_writes)
        } else if (!tw && ow) {
            this.__component_writes.grow(Math.max(this.__component_writes.len(), other.__component_writes.len()));
            this.__component_writes.toggle_range();
            this.__component_writes.intersect_with(other.__component_writes)

        } else {
            this.__component_writes.union_with(other.__component_writes);
        }

        this.__reads_all_resources = this.__reads_all_resources || other.__reads_all_resources;
        this.__writes_all_resources = this.__writes_all_resources || other.__writes_all_resources;
        this.__component_read_and_writes_inverted = component_read_and_writes_inverted;
        this.__component_writes_inverted = component_writes_inverted;
        this.__resource_read_and_writes.union_with(other.__resource_read_and_writes);
        this.__resource_writes.union_with(other.__resource_writes);

    }

    is_components_compatible(other: Access<T>): boolean {
        const tups = [
            [
                this.__component_writes,
                other.__component_read_and_writes,
                this.__component_writes_inverted,
                other.__component_read_and_writes_inverted
            ],
            [
                other.__component_writes,
                this.__component_read_and_writes,
                other.__component_writes_inverted,
                this.__component_read_and_writes_inverted

            ]
        ] as const
        for (const [lhs_writes, rhs_reads_and_writes, lhs_writes_inverted, rhs_reads_and_writes_inverted] of tups) {
            if (lhs_writes_inverted && rhs_reads_and_writes_inverted) {
                return false;
            } else if (!lhs_writes_inverted && rhs_reads_and_writes_inverted) {
                if (!lhs_writes.is_subset(rhs_reads_and_writes)) {
                    return false
                }
            } else if (lhs_writes_inverted && !rhs_reads_and_writes_inverted) {
                if (!rhs_reads_and_writes.is_subset(lhs_writes)) {
                    return false
                }
            } else {
                if (!lhs_writes.is_disjoint(rhs_reads_and_writes)) {
                    return false
                }
            }
        }
        return true
    }

    is_resources_compatible(other: Access<T>) {
        if (this.__writes_all_resources) {
            return !other.has_any_resource_read()
        }

        if (other.__writes_all_resources) {
            return !this.has_any_resource_read();
        }

        if (this.__reads_all_resources) {
            return !other.has_any_resource_write();
        }

        if (other.__reads_all_resources) {
            return !this.has_any_resource_write();
        }

        return this.__resource_writes.is_disjoint(other.__resource_read_and_writes) && other.__resource_writes.is_disjoint(this.__resource_read_and_writes)
    }

    /**
     * @description
     * Returns `true` if the access and `other` can be active at the same time.
     * 
     * [`Access`] instances are incompatible if one can write
     * an element that the other can read or write.
     */
    is_compatible(other: Access<T>) {
        return this.is_components_compatible(other) && this.is_resources_compatible(other);
    }

    is_subset_components(other: Access<T>): boolean {
        const tups = [
            [
                this.__component_read_and_writes,
                other.__component_read_and_writes,
                this.__component_read_and_writes_inverted,
                other.__component_read_and_writes_inverted,
            ],
            [
                this.__component_writes,
                other.__component_writes,
                this.__component_writes_inverted,
                other.__component_writes_inverted,
            ],
        ] as const;
        for (const [our_components, their_components, our_component_inverted, their_components_inverted] of tups) {
            if (our_component_inverted && their_components_inverted) {
                if (!their_components.is_subset(our_components)) {
                    return false
                }
            } else if (our_component_inverted && !their_components_inverted) {
                return false
            } else if (!our_component_inverted && their_components_inverted) {
                if (!our_components.is_disjoint(their_components)) {
                    return false
                }
            } else {
                if (!our_components.is_subset(their_components)) {
                    return false
                }
            }
        }

        return true;
    }

    is_subset_resources(other: Access<T>): boolean {
        if (this.__writes_all_resources) {
            return other.__writes_all_resources;
        }

        if (other.__writes_all_resources) {
            return true;
        }

        if (this.__reads_all_resources) {
            return other.__reads_all_resources;
        }

        if (other.__reads_all_resources) {
            return this.__resource_writes.is_subset(other.__resource_writes);
        }

        return this.__resource_read_and_writes.is_subset(other.__resource_read_and_writes) && this.__resource_writes.is_subset(other.__resource_writes);

    }

    is_subset(other: Access<T>): boolean {
        return this.is_subset_components(other) && this.is_subset_resources(other);
    }

    get_component_conflicts(other: Access<T>) {
        const conflicts = new FixedBitSet();
        const tups = [
            [
                this.__component_writes,
                other.__component_read_and_writes,
                this.__component_writes_inverted,
                other.__component_read_and_writes_inverted,
            ],
            [
                other.__component_writes,
                this.__component_read_and_writes,
                other.__component_writes_inverted,
                this.__component_read_and_writes_inverted,
            ],
        ] as const

        for (
            const [lhs_writes,
                rhs_reads_and_writes,
                lhs_writes_inverted,
                rhs_reads_and_writes_inverted,
            ] of tups) {
            let temp_conflicts
            const a = lhs_writes_inverted, b = rhs_reads_and_writes_inverted;
            if (a && b) {
                return AccessConflicts.All
            } else if (!a && b) {
                temp_conflicts = FixedBitSet.from(lhs_writes.difference(rhs_reads_and_writes));
            } else if (a && !b) {
                temp_conflicts = FixedBitSet.from(rhs_reads_and_writes.difference(lhs_writes).collect());
            } else {
                temp_conflicts = FixedBitSet.from(lhs_writes.intersection(rhs_reads_and_writes));
            }

            conflicts.union_with(temp_conflicts);
        }

        return AccessConflicts.Individual(conflicts);
    }

    get_conflicts(other: Access<T>): AccessConflicts {
        const ty = this.get_component_conflicts(other);
        if (ty.type() === AccessConflicts.All.type()) {
            return AccessConflicts.All
        }
        const conflicts = ty.conflicts()!;

        if (this.__reads_all_resources) {
            if (other.__writes_all_resources) {
                return AccessConflicts.All
            }
            conflicts.extend(other.__resource_writes.ones())
        }

        if (other.__reads_all_resources) {
            if (this.__writes_all_resources) {
                return AccessConflicts.All
            }

            conflicts.extend(this.__resource_writes.ones())
        }

        if (this.__writes_all_resources) {
            conflicts.extend(other.__resource_read_and_writes.ones())
        }

        if (other.__writes_all_resources) {
            conflicts.extend(this.__resource_read_and_writes.ones())
        }

        conflicts.extend(
            this.__resource_writes.intersection(other.__resource_read_and_writes)
        )

        conflicts.extend(
            this.__resource_read_and_writes.intersection(other.__resource_writes)
        )

        return AccessConflicts.Individual(conflicts);
    }

    resource_reads_and_writes() {
        return this.__resource_read_and_writes.ones();
    }

    resource_reads(): Iterator<T> {
        return this.__resource_read_and_writes.difference(this.__resource_writes) as unknown as Iterator<T>;
    }

    resouce_writes(): Iterator<T> {
        return this.__resource_writes.ones() as unknown as Iterator<T>;
    }

    archetypal(): Iterator<T> {
        return this.__archetypal.ones() as unknown as Iterator<T>;
    }

    component_reads_and_writes(): [Iterator<T>, boolean] {
        return [this.__component_read_and_writes.ones() as unknown as Iterator<T>, this.__component_read_and_writes_inverted]
    }

    component_writes(): [Iterator<T>, boolean] {
        return [
            this.__component_writes.ones() as unknown as Iterator<T>,
            this.__component_writes_inverted
        ]
    }

}

class AccessConflicts {
    static All = new AccessConflicts();
    static Individual(ty: FixedBitSet) {
        return new AccessConflicts(ty);
    }
    #conflicts: Option<FixedBitSet>;
    #type: 0 | 1;
    constructor(conflicts?: FixedBitSet) {
        this.#type = Number(is_some(conflicts)) as 0 | 1;
        this.#conflicts = conflicts;
    }

    type() {
        return this.#type
    }

    conflicts() {
        return this.#conflicts
    }

    static empty() {
        return AccessConflicts.Individual(new FixedBitSet())
    }

    add(other: AccessConflicts) {
        if (other.#type === 0) {
            this.#type = 0;

        } else if (this.#type === 1 && other.#type === 1) {
            this.#conflicts!.extend(other.#conflicts!.ones())
        }
    }

    is_empty() {
        return this.#type === 0 ? false : this.#conflicts?.is_empty()
    }

    iter() {
        if (this.#type === 0) {
            return iter<number[]>([])
        } else {
            return this.#conflicts!.ones();
        }
    }

    [Symbol.iterator]() {
        return this.iter();
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

    static default<T extends SparseSetIndex>(): FilteredAccess<T> {
        return FilteredAccess.matches_everything();
    }

    static matches_everything<T extends SparseSetIndex>(): FilteredAccess<T> {
        return new FilteredAccess(
            Access.default(),
            FixedBitSet.default(),
            [AccessFilters.default()]
        )
    }

    static matches_nothing<T extends SparseSetIndex>(): FilteredAccess<T> {
        return new FilteredAccess(
            Access.default(),
            FixedBitSet.default(),
            []
        )
    }

    clone(): FilteredAccess<T> {
        const sets = Array.from({ length: this.__filter_sets.length }, (_, i) => this.__filter_sets[i].clone());
        return new FilteredAccess<T>(this.__access.clone(), this.__required.clone(), sets)
    }


    access(): Access<T> {
        return this.__access;
    };

    add_component_read(index: T): void {
        this.__access.add_component_read(index);
        this.__add_required(index);
        this.and_with(index);
    };

    add_component_write(index: T): void {
        this.__access.add_component_write(index);
        this.__add_required(index);
        this.and_with(index);
    }

    add_resource_read(index: T) {
        this.__access.add_resource_read(index);
    }

    add_resource_write(index: T) {
        this.__access.add_resource_write(index);
    }

    __add_required(index: T): void {
        this.__required.grow_insert(index);
    }

    /**
    *@description
    * Adds a `With` filter: corresponds to a conjuction (AND) operation.
    *
    * Suppose we begin with `Or<[With<A>, With<B>]>`, which is represented by an array of two `AccessFilter` instances.
    * Adding `AND With<C>` via this method transforms it into the equivalent of `Or<[[With<A>, With<C>], [With<B>, With<C>]]>`
    */
    and_with(index: T): void {
        for (const filter of this.__filter_sets) {
            filter.with.grow_insert(index);
        }
    }

    and_without(index: T): void {
        for (const filter of this.__filter_sets) {
            filter.without.grow_insert(index);
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

        return this.__filter_sets.every(filter => (
            other.__filter_sets.every(other_filter => filter.is_ruled_out_by(other_filter))
        ))
    }

    get_conflicts(other: FilteredAccess<T>) {
        if (!this.is_compatible(other)) {
            return this.__access.get_conflicts(other.__access);
        }

        return AccessConflicts.empty();
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

    read_all_components() {
        return this.__access.read_all_components();
    }

    write_all_components() {
        return this.__access.write_all_components();
    }


    is_subset(other: FilteredAccess<T>): boolean {
        return this.__required.is_subset(other.__required) && this.__access.is_subset(other.access());
    }

    with_filters(): Iterator<T> {
        return iter(this.__filter_sets).flat_map(f => f.with.ones()) as unknown as Iterator<T>
    }

    without_filters(): Iterator<T> {
        return iter(this.__filter_sets).flat_map(f => f.without.ones()) as unknown as Iterator<T>
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

    clone(): FilteredAccessSet<T> {
        return new FilteredAccessSet(this.#combined_access.clone(), structuredClone(this.#filtered_accesses))
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

    get_conflicts(other: FilteredAccessSet<T>): AccessConflicts {
        const conflicts = AccessConflicts.empty();

        if (!this.#combined_access.is_compatible(other.combined_access())) {
            for (const filtered of this.#filtered_accesses) {
                for (const other_filtered of other.#filtered_accesses) {
                    conflicts.add(filtered.get_conflicts(other_filtered))
                }
            }
        }

        return conflicts
    }

    get_conflicts_single(filtered_access: FilteredAccess<T>): AccessConflicts {
        const conflicts = AccessConflicts.empty();

        if (!this.#combined_access.is_compatible(filtered_access.access())) {
            for (const filtered of this.#filtered_accesses) {
                conflicts.add(filtered.get_conflicts(filtered_access))
            }
        }

        return conflicts
    }

    /**
     * @summary Adds the filtered access to the set.
     */
    add(filtered_access: FilteredAccess<T>): void {
        this.#combined_access.extend(filtered_access.__access);
        this.#filtered_accesses.push(filtered_access);
    }

    /**
     * @summary Adds a read access without filters to the set.
     */
    __add_unfiltered_resource_read(index: T): void {
        const filter = FilteredAccess.default<T>();
        filter.add_resource_read(index);
        this.add(filter);
    }

    /**
     * @summary Adds a read access without filters to the set.
     */
    __add_unfiltered_resource_write(index: T): void {
        const filter = FilteredAccess.default<T>();
        filter.add_resource_write(index);
        this.add(filter);
    }

    __add_unfiltered_read_all_resources() {
        const filter = FilteredAccess.default<T>();
        filter.__access.read_all_resources();
        this.add(filter);
    }
    /**
     * @summary Adds a write access without filters to the set.
     */
    __add_unfiltered_write_all_resources(): void {
        const filter = FilteredAccess.default<T>();
        filter.__access.write_all_resources()
        this.add(filter);
    }

    extend(filtered_access_set: FilteredAccessSet<T>): void {
        this.#combined_access.extend(filtered_access_set.#combined_access);
        extend(this.#filtered_accesses, filtered_access_set.#filtered_accesses);
    }

    read_all() {
        this.#combined_access.read_all();
    }

    write_all() {
        this.#combined_access.write_all();
    }

    clear() {
        this.#combined_access.clear();
        this.#filtered_accesses.length = 0;
    }
}