import { iter, Iterator } from "joshkaposh-iterator";
import { FixedBitSet } from "fixed-bit-set";
import type { Option } from "joshkaposh-option";
import { World } from "../world";

export class Access {
    /**
     * All accessed components, or forbidden components if `Access.component_read_and_writes_inverted` is set.
     */
    __component_read_and_writes: FixedBitSet;
    /**
     * All exclusively-accessed components, or components that may not be
     * exclusively accessed if `Self::component_writes_inverted` is set.
     */
    __component_writes: FixedBitSet;
    /**
     * All accessed resources.
    */
    __resource_read_and_writes: FixedBitSet;
    /**
     * The exclusively-accessed resources.
     */
    __resource_writes: FixedBitSet;
    /**
     * Is `true` if this component can read all components *except* those
     * present in `Self::component_read_and_writes`.
     */
    __component_read_and_writes_inverted: boolean;
    /**
     * Is `true` if this component can write to all components *except* those
     * present in `Self::component_writes`.
     */
    __component_writes_inverted: boolean;
    /**
     * Is `true` if this has access to all resources.
     * This field is a performance optimization for `&World` (also harder to mess up for soundness).
     *
     */
    __reads_all_resources: boolean;
    /**
     * Is `true` if this has mutable access to all resources.
     * If this is true, then `reads_all` must also be true.
     */
    __writes_all_resources: boolean;
    /**
     * Components that are not accessed, but whose presence in an archetype affect query results.
     */__archetypal: FixedBitSet;


    constructor(
        component_read_and_writes_inverted = false,
        component_writes_inverted = false,
        reads_all_resources = false,
        writes_all_resources = false,
        component_read_and_writes: FixedBitSet = FixedBitSet.with_capacity(0),
        component_writes = FixedBitSet.with_capacity(0),
        resource_read_and_writes = FixedBitSet.with_capacity(0),
        resource_writes = FixedBitSet.with_capacity(0),
        archetypal = FixedBitSet.with_capacity(0),
    ) {
        this.__component_read_and_writes = component_read_and_writes;
        this.__component_writes = component_writes;
        this.__resource_read_and_writes = resource_read_and_writes;
        this.__resource_writes = resource_writes;
        this.__component_read_and_writes_inverted = component_read_and_writes_inverted;
        this.__component_writes_inverted = component_writes_inverted;
        this.__reads_all_resources = reads_all_resources;
        this.__writes_all_resources = writes_all_resources;
        this.__archetypal = archetypal;
    }

    eq(rhs: Access) {
        if (
            this.__component_read_and_writes_inverted !== rhs.__component_read_and_writes_inverted
            || this.__component_writes_inverted !== rhs.__component_writes_inverted
            || this.__reads_all_resources !== rhs.__reads_all_resources
            || this.__writes_all_resources !== rhs.__writes_all_resources
        ) {
            return false;
        }

        return this.__component_read_and_writes.eq(rhs.__component_read_and_writes)
            && this.__component_writes.eq(rhs.__component_writes)
            && this.__resource_read_and_writes.eq(rhs.__resource_read_and_writes)
            && this.__resource_writes.eq(rhs.__resource_writes)
            && this.__archetypal.eq(rhs.__archetypal);
    }

    clone_from(src: Access) {
        this.__component_read_and_writes.clone_from(src.__component_read_and_writes);
        this.__component_writes.clone_from(src.__component_writes);
        this.__resource_read_and_writes.clone_from(src.__resource_read_and_writes);
        this.__resource_writes.clone_from(src.__resource_writes);
        this.__component_read_and_writes_inverted = src.__component_read_and_writes_inverted;
        this.__component_writes_inverted = src.__component_writes_inverted;
        this.__reads_all_resources = src.__reads_all_resources;
        this.__writes_all_resources = src.__writes_all_resources;
        this.__archetypal.clone_from(src.__archetypal);
    }

