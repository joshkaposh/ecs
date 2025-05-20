import { Condition } from "./condition";
import { Chain } from "./schedule";
import { Ambiguity, Dependency, DependencyKind, GraphInfo } from './graph'
import { assert } from "joshkaposh-iterator/src/util";
import { InternedSystemSet, IntoSystemSet, SystemSet } from "./set";
import { System, SystemFn } from "../system";
import { IgnoreDeferred } from "./auto-insert-apply-deferred";

function newCondition<M>(condition: Condition<M>): any {
    const condition_system = condition.intoSystem();
    assert(condition_system.is_send, `Condition ${condition_system.name} accesses \`NonSend\` resources. This is currently unsupported`)
    return condition_system
}

function ambiguousWith(graph_info: GraphInfo, set: InternedSystemSet) {
    const amb = graph_info.ambiguous_with
    if (amb === Ambiguity.Check) {
        graph_info.ambiguous_with = Ambiguity.IgnoreWithSet(set)
    } else if (Array.isArray(amb)) {
        //* SAFETY: Ambiguity is either a number or Array 
        amb.push(set)
    }
}

export interface Schedulable<Metadata = any, GroupMetadata = any> {
    intoConfig(): ScheduleConfig<Schedulable<Metadata, GroupMetadata>>
}

export interface IntoScheduleConfig<T extends Schedulable> {
    intoConfig(): ScheduleConfigs<T>;

    /**
     * Add these systems to the provided `set`.
     */
    inSet(set: SystemSet): ScheduleConfigs<T>;

    /**
     * Runs before all systems in `set`. If `self` has any systems that produce `Commands` or other `Deferred` operations, all systems in `set` will see their effect.
     * 
     * If automatically inserting `ApplyDeferred` like this isn't desired, use [`beforeIgnoreDeferred`] instead.
     * 
     * Calling [`chain`] is often more convenient and ensures that all systems are added to the schedule.
     * Please check the [caveats section] `of ScheduleConfig.after` for details.
     */
    before<M>(set: IntoSystemSet<M>): ScheduleConfigs<T>;

    /**
     * Run after all systems in `set`. If `set` has any systems that produce `Commands` or other `Deferred` operations, all systems in `self` will see their effect.
     * 
     * If automatically inserting `ApplyDeferred` like this isn't desired, use [`afterIgnoreDeferred`] instead.
     * 
     * Calling `ScheduleConfig.chain` is often more convenient and ensures that all systems are added to the schedule.
     * 
     * **Caveats**
     * If you configure two `System`s like `SystemA.after(SystemB)` or `SystemA.before(SystemB)`, the `SystemB` will not be automatically scheduled.
     * 
     * This means that the system `SystemA` and the system or systems in `SystemB` will run independently of each other if `SystemB` was never explicitly scheduled with [`configure_sets`].
     * If that is the case, `.after`/`.before` will not provide the desired behaviour
     * and the systems can run in parallel or in any order determined by the scheduler.
     * Only use `after(SystemB)` and before(SystemB) when you know that `SystemB` has already been scheduled for you,
     * e.g. when it was provided by the ECS or a third-party dependency,
     * or you manually scheduled it somewhere else in your app.
     * 
     * Another caveat is that is `SystemB` is placed in a different schedule that `SystemA`,
     * any ordering calls between them - whether using `.before`, `.after`, or `.chain` - will be silently ignored.
     */
    after<M>(set: IntoSystemSet<M>): ScheduleConfigs<T>;

    /**
     * Run before all systems in `set`.
     * 
     * Unlike [`before`], this will not cause the systems in `set` to wait for the deferred effects of `self` to be applied.
     */
    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs<T>;

    /**
     * Run after all systems in `set`.
     * 
     * Unlike [`after`], this will not cause the systems in `set` to wait for the deferred effects of `self` to be applied.
     */
    afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs<T>;

