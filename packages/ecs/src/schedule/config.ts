import { Condition } from "./condition";
import { Chain, ScheduleGraph } from "./schedule";
import { Ambiguity, Dependency, DependencyKind, GraphInfo } from './graph'
import { assert } from "joshkaposh-iterator/src/util";
import { InternedSystemSet, IntoSystemSet, SystemSet } from "./set";
import { System, SystemFn } from "../system";

type ScheduleSystem = System<any, any>;

function newCondition<M>(condition: Condition<M>): any {
    const condition_system = condition.intoSystem();
    assert(condition_system.is_send, `Condition ${condition_system.name} accesses \`NonSend\` resources. This is currently unsupported`)
    return condition_system
}

function ambiguousWith(graph_info: GraphInfo, set: InternedSystemSet) {
    const amb = graph_info.ambiguous_with
    if (amb === Ambiguity.Check) {
        graph_info.ambiguous_with = Ambiguity.IgnoreWithSet(set)
    } else {
        //* SAFETY: Ambiguity is either a number or Array 
        // @ts-expect-error
        amb.push(set)
    }
}

export interface Schedulable<Metadata = any, GroupMetadata = any> {
    intoConfig(): ScheduleConfig<Schedulable<Metadata, GroupMetadata>>
}

// @ts-expect-error
export interface IntoScheduleConfig<T extends Schedulable<any, any>> {
    intoConfig(): ScheduleConfigs;

    /**
     * Add these systems to the provided `set`.
     */
    inSet(set: SystemSet): ScheduleConfigs;

    /**
     * Runs before all systems in `set`. If `self` has any systems that produce `Commands` or other `Deferred` operations, all systems in `set` will see their effect.
     * 
     * If automatically inserting `ApplyDeferred` like this isn't desired, use [`beforeIgnoreDeferred`] instead.
     * 
     * Calling [`chain`] is often more convenient and ensures that all systems are added to the schedule.
     * Please check the [caveats section] `of ScheduleConfig.after` for details.
     */
    before<M>(set: IntoSystemSet<M>): ScheduleConfigs;

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
    after<M>(set: IntoSystemSet<M>): ScheduleConfigs;

    /**
     * Run before all systems in `set`.
     * 
     * Unlike [`before`], this will not cause the systems in `set` to wait for the deferred effects of `self` to be applied.
     */
    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs;

    /**
     * Run after all systems in `set`.
     * 
     * Unlike [`after`], this will not cause the systems in `set` to wait for the deferred effects of `self` to be applied.
     */
    afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs;

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
    distributiveRunIf(condition: Condition<any>): ScheduleConfigs;

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
    runIf(condition: Condition<any>): ScheduleConfigs;

    /**
     * Suppresses warning and errors that would result from these systems having ambiguities
     * (conflicting access but indeterminate order) with systems in `set`.
     */
    ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs;

    /**
     * Suppresses warning and erros that would result from these systems having ambiguities
     * (conflicting access but indeterminate order) with any other system.
     */
    ambiguousWithAll(): ScheduleConfigs;

    /**
     * Treat this collection as a sequence of systems.
     * 
     * Ordering contrains will be applied between the successive elements.
     * 
     * If the preceding node on an edge has deferred parameters, an `ApplyDeferred`
     * will be inserted on the edge. If this behaviour is not desirable, consider using [`chainIgnoreDeferred`] instead.
     */
    chain(): ScheduleConfigs;

    /**
     * Treat this collection as a sequence of systems.
     * 
     * Ordering contrains will be applied between the successive elements.
     * 
     * Unlike [`chain`], this will **not** add [`ApplyDeferred`] on the edges.
     */
    chainIgnoreDeferred(): ScheduleConfigs;
}