    clone(): Access {
        return new Access(
            this.__component_read_and_writes_inverted,
            this.__component_writes_inverted,
            this.__reads_all_resources,
            this.__writes_all_resources,
            this.__component_read_and_writes.clone(),
            this.__component_writes.clone(),
            this.__resource_read_and_writes.clone(),
            this.__resource_writes.clone(),
            this.__archetypal.clone()
        );
    }

    __add_component_sparse_set_index_read(index: number) {
        if (!this.__component_read_and_writes_inverted) {
            this.__component_read_and_writes.grow_insert(index);
        } else if (index < this.__component_read_and_writes.length) {
            this.__component_read_and_writes.remove(index);
        }
    }

    __add_component_sparse_set_index_write(index: number) {
        if (!this.__component_writes_inverted) {
            this.__component_writes.grow_insert(index);
        } else if (index < this.__component_writes.length) {
            this.__component_writes.remove(index)
        }
    }

    add_component_read(index: number) {
        this.__add_component_sparse_set_index_read(index);
    }

    add_component_write(index: number) {
        this.__add_component_sparse_set_index_read(index);
        this.__add_component_sparse_set_index_write(index);
    }

    add_resource_read(index: number) {
        this.__resource_read_and_writes.grow_insert(index);
    }

    add_resource_write(index: number) {
        this.__resource_read_and_writes.grow_insert(index);
        this.__resource_writes.grow_insert(index);
    }

    __remove_component_sparse_set_index_read(index: number) {
        if (this.__component_read_and_writes_inverted) {
            this.__component_read_and_writes.grow_insert(index)
        } else if (index < this.__component_read_and_writes.length) {
            this.__component_read_and_writes.remove(index)
        }
    }
    __remove_component_sparse_set_index_write(index: number) {
        if (this.__component_writes_inverted) {
            this.__component_writes.grow_insert(index)
        } else if (index < this.__component_writes.length) {
            this.__component_writes.remove(index)
        }
    }


    remove_component_read(index: number) {
        this.__remove_component_sparse_set_index_write(index);
        this.__remove_component_sparse_set_index_read(index);
    }

    remove_component_write(index: number) {
        this.__remove_component_sparse_set_index_write(index);
    }

    /**
 * @description
 * Adds an archetypal (indirect) access to the element given by `index`.
 * 
 * This is for elements whose values are not accessed (and thus will never cause conflicts),
 * but whose presence in an archetype may affect query results.
 * 
 * Currently, this is only used for [`Has`].
 */
    add_archetypal(index: number) {
        this.__archetypal.grow(index + 1);
        this.__archetypal.insert(index);
    }

    /**
     * @returns `true` if this can access the component given by `index`.
     */
    has_component_read(index: number) {
        return this.__component_read_and_writes_inverted !== this.__component_read_and_writes.contains(index);
    }

    /**
     * @returns `true` if this can access any component.
     */
    has_any_component_read(): boolean {
        return this.__component_read_and_writes_inverted || !this.__component_read_and_writes.is_clear();
    }

    /**
     * 
     * @returns `true` if this can exclusively access the component given by `index`.
     */
    has_component_write(index: number): boolean {
        return this.__component_writes_inverted !== this.__component_writes.contains(index);
    }

    /**
     * @returns `true` if this accesses any component mutably
     */
    has_any_component_write(): boolean {
        return this.__component_writes_inverted || !this.__component_writes.is_clear();
    }

    /**
     * @returns `true` if this can access the resource given by `index`.
     */
    has_resource_read(index: number): boolean {
        return this.__reads_all_resources || this.__resource_read_and_writes.contains(index);
    }

    /**
     * @returns `true` if this can access any resource. 
     */
    has_any_resource_read(): boolean {
        return this.__reads_all_resources || !this.__resource_read_and_writes.is_clear();
    }

    /**
     * @returns `true` if this can exclusively access the resource given by `index`.
     */
    has_resource_write(index: number): boolean {
        return this.__writes_all_resources || this.__resource_writes.contains(index);
    }

    /**
     * @returns `true` if this can exlusively access the resource given by `index`.
     */
    has_any_resource_write(): boolean {
        return this.__writes_all_resources || !this.__resource_writes.is_clear()
    }