    /**
     * Add a run condition to each contained system.
     * 
     * Each system will receive its own clone of the [`Condition`] and will only run if the `Condition` is true.
     * 
     * Each individual condition will be evaluated at most once (per schedule run),
     * right before the corresponding system prepares to run.
     * 
     * This is equivalent to calling [`runIf`] on each individual system (see below).
     * 
     * @example
     * 
     * schedule.add_systems(set(a, b).distributiveRunIf(condition))
     * schedule.add_systems(set(a.runIf(condition), b.runIf(condition)))
     * 
     * **Note**
     * 
     * Because the conditions are evaluated separately for each system, there is no guarantee that all evaluations in a single schedule run will yield the same result.
     * If another system is run in-between two evaluations it could cause the result of the condition to change.
     * 
     * Use [`runIf`] on a [`SystemSet`] if you want to make sure
     * that either all or none of the systems are run, or you don't want to evaluate the run
     * condition for each contained system separately.
     */
    distributiveRunIf(condition: Condition<any>): ScheduleConfigs<T>;

    /**
     * Run the systems only if the [`Condition`] is `true`.
     * 
     * The `Condition` will be evaluated at most once (per schedule run),
     * the first time a system in this set prepares to run.
     * 
     * If this set contains more than one system, calling `runIf` is equivalent to adding each
     * system to a common set and configuring the run condition on that set (see below).
     * 
     * @example
     * 
     * schedule.add_systems(set(a, b).runIf(condition))
     * schedule.add_systems(set(a, b).inSet(MySet)).configure_sets(MySet.runIf(condition))
     * 
     * **Note**
     * 
     * Because the condition will only be evaluated once, there is no guarantee that the condition is upheld after the first system has run. You need to make sure that no other systems that
     * could invalidate the condition are scheduled between the first and last system.
     * 
     * Use [`distributiveRunIf`] if you want the condition to be evaluated for each individual system, right before it is run.
     */
    runIf(condition: Condition<any>): ScheduleConfigs<T>;

    /**
     * Suppresses warning and errors that would result from these systems having ambiguities
     * (conflicting access but indeterminate order) with systems in `set`.
     */
    ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs<T>;

    /**
     * Suppresses warning and erros that would result from these systems having ambiguities
     * (conflicting access but indeterminate order) with any other system.
     */
    ambiguousWithAll(): ScheduleConfigs<T>;

    /**
     * Treat this collection as a sequence of systems.
     * 
     * Ordering contrains will be applied between the successive elements.
     * 
     * If the preceding node on an edge has deferred parameters, an `ApplyDeferred`
     * will be inserted on the edge. If this behaviour is not desirable, consider using [`chainIgnoreDeferred`] instead.
     */
    chain(): ScheduleConfigs<T>;

    /**
     * Treat this collection as a sequence of systems.
     * 
     * Ordering contrains will be applied between the successive elements.
     * 
     * Unlike [`chain`], this will **not** add [`ApplyDeferred`] on the edges.
     */
    chainIgnoreDeferred(): ScheduleConfigs<T>;
}

