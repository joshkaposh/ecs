import { FixedBitSet } from "fixed-bit-set";
import type { Option } from "joshkaposh-option";
import type { World } from "../world";
import type { Condition } from "../schedule";
import { ExecutorKind, type SystemExecutor, SystemSchedule, is_apply_deferred } from ".";
import { unit } from "../util";

export class SingleThreadedExecutor implements SystemExecutor {
    /// System sets whose conditions have been evaluated.
    #evaluated_sets: FixedBitSet;
    /// Systems that have run or been skipped.
    #completed_systems: FixedBitSet;
    /// Systems that have run but have not had their buffers applied.
    #unapplied_systems: FixedBitSet;
    /// Setting when true applies deferred system buffers after all systems have run
    #apply_final_deferred: boolean;

    constructor(
        evaluated_sets: FixedBitSet = FixedBitSet.default(),
        completed_systems: FixedBitSet = FixedBitSet.default(),
        unapplied_systems: FixedBitSet = FixedBitSet.default(),
        apply_final_deferred = true
    ) {
        this.#evaluated_sets = evaluated_sets;
        this.#completed_systems = completed_systems;
        this.#unapplied_systems = unapplied_systems;
        this.#apply_final_deferred = apply_final_deferred;
    }

    kind(): ExecutorKind {
        return ExecutorKind.SingleThreaded;
    }

    init(schedule: SystemSchedule): void {
        const sys_count = schedule.__system_ids.length;
        const set_count = schedule.__set_ids.length;
        this.#evaluated_sets = FixedBitSet.with_capacity(set_count);
        this.#completed_systems = FixedBitSet.with_capacity(sys_count);
        this.#unapplied_systems = FixedBitSet.with_capacity(sys_count);
    }

    run(schedule: SystemSchedule, world: World, skip_systems: Option<FixedBitSet>): void {
        const completed_systems = this.#completed_systems;


        if (skip_systems) {
            completed_systems.or_with(skip_systems);
        }

        const systems = schedule.__systems,
            sets_with_conditions_of_systems = schedule.__sets_with_conditions_of_systems,
            evaluated_sets = this.#evaluated_sets;

        for (let system_index = 0; system_index < systems.length; system_index++) {
            let should_run = !completed_systems.contains(system_index);

            const ones = sets_with_conditions_of_systems[system_index].ones();

            for (const set_idx of ones) {
                if (evaluated_sets.contains(set_idx)) {
                    continue;
                }

                const set_conditions_met = evaluateAndFoldConditions(schedule.__set_conditions[set_idx], world);

                if (!set_conditions_met) {
                    completed_systems.union_with(schedule.__systems_in_sets_with_conditions[set_idx]);
                }

                // @ts-expect-error
                should_run &= set_conditions_met;
                evaluated_sets.insert(set_idx);
            }

            const system_conditions_met = evaluateAndFoldConditions(schedule.__system_conditions[system_index], world);
            // @ts-expect-error
            should_run &= system_conditions_met;

            const system = systems[system_index];

            if (should_run) {
                const valid_params = system.validateParam(world) == null;
                // @ts-expect-error
                should_run &= valid_params;
            }

            // system has either been skipped or will run
            completed_systems.insert(system_index);


            if (!should_run) {
                continue
            }

            if (is_apply_deferred(system)) {
                this.applyDeferred(schedule, world)
            }

            if (system.is_exclusive) {
                system.run(unit, world);
            } else {
                system.updateArchetypeComponentAccess(world);
                system.runUnsafe(unit, world);
            }

            if (system.has_deferred) {
                this.#unapplied_systems.insert(system_index);
            }
        }

        if (this.#apply_final_deferred) {
            this.applyDeferred(schedule, world)
        }

        evaluated_sets.clear();
        completed_systems.clear();
    }

    applyDeferred(schedule: SystemSchedule, world: World) {
        for (const system_index of this.#unapplied_systems.ones()) {
            const system = schedule.__systems[system_index];
            system.applyDeferred(world);
        }

        this.#unapplied_systems.clear();
    }

    setApplyFinalDeferred(apply_final_deferred: boolean): void {
        this.#apply_final_deferred = apply_final_deferred;
    }

}

function evaluateAndFoldConditions(conditions: Condition<any, boolean>[], world: World): boolean {
    return conditions.reduce((acc, condition) => acc && condition.run(unit, world), true)
}