    /**
     * @returns `true` if this accesses any components or resources.
     */
    has_any_read() {
        return this.has_any_component_read() || this.has_any_resource_read();
    }

    /**
     * @returns `true` if this accesses any components or resources mutably.
     */
    has_any_write() {
        return this.has_any_component_write() || this.has_any_resource_write();
    }

    /**
     * @description
     * Returns true if this has an archetypal (indirect) access to the element given by `index`.
     * 
     * This is an element whose value is not accessed (and thus will never cause conflicts),
     * but whose presence in an archetype may affect query results.
     * 
     * Currently, this is only used for [`Has`].
     */
    has_archetypal(index: number): boolean {
        return this.__archetypal.contains(index);
    }

    /**
     * Sets this as having access to all components (i.e. `EntityRef`).
     */
    read_all_components(): void {
        this.__component_read_and_writes_inverted = true;
        this.__component_read_and_writes.clear();
    }

    /**
     * Sets this as having mutable access to all components (i.e. `EntityMut`).
     */
    write_all_components(): void {
        this.read_all_components();
        this.__component_writes_inverted = true;
        this.__component_writes.clear();
    }

    /**
     * Sets this as having access to all resources.
     */
    read_all_resources() {
        this.__reads_all_resources = true;
    }


    /**
     * Sets this as having mutable access to all resources.
     */
    write_all_resources(): void {
        this.__reads_all_resources = true;
        this.__writes_all_resources = true;
    }

    /**
     * Sets this has having access to all indexed elements.
     */
    read_all() {
        this.read_all_components();
        this.read_all_resources();
    }

    /**
     * Sets this has having mutable access to all indexed elements.
     */
    write_all() {
        this.write_all_components();
        this.write_all_resources();
    }

    /**
     * 
     * @returns `true` if this has access to all components (i.e. `EntityRef`).
     */
    has_read_all_components() {
        return this.__component_read_and_writes_inverted && this.__component_read_and_writes.is_clear();
    }

    /**
     * @returns `true` if this has write access to all components (i.e. `EntityMut`).
     */
    has_write_all_components() {
        return this.__component_writes_inverted && this.__component_writes.is_clear();
    }

    /**
     * @returns `true` if this has access to all resources (i.e. `EntityRef`).
     */
    has_read_all_resources() {
        return this.__reads_all_resources
    }

    /**
     * @returns `true` if this has write access to all resources (i.e. `EntityMut`).
     */
    has_write_all_resources() {
        return this.__writes_all_resources;
    }

    /**
     * @returns true if this has access to all indexed elements.
     */
    has_read_all() {
        return this.has_read_all_components() && this.has_read_all_resources();
    }

    /**
     * @returns true if this has write access to all indexed elements.
     */
    has_write_all() {
        return this.has_write_all_components() && this.has_write_all_resources();
    }


    /**
     * Removes all writes.
     */
    clear_writes() {
        this.__writes_all_resources = false;
        this.__component_writes_inverted = false;
        this.__component_writes.clear();
        this.__resource_writes.clear();
    }

