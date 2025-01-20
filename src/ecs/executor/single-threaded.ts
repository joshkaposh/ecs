import { iter } from "joshkaposh-iterator";
import { Option, result } from "joshkaposh-option";
import { ExecutorKind, SystemExecutor, SystemSchedule, is_apply_deferred } from ".";
import { FixedBitSet } from "fixed-bit-set";
import { World } from "../world";
import { unit } from "../../util";
import { BoxedCondition } from "../system";

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
        evaluated_sets: FixedBitSet,
        completed_systems: FixedBitSet,
        unapplied_systems: FixedBitSet,
        apply_final_deferred: boolean
    ) {
        this.#evaluated_sets = evaluated_sets;
        this.#completed_systems = completed_systems;
        this.#unapplied_systems = unapplied_systems;
        this.#apply_final_deferred = apply_final_deferred;
    }

    static default(): SingleThreadedExecutor {
        return new SingleThreadedExecutor(
            new FixedBitSet(),
            new FixedBitSet(),
            new FixedBitSet(),
            true
        )
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

    run(schedule: SystemSchedule, world: World, _skip_systems: Option<FixedBitSet>): void {
        const completed_systems = this.#completed_systems;

        if (_skip_systems) {
            completed_systems.or(_skip_systems);
        }

        const systems = schedule.__systems;
        const sets_with_conditions_of_systems = schedule.__sets_with_conditions_of_systems;
        for (let system_index = 0; system_index < systems.length; system_index++) {
            let should_run = !completed_systems.contains(system_index);
            const ones = sets_with_conditions_of_systems[system_index].ones();
            for (const set_idx of ones) {
                if (this.#evaluated_sets.contains(set_idx)) {
                    continue;
                }

                const set_conditions_met = evaluate_and_fold_conditions(schedule.__set_conditions[set_idx], world);

                if (!set_conditions_met) {
                    completed_systems.union_with(schedule.__systems_in_sets_with_conditions[set_idx]);
                }

                // @ts-expect-error
                should_run &= set_conditions_met;
                this.#evaluated_sets.insert(set_idx);
            }

            const system_conditions_met = evaluate_and_fold_conditions(schedule.__system_conditions[system_index], world);
            // @ts-expect-error
            should_run &= system_conditions_met;

            const system = systems[system_index];

            if (should_run) {
                const valid_params = system.validate_param(world);
                // @ts-expect-error
                should_run &= valid_params;
            }

            // system has either been skipped or will run
            completed_systems.insert(system_index);
            if (!should_run) {
                continue
            }

            if (is_apply_deferred(system)) {
                this.apply_deferred(schedule, world)
            }

            try {
                if (system.is_exclusive()) {
                    system.run(undefined, world)
                } else {

                    system.update_archetype_component_access(world);

                    system.run_unsafe(undefined, world);
                }
            } catch (error) {
                throw new Error(`Encountered an error in system: ${system}`, { cause: error && typeof error === 'object' && 'cause' in error ? error.cause : undefined })
            }
            // if (res instanceof Error) {
            // throw res;
            // throw new Error(`Encontered an error in system ${system.name()}`)
            // }

            this.#unapplied_systems.insert(system_index);
        }
        if (this.#apply_final_deferred) {
            this.apply_deferred(schedule, world)
        }

        this.#evaluated_sets.clear();
        this.#completed_systems.clear();
    }

    apply_deferred(schedule: SystemSchedule, world: World) {
        for (const system_index of this.#unapplied_systems.ones()) {
            const system = schedule.__systems[system_index];
            system.apply_deferred(world);
        }

        this.#unapplied_systems.clear();
    }

    set_apply_final_deferred(apply_final_deferred: boolean): void {
        this.#apply_final_deferred = apply_final_deferred;
    }

}

function evaluate_and_fold_conditions(conditions: BoxedCondition[], world: World): boolean {
    return iter(conditions)
        .map((condition: any) => condition.run(unit, world))
        .fold(true, (acc, res) => acc && res)
}