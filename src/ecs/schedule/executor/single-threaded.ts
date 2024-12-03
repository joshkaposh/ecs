import { iter, range } from "joshkaposh-iterator";
import { Option, is_error, is_some, result } from "joshkaposh-option";
import { ExecutorKind, SystemExecutor, SystemSchedule, is_apply_deferred } from ".";
import { FixedBitSet } from "../../../fixed-bit-set";
import { World } from "../../world";
import { UNIT } from "../../../util";
import { BoxedCondition } from "../../system";


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

    kind(): 0 {
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
        if (is_some(_skip_systems)) {
            this.#completed_systems.or(_skip_systems);
        }

        for (const system_index of range(0, schedule.__systems.length)) {
            // const name = schedule.__systems[system_index].name();

            let should_run = !this.#completed_systems.contains(system_index);
            for (const set_idx of schedule.__sets_with_conditions_of_systems[system_index].ones()) {
                if (this.#evaluated_sets.contains(set_idx)) {
                    continue
                }

                // evaluate system set's conditions
                const set_conditions_met = evaluate_and_fold_conditions(schedule.__set_conditions[set_idx], world);

                if (!set_conditions_met) {
                    this.#completed_systems.union_with(schedule.__systems_in_sets_with_conditions[set_idx])
                }

                // @ts-expect-error
                should_run &= set_conditions_met;
                this.#evaluated_sets.insert(set_idx);
            }

            const system_conditions_met = evaluate_and_fold_conditions(schedule.__system_conditions[system_index], world);

            // @ts-expect-error
            should_run &= system_conditions_met;

            // system has either been skipped or will run
            this.#completed_systems.insert(system_index);

            if (!should_run) {
                continue
            }

            const system = schedule.__systems[system_index];
            if (is_apply_deferred(system)) {
                this.apply_deferred(schedule, world);
            } else {
                const res = result(() => system.run(UNIT, world))
                if (is_error(res)) {
                    throw new Error(`Encountered an error in system: ${system.name()}`)
                }

                this.#unapplied_systems.insert(system_index);
            }
        }
        if (this.#apply_final_deferred) {
            this.apply_deferred(schedule, world);
        }

        this.#evaluated_sets.clear();
        this.#completed_systems.clear();
    }

    apply_deferred(_schedule: SystemSchedule, _world: World) { }

    set_apply_final_deferred(apply_final_deferred: boolean): void {
        this.#apply_final_deferred = apply_final_deferred;
    }
}

function evaluate_and_fold_conditions(conditions: BoxedCondition[], world: World): boolean {
    return iter(conditions)
        .map((condition: any) => condition.run(UNIT, world))
        .fold(true, (acc, res) => acc && res)
}