    /**
     * Removes all accesses.
     */
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
    extend(other: Access) {
        const component_read_and_writes_inverted = this.__component_read_and_writes_inverted || other.__component_read_and_writes_inverted
        const component_writes_inverted = this.__component_writes_inverted || other.__component_writes_inverted

        const trw = this.__component_read_and_writes_inverted
        const orw = other.__component_read_and_writes_inverted

        if (trw && orw) {
            this.__component_read_and_writes.intersect_with(other.__component_read_and_writes);
        } else if (trw && !orw) {
            this.__component_read_and_writes.difference_with(other.__component_read_and_writes)
        } else if (!trw && orw) {
            this.__component_read_and_writes.grow(Math.max(this.__component_read_and_writes.length, other.__component_read_and_writes.length));
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
            this.__component_writes.grow(Math.max(this.__component_writes.length, other.__component_writes.length));
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

    is_components_compatible(other: Access): boolean {
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

    is_resources_compatible(other: Access) {
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
    is_compatible(other: Access) {
        return this.is_components_compatible(other) && this.is_resources_compatible(other);
    }

    is_subset_components(other: Access): boolean {
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

    is_subset_resources(other: Access): boolean {
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

    is_subset(other: Access): boolean {
        return this.is_subset_components(other) && this.is_subset_resources(other);
    }

    get_component_conflicts(other: Access) {
        const conflicts = FixedBitSet.with_capacity(0);
        for (
            const [
                lhs_writes,
                rhs_reads_and_writes,
                lhs_writes_inverted,
                rhs_reads_and_writes_inverted,
            ] of [
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
            ] as const) {
            let temp_conflicts: FixedBitSet;
            const a = lhs_writes_inverted, b = rhs_reads_and_writes_inverted;

            if (a && b) {
                return AccessConflicts.All
            } else if (!a && b) {
                temp_conflicts = FixedBitSet.from_iter(lhs_writes.difference(rhs_reads_and_writes));
            } else if (a && !b) {
                temp_conflicts = FixedBitSet.from_iter(rhs_reads_and_writes.difference(lhs_writes));
            } else {
                temp_conflicts = FixedBitSet.from_iter(lhs_writes.intersection(rhs_reads_and_writes));
            }

            conflicts.union_with(temp_conflicts);
        }

        return AccessConflicts.Individual(conflicts);
    }

    get_conflicts(other: Access): AccessConflicts {
        const ty = this.get_component_conflicts(other);
        if (ty.type() === 0) {
            return AccessConflicts.All;
        }

        const conflicts = ty.conflicts()!;

        if (this.__reads_all_resources) {
            if (other.__writes_all_resources) {
                return AccessConflicts.All;
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

        conflicts.extend(this.__resource_writes.intersection(other.__resource_read_and_writes))
        conflicts.extend(this.__resource_read_and_writes.intersection(other.__resource_writes))

        return AccessConflicts.Individual(conflicts);
    }

    resource_reads_and_writes() {
        return this.__resource_read_and_writes.ones();
    }

    resource_reads(): Iterator<number> {
        return this.__resource_read_and_writes.difference(this.__resource_writes);
    }

    resouce_writes(): Iterator<number> {
        return this.__resource_writes.ones()
    }

    archetypal(): Iterator<number> {
        return this.__archetypal.ones()
    }

    component_reads_and_writes(): [Iterator<number>, boolean] {
        return [this.__component_read_and_writes.ones(), this.__component_read_and_writes_inverted]
    }

    component_writes(): [Iterator<number>, boolean] {
        return [this.__component_writes.ones(), this.__component_writes_inverted]
    }

    [Symbol.toPrimitive]() {
        return `Access {
    
    component_read_and_writes: [${this.__component_read_and_writes.ones().collect()}],

    component_writes: [${this.__component_writes.ones().collect()}],

    resource_read_and_writes: [${this.__resource_read_and_writes.ones().collect()}],

    resource_writes: [${this.__resource_writes.ones().collect()}],

    component_read_and_writes_inverted: ${this.__component_read_and_writes_inverted},
    
    component_writes_inverted: ${this.__component_writes_inverted},
    
    reads_all_resources: ${this.__reads_all_resources},
    
    writes_all_resources: ${this.__writes_all_resources},
    
    archetypal: [${this.__archetypal.ones().collect()}]

}`
    }

    [Symbol.toStringTag]() {
        return this[Symbol.toPrimitive]();
    }

}

export class FilteredAccess {
    __access: Access;
    __required: FixedBitSet;
    __filter_sets: AccessFilters[];

    constructor(access: Access = new Access(), required: FixedBitSet = FixedBitSet.default(), filter_sets: AccessFilters[] = [new AccessFilters()]) {
        this.__access = access;
        this.__required = required;
        this.__filter_sets = filter_sets;
    }

    // static from() {}

    static matches_everything(): FilteredAccess {
        return new FilteredAccess()
    }

    static matches_nothing(): FilteredAccess {
        return new FilteredAccess(new Access(), FixedBitSet.default(), [])
    }

    eq(other: FilteredAccess) {
        if (!this.__access.eq(other.__access) || !this.__required.eq(other.__required)) {
            return false;
        }

        const sets = this.__filter_sets;
        const other_sets = other.__filter_sets;
        if (sets.length !== other_sets.length) {
            return false;
        }

        return sets.every((filter, i) => filter.eq(other_sets[i]))
    }

    clone(): FilteredAccess {
        const sets = Array.from({ length: this.__filter_sets.length }, (_, i) => this.__filter_sets[i].clone());
        return new FilteredAccess(this.__access.clone(), this.__required.clone(), sets)
    }

    clone_from(src: FilteredAccess) {
        this.__access.clone_from(src.__access);
        this.__required.clone_from(src.__required);
        this.__filter_sets.length = src.__filter_sets.length;
        for (let i = 0; i < src.__filter_sets.length; i++) {
            this.__filter_sets[i].clone_from(src.__filter_sets[i]);
        }
    }

    access() {
        return this.__access;
    }

    add_component_read(index: number): void {
        this.__access.add_component_read(index);
        this.__add_required(index);
        this.and_with(index);
    };

    add_component_write(index: number): void {
        this.__access.add_component_write(index);
        this.__add_required(index);
        this.and_with(index);
    }

    add_resource_read(index: number) {
        this.__access.add_resource_read(index);
    }

    add_resource_write(index: number) {
        this.__access.add_resource_write(index);
    }

    __add_required(index: number): void {
        this.__required.grow_insert(index);
    }


    /**
    *@description
    * Adds a `With` filter: corresponds to a conjuction (AND) operation.
    *
    * Suppose we begin with `Or<[With<A>, With<B>]>`, which is represented by an array of two `AccessFilter` instances.
    * Adding `AND With<C>` via this method transforms it into the equivalent of `Or<[[With<A>, With<C>], [With<B>, With<C>]]>`
    */
    and_with(index: number): void {
        for (let i = 0; i < this.__filter_sets.length; i++) {
            this.__filter_sets[i].with.grow_insert(index);
        }
    }

    and_without(index: number): void {
        for (let i = 0; i < this.__filter_sets.length; i++) {
            this.__filter_sets[i].without.grow_insert(index);
        }
    }


    append_or(other: FilteredAccess): void {
        this.__filter_sets.push(...other.__filter_sets)
    }

    extend_access(other: FilteredAccess): void {
        this.__access.extend(other.__access);
    }

    is_compatible(other: FilteredAccess): boolean {
        if (!this.__access.is_resources_compatible(other.__access)) {
            return false;
        }

        if (this.__access.is_components_compatible(other.__access)) {
            return true;
        }

        return this.__filter_sets.every(filter => (other.__filter_sets.every(other_filter => filter.is_ruled_out_by(other_filter))))
    }

    get_conflicts(other: FilteredAccess) {
        if (!this.is_compatible(other)) {
            return this.__access.get_conflicts(other.__access);
        }

        return AccessConflicts.empty();
    }

    set_to_access(access: FilteredAccess) {
        this.__access = access.__access;
        this.__filter_sets = access.__filter_sets;
        this.__required = access.__required;
    }

    extend(other: FilteredAccess) {
        this.__access.extend(other.__access);
        this.__required.union_with(other.__required);

        if (other.__filter_sets.length === 1) {
            for (let i = 0; i < this.__filter_sets.length; i++) {
                const filter = this.__filter_sets[i];
                filter.with.union_with(other.__filter_sets[0].with)
                filter.without.union_with(other.__filter_sets[0].without)

            }
            return
        }

        const new_filters = []
        for (let i = 0; i < this.__filter_sets.length; i++) {
            const filter = this.__filter_sets[i];
            for (let j = 0; j < other.__filter_sets.length; j++) {
                const other_filter = other.__filter_sets[j];

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

    is_subset(other: FilteredAccess): boolean {
        return this.__required.is_subset(other.__required) && this.__access.is_subset(other.access());
    }

    with_filters(): Iterator<number> {
        // return this.__filter_sets.flatMap(f => f.with.ones());
        return iter(this.__filter_sets).flat_map(f => f.with.ones()) as unknown as Iterator<number>
    }

    without_filters(): Iterator<number> {
        // return this.__filter_sets.flatMap(f => f.without.ones());
        return iter(this.__filter_sets).flat_map(f => f.without.ones()) as unknown as Iterator<number>
    }

    contains(index: number) {
        return this.__access.has_component_read(index)
            || this.__access.has_archetypal(index)
            || this.__filter_sets.some(f => f.with.contains(index) || f.without.contains(index))

    }
}

export class AccessConflicts {
    #conflicts: Option<FixedBitSet>;
    #type: 0 | 1;
    private constructor(type: 0 | 1, conflicts?: FixedBitSet) {
        this.#type = type;
        this.#conflicts = conflicts;
    }

    static from(value: number[]) {
        return AccessConflicts.Individual(FixedBitSet.from_array(value))
    }

    static get All() { return new AccessConflicts(0) };

    static Individual(conflicts: FixedBitSet) {
        return new AccessConflicts(1, conflicts);
    }
    static empty() {
        return AccessConflicts.Individual(FixedBitSet.with_capacity(0))
    }

    eq(other: AccessConflicts) {
        if (this.#type === 0 && other.#type === 0) {
            return true;
        }

        return this.#conflicts!.eq(other.#conflicts!)
    }

    /**
     * If type == 0, then instance is All
     */
    type() {
        return this.#type
    }

    conflicts() {
        return this.#conflicts
    }

    add(other: AccessConflicts) {
        if (other.#type === 0) {
            this.#type = 0;

        } else if (this.#type === 1 && other.#type === 1) {
            this.#conflicts!.extend(other.#conflicts!.ones())
        }
    }

    is_empty() {
        return this.#type === 0 ? false : this.#conflicts!.is_empty()
    }

    ones() {
        return this.#conflicts!.ones();
    }

    iter() {
        if (this.#type === 0) {
            return iter<number[]>([])
        } else {
            return this.#conflicts!.ones();
        }
    }

    format_conflict_list(world: World) {
        if (this.#type === 0) {
            // Individual
            return this.#conflicts!.ones().map(index => {
                return `${world.components().get_info(index)!.name()}`
            }).collect().join(', ')
        } else {
            // All
            return ''
        }
    }

    [Symbol.iterator]() {
        return this.iter();
    }

}

export class AccessFilters {
    with: FixedBitSet;
    without: FixedBitSet;

    constructor(_with: FixedBitSet = FixedBitSet.default(), without: FixedBitSet = FixedBitSet.default()) {
        this.with = _with;
        this.without = without;
    }


    clone() {
        return new AccessFilters(this.with.clone(), this.without.clone())
    }

    clone_from(src: AccessFilters) {
        this.with.clone_from(src.with);
        this.without.clone_from(src.without);
    }

    eq(other: AccessFilters) {
        return other.with.eq(this.with) && other.without.eq(this.without);
    }

    is_ruled_out_by(other: AccessFilters): boolean {
        return !this.with.is_disjoint(other.without) || !this.without.is_disjoint(other.with)
    }

    [Symbol.toPrimitive]() {
        return `AccessFilters {
            with: ${this.with},
            without: ${this.without}
        }`
    }


    [Symbol.toStringTag]() {
        return `AccessFilters {
            with: ${this.with},
            without: ${this.without}
        }`
    }
}

export class FilteredAccessSet {
    #combined_access: Access;
    #filtered_accesses: FilteredAccess[];

    constructor(combined_access: Access = new Access(), filtered_accesses: FilteredAccess[] = []) {
        this.#combined_access = combined_access;
        this.#filtered_accesses = filtered_accesses;
    }

    static from(filtered_access: FilteredAccess): FilteredAccessSet {
        const base = new FilteredAccessSet();
        base.add(filtered_access);
        return base;
    }

    eq(other: FilteredAccessSet) {
        if (!this.#combined_access.eq(other.#combined_access)) {
            return false;
        }

        const other_accesses = other.#filtered_accesses;
        return this.#filtered_accesses.every((filtered, i) => { return filtered.eq(other_accesses[i]) })
    }

    clone(): FilteredAccessSet {
        return new FilteredAccessSet(this.#combined_access.clone(), this.#filtered_accesses.map(f => f.clone()))
    }

    clone_from(src: FilteredAccessSet) {
        this.#combined_access.clone_from(src.#combined_access);
        this.#filtered_accesses.length = src.#filtered_accesses.length;
        for (let i = 0; i < src.#filtered_accesses.length; i++) {
            this.#filtered_accesses[i].clone_from(src.#filtered_accesses[i])
        }
    }

    combined_access(): Access {
        return this.#combined_access
    }

    is_compatible(other: FilteredAccessSet): boolean {
        if (this.#combined_access.is_compatible(other.#combined_access)) {
            return true;
        }

        for (let i = 0; i < this.#filtered_accesses.length; i++) {
            const filtered = this.#filtered_accesses[i];
            for (let j = 0; j < other.#filtered_accesses.length; j++) {
                const other_filtered = other.#filtered_accesses[j];
                if (!filtered.is_compatible(other_filtered)) {
                    return false
                }
            }
        }

        return true
    }


    get_conflicts(other: FilteredAccessSet): AccessConflicts {
        const conflicts = AccessConflicts.empty();

        if (!this.#combined_access.is_compatible(other.combined_access())) {
            for (let i = 0; i < this.#filtered_accesses.length; i++) {
                const filtered = this.#filtered_accesses[i];
                for (let j = 0; j < other.#filtered_accesses.length; j++) {
                    const other_filtered = other.#filtered_accesses[j];
                    conflicts.add(filtered.get_conflicts(other_filtered))
                }
            }
        }

        return conflicts
    }


    get_conflicts_single(filtered_access: FilteredAccess): AccessConflicts {
        const conflicts = AccessConflicts.empty();

        if (!this.#combined_access.is_compatible(filtered_access.access())) {
            for (let i = 0; i < this.#filtered_accesses.length; i++) {
                const filtered = this.#filtered_accesses[i];
                conflicts.add(filtered.get_conflicts(filtered_access))
            }
        }

        return conflicts
    }

    /**
     * @summary Adds the filtered access to the set.
     */
    add(filtered_access: FilteredAccess): void {
        this.#combined_access.extend(filtered_access.__access);
        this.#filtered_accesses.push(filtered_access);
    }

    /**
     * @summary Adds a read access without filters to the set.
     */
    __add_unfiltered_resource_read(index: number): void {
        const filter = new FilteredAccess();
        filter.add_resource_read(index);
        this.add(filter);
    }

    /**
     * @summary Adds a read access without filters to the set.
     */
    __add_unfiltered_resource_write(index: number): void {
        const filter = new FilteredAccess();
        filter.add_resource_write(index);
        this.add(filter);
    }

    __add_unfiltered_read_all_resources() {
        const filter = new FilteredAccess();
        filter.__access.read_all_resources();
        this.add(filter);
    }
    /**
     * @summary Adds a write access without filters to the set.
     */
    __add_unfiltered_write_all_resources(): void {
        const filter = new FilteredAccess();
        filter.__access.write_all_resources()
        this.add(filter);
    }

    extend(filtered_access_set: FilteredAccessSet): void {
        this.#combined_access.extend(filtered_access_set.#combined_access);
        this.#filtered_accesses.push(...filtered_access_set.#filtered_accesses)
    }

    read_all() {
        const filter = FilteredAccess.matches_everything();
        filter.read_all();
        this.add(filter)
    }

    write_all() {
        const filter = FilteredAccess.matches_everything();
        filter.write_all();
        this.add(filter);
    }

    clear() {
        this.#combined_access.clear();
        this.#filtered_accesses.length = 0;
    }
}