export function IntoScheduleConfig<S extends System<any, any>, T extends Schedulable>(type: S & Partial<IntoScheduleConfig<T>>): IntoScheduleConfig<T> {
    type.intoConfig ??= function intoConfig(): ScheduleConfigs<T> {
        const sets = this.defaultSystemSets!();
        return new ScheduleConfig(
            this as unknown as T,
            {
                hierarchy: sets,
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    }

    type.before = function before<P2>(other: IntoSystemSet<System<P2, ReturnType<SystemFn<P2, boolean>>>>) {
        return this.intoConfig!().before(other) as ScheduleConfigs<T>;
    }

    type.after = function after<P2>(other: IntoSystemSet<System<P2, ReturnType<SystemFn<P2, boolean>>>>) {
        return this.intoConfig!().after(other) as ScheduleConfigs<T>;
    }

    type.inSet = function inSet(set: SystemSet) {
        return this.intoConfig!().inSet(set) as ScheduleConfigs<T>;
    }

    type.afterIgnoreDeferred = function afterIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        return this.intoConfig!().afterIgnoreDeferred(set) as ScheduleConfigs<T>;
    }

    type.beforeIgnoreDeferred = function beforeIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        return this.intoConfig!().beforeIgnoreDeferred(set) as ScheduleConfigs<T>;
    }

    type.runIf = function runIf(condition: Condition<any>) {
        return this.intoConfig!().runIf(condition) as ScheduleConfigs<T>;
    }

    type.distributiveRunIf = function distributiveRunIf(condition: Condition<any>) {
        return this.intoConfig!().distributiveRunIf(condition) as ScheduleConfigs<T>;
    }

    type.ambiguousWith = function ambiguousWith<M>(set: IntoSystemSet<M>) {
        return this.intoConfig!().ambiguousWith(set) as ScheduleConfigs<T>;
    }

    type.ambiguousWithAll = function ambiguousWithAll() {
        return this.intoConfig!!().ambiguousWithAll() as ScheduleConfigs<T>
    }

    type.chain = function chain() {
        return this.intoConfig!().chain() as ScheduleConfigs<T>;
    }

    type.chainIgnoreDeferred = function chainIgnoreDeferred() {
        return this.intoConfig!().chainIgnoreDeferred() as ScheduleConfigs<T>;
    }

    return type as IntoScheduleConfig<T>;

}

export type SystemConfig = ScheduleConfig<Schedulable>
export type SystemConfigs = Configs<Schedulable<SystemSet, Chain>>;

/**
 * Stores configuation for a single generic node (a system or a system set).
 * 
 * The configuration includes the node itself, scheduling metadata
 * (hierarchy: in which sets is the node contained,
 * dependencies: before/after which other nodes should this node run)
 * and the run conditions associated with this node.
 */
export class ScheduleConfig<T extends Schedulable> implements IntoScheduleConfig<T> {
    readonly node: T;
    readonly graph_info: GraphInfo;
    readonly conditions: Condition<any>[];

    constructor(
        node: T,
        graph_info: GraphInfo,
        conditions: Condition<any>[]
    ) {
        this.node = node;
        this.graph_info = graph_info;
        this.conditions = conditions;
    }

    intoConfig(): ScheduleConfig<T> {
        return this;
    }

    intoConfigs() {
        return this;
    }

    intoConfigType() {
        return this.node;
    }

    private inSetInner(set: InternedSystemSet) {
        this.graph_info.hierarchy.push(set)
    }

    inSet(set: InternedSystemSet) {
        assert(set.systemType == null, 'Cannot add arbitrary systems to a system type set');
        this.inSetInner(set);
        return this;
    }

    private beforeInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set));
    }

    before<M>(set: IntoSystemSet<M>) {
        this.beforeInner(set.intoSystemSet().intern());
        return this;
    }

    private afterInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set));
    }

    after<M>(set: IntoSystemSet<M>) {
        this.afterInner(set.intoSystemSet().intern());
        return this;
    }

    private beforeIgnoreDeferredInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set).add_config(IgnoreDeferred))
    }

    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.beforeIgnoreDeferredInner(set.intoSystemSet().intern());
        return this
    }

    private afterIgnoreDeferredInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set).add_config(IgnoreDeferred))
    }

    afterIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.afterIgnoreDeferredInner(set.intoSystemSet().intern());
        return this;
    }

    private distributiveRunIfInner<M>(condition: Condition<M>) {
        this.conditions.push(newCondition(condition));
    }

    distributiveRunIf<M>(condition: Condition<M>): ScheduleConfigs<T> {
        this.distributiveRunIfInner(condition);
        return this;
    }

    // @ts-expect-error
    private runIfDyn<M>(condition: Condition<M>) {
        this.conditions.push(condition);
    }

    runIf<M>(condition: Condition<M>) {
        this.conditions.push(newCondition(condition));
        return this;

    }

    private ambiguousWithInner(set: InternedSystemSet) {
        ambiguousWith(this.graph_info, set);
    }

    ambiguousWith<M>(set: IntoSystemSet<M>) {
        this.ambiguousWithInner(set.intoSystemSet().intern());
        return this
    }

    ambiguousWithAll(): ScheduleConfigs<T> {
        throw new Error('TODO: ScheduleConfig.ambiguousWithAll')
        return this;
    }

    chain() {
        return this;
    }

    chainIgnoreDeferred(): ScheduleConfigs<T> {
        return this;
    }

    [Symbol.toPrimitive]() {
        return `${this.node}`
    }

    [Symbol.toStringTag]() {
        return `${this.node}`

    }

}