export function IntoScheduleConfig<T extends Schedulable>(type: T & Partial<IntoScheduleConfig<Schedulable>>): IntoScheduleConfig<T> {
    type.before = function before<P2>(other: IntoSystemSet<System<P2, ReturnType<SystemFn<P2, boolean>>>>) {
        return this.intoConfig!().before(other);
    }

    type.after = function after<P2>(other: IntoSystemSet<System<P2, ReturnType<SystemFn<P2, boolean>>>>) {
        return this.intoConfig!().after(other);
    }

    type.inSet = function inSet(set: SystemSet) {
        return this.intoConfig!().inSet(set);
    }

    type.afterIgnoreDeferred = function afterIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        return this.intoConfig().afterIgnoreDeferred(set);
    }

    type.beforeIgnoreDeferred = function beforeIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        return this.intoConfig().beforeIgnoreDeferred(set);
    }

    type.runIf = function runIf(condition: Condition<any>) {
        return this.intoConfig!().runIf(condition)
    }

    type.distributiveRunIf = function distributiveRunIf(condition: Condition<any>) {
        return this.intoConfig!().distributiveRunIf(condition)
    }

    type.ambiguousWith = function ambiguousWith<M>(set: IntoSystemSet<M>) {
        return this.intoConfig().ambiguousWith(set)
    }

    type.ambiguousWithAll = function ambiguousWithAll() {
        return this.intoConfig().ambiguousWithAll()
    }

    type.chain = function chain() {
        return this.intoConfig().chain();
    }

    type.chainIgnoreDeferred = function chainIgnoreDeferred() {
        return this.intoConfig().chainIgnoreDeferred();
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

    processConfig(schedule_graph: ScheduleGraph) {
        return schedule_graph.addSystemInner(this as any);
    }

    // * IntoSystemConfigs impl    
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
        this.graph_info.hierarchy.push(set);
    }

    before<M>(set: IntoSystemSet<M>) {
        this.beforeInner(set.intoSystemSet());
        return this;
    }

    private afterInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set));
        this.graph_info.hierarchy.push(set);
    }

    after<M>(set: IntoSystemSet<M>) {
        this.afterInner(set.intoSystemSet());
        return this;
    }

    private beforeIgnoreDeferredInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set))
    }

    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.beforeIgnoreDeferredInner(set.intoSystemSet());
        return this
    }

    private afterIgnoreDeferredInner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set))
    }

    afterIgnoreDeferred<M>(set: IntoSystemSet<M>) {
        this.afterIgnoreDeferredInner(set.intoSystemSet());
        return this;
    }

    private distributiveRunIfInner<M>(condition: Condition<M>) {
        this.conditions.push(newCondition(condition));
    }

    distributiveRunIf<M>(condition: Condition<M>): ScheduleConfigs {
        this.distributiveRunIfInner(condition);
        return this;
    }

    private runIfDyn<M>(condition: Condition<M>) {
        this.conditions.push(condition);
    }

    runIf<M>(condition: Condition<M>) {
        this.runIfDyn(newCondition(condition));
        return this;

    }

    private ambiguousWithInner(set: InternedSystemSet) {
        ambiguousWith(this.graph_info, set);
    }

    ambiguousWith<M>(set: IntoSystemSet<M>) {
        this.ambiguousWithInner(set.intoSystemSet());
        return this
    }

    ambiguousWithAll(): ScheduleConfigs {
        return this;
    }

    chain() {
        return this;
    }

    chainIgnoreDeferred(): ScheduleConfigs {
        return this;
    }
}

/**
 * Configuration for a tuple of nested `Configs` instances.
 */
export class Configs<T extends Schedulable> implements IntoScheduleConfig<T> {
    configs: readonly ScheduleConfigs[];
    collective_conditions: Condition<any, any>[];
    chained: Chain;
    set: InternedSystemSet;
    constructor(
        set: InternedSystemSet,
        configs: readonly ScheduleConfigs[],
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
            const config = configs[i];
            // @ts-expect-error
            config.inSetInner(set);
        }
    }

    inSet(set: InternedSystemSet) {
        assert(set.systemType == null, `adding arbitrary systems to a system type set is not allowed`);
        this.inSetInner(set);
        return this;
    }

    private beforeInner(set: InternedSystemSet) {
        const configs = this.configs
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            // @ts-expect-error
            config.beforeInner(set);
        }
    }

    before<M>(set: IntoSystemSet<M>) {
        this.beforeInner(set.intoSystemSet())
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
        this.afterInner(set.intoSystemSet())
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
        this.beforeIgnoreDeferredInner(set.intoSystemSet())
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
        this.afterIgnoreDeferredInner(set.intoSystemSet())
        return this
    }

    private distributiveRunIfInner<M>(condition: Condition<M>) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            // @ts-expect-error
            configs[i].distributiveRunIfInner(condition)
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
        this.ambiguousWithInner(set.intoSystemSet())
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
}

/**
 * Single or nested configurations for [`Schedulable`]s
 */
export type ScheduleConfigs = ScheduleConfig<Schedulable<ScheduleSystem, Chain>> | Configs<Schedulable<SystemSet>>
export const ScheduleConfigs = {
    /**
     * Configuration for a single [`Schedulable`].
     */
    ScheduleConfig,
    /**
     * Configuration for a tuple of nested `Configs` instances.
     */
    Configs,
}