import { iter, range } from "joshkaposh-iterator";
import { Option, result } from "joshkaposh-option";
import { ExecutorKind, SystemExecutor, SystemSchedule, is_apply_deferred } from ".";
import { FixedBitSet } from "fixed-bit-set";
import { World } from "../world";
import { unit } from "../../util";
import { BoxedCondition } from "../system";
import { TODO } from "joshkaposh-iterator/src/util";

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
        console.log('Executable init', sys_count, set_count);

        this.#evaluated_sets = FixedBitSet.with_capacity(set_count + 1);
        this.#completed_systems = FixedBitSet.with_capacity(sys_count + 1);
        this.#unapplied_systems = FixedBitSet.with_capacity(sys_count + 1);

    }

    run(schedule: SystemSchedule, world: World, _skip_systems: Option<FixedBitSet>): void {
        if (_skip_systems) {
            this.#completed_systems.or(_skip_systems);
        }

        for (let system_index = 0; system_index < schedule.__systems.length; system_index++) {
            let should_run = !this.#completed_systems.contains(system_index);
            const system = schedule.__systems[system_index];
            if (should_run) {
                const valid_params = system.validate_param(world);
                // @ts-expect-error
                should_run &= valid_params;
            }

            // system has either been skipped or will run
            this.#completed_systems.insert(system_index);
            if (!should_run) {
                continue
            }

            if (is_apply_deferred(system)) {
                this.apply_deferred(schedule, world)
            }

            const res = result(() => {
                if (system.is_exclusive()) {
                    console.log('RUNNING SYSTEM EXCLUSIVE');
                    return system.run(undefined, world)
                } else {
                    console.log('RUNNING SYSTEM NON-EXCLUSIVE');
                    return system.run_unsafe(undefined, world);
                }
            })
            if (res) {
                throw new Error(`Encontered an error in system ${system.name()}`)
            }

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