/**
 * Configuration for a tuple of nested `Configs` instances.
 */
export class Configs<T extends Schedulable> implements IntoScheduleConfig<T> {
    configs: readonly ScheduleConfigs<T>[];
    collective_conditions: Condition<any>[];
    chained: Chain;
    set: InternedSystemSet;
    constructor(
        set: InternedSystemSet,
        configs: readonly ScheduleConfigs<T>[],
        collective_conditions: Condition<any>[],
        chained: Chain
    ) {
        this.set = set;
        this.configs = configs;
        this.collective_conditions = collective_conditions;
        this.chained = chained;
    }

    intoConfig(): Configs<T> {
        return this;
    }

    private inSetInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].inSetInner(set);
        }
    }

    inSet(set: InternedSystemSet) {
        assert(set.systemType == null, `adding arbitrary systems to a system type set is not allowed`);
        this.inSetInner(set);
        return this;
    }

    private beforeInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].beforeInner(set);
        }
    }

    before<M>(set: IntoSystemSet<M>) {
        this.beforeInner(set.intoSystemSet().intern());
        return this;
    }

    private afterInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].afterInner(set);
        }
    }

    after<M>(set: IntoSystemSet<M>) {
        this.afterInner(set.intoSystemSet().intern())
        return this;
    }

    private beforeIgnoreDeferredInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].beforeIgnoreDeferredInner(set);
        }
    }

    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.beforeIgnoreDeferredInner(set.intoSystemSet().intern())
        return this;
    }

    private afterIgnoreDeferredInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].afterIgnoreDeferredInner(set);
        }
    }

    afterIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.afterIgnoreDeferredInner(set.intoSystemSet().intern())
        return this
    }

    private distributiveRunIfInner<M>(condition: Condition<M>) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].distributiveRunIfInner(condition.clone())
        }
    }

    distributiveRunIf<M>(condition: Condition<M>) {
        this.distributiveRunIfInner(condition);
        return this
    }

    private runIfDyn<M>(condition: Condition<M>) {
        this.collective_conditions.push(condition);
    }

    runIf<M>(condition: Condition<M>) {
        this.runIfDyn(newCondition(condition));
        return this;

    }

    private ambiguousWithInner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].ambiguousWithInner(set);
        }
    }

    ambiguousWith<M>(set: IntoSystemSet<M>) {
        this.ambiguousWithInner(set.intoSystemSet().intern())
        return this;
    }


    ambiguousWithAll() {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].ambiguousWithAllInner();
        }
        return this;
    }

    private chainInner() {
        this.chained = Chain.Chained(new Map());
    }

    chain() {
        this.chainInner();
        return this;
    }

    private chainIgnoreDeferredInner() {
        this.chained = Chain.Chained(new Map());
        return this;
    }

    chainIgnoreDeferred() {
        return this.chainIgnoreDeferredInner();
    }

    [Symbol.toPrimitive]() {
        return `${this.set}`
    }
    [Symbol.toStringTag]() {
        return `${this.set}`
    }
}

/**
 * Single or nested configurations for [`Schedulable`]s
 */
export type ScheduleConfigs<T extends Schedulable> = ScheduleConfig<T> | Configs<T>;
export const ScheduleConfigs = {
    /**
     * Configuration for a single [`Schedulable`].
     */
    ScheduleConfig,
    /**
     * Configuration for a tuple of nested `Configs` instances.
     */
    Configs,

    [Symbol.hasInstance](instance: any) {
        return instance instanceof ScheduleConfig || instance instanceof Configs
    }
}