import { Option } from "joshkaposh-option";
import { FixedBitSet } from "fixed-bit-set";
import { World } from "../world";
import { Condition, System, ApplyDeferred } from "../system";
import { NodeId } from "../schedule/graph";

export type SystemExecutor = {
    kind(): ExecutorKind;
    init(schedule: SystemSchedule): void;
    run(schedule: SystemSchedule, world: World, skip_system: Option<FixedBitSet>): void;
    set_apply_final_deferred(value: boolean): void;
}

export type ExecutorKind = typeof ExecutorKind[keyof typeof ExecutorKind]
export const ExecutorKind = {
    SingleThreaded: 0,
    // Simple: 1,
    // MultiThreaded: 2,
} as const;

export class SystemSchedule {
    __systems: System<any, any>[];
    __system_conditions: Array<Condition>[];
    __set_conditions: Array<Condition>[];
    __system_ids: NodeId[];
    __set_ids: NodeId[];
    __system_dependencies: number[];
    __system_dependents: Array<number>[];
    __sets_with_conditions_of_systems: FixedBitSet[];
    __systems_in_sets_with_conditions: FixedBitSet[];

    constructor(
        systems: System<any, any>[],
        system_conditions: Array<Condition>[],
        set_conditions: Array<Condition>[],
        system_ids: NodeId[],
        set_ids: NodeId[],
        system_dependencies: number[],
        system_dependents: Array<number>[],
        sets_with_conditions_of_systems: FixedBitSet[],
        systems_in_sets_with_conditions: FixedBitSet[]
    ) {
        this.__systems = systems;
        this.__system_conditions = system_conditions;
        this.__set_conditions = set_conditions;
        this.__system_ids = system_ids;
        this.__set_ids = set_ids;
        this.__system_dependencies = system_dependencies;
        this.__system_dependents = system_dependents;
        this.__sets_with_conditions_of_systems = sets_with_conditions_of_systems;
        this.__systems_in_sets_with_conditions = systems_in_sets_with_conditions;

        // console.log('SystemSchedule ctor', this);
    }

    transfer(schedule: SystemSchedule) {
        this.__systems = schedule.__systems;
        this.__system_conditions = schedule.__system_conditions;
        this.__set_conditions = schedule.__set_conditions;
        this.__system_ids = schedule.__system_ids;
        this.__set_ids = schedule.__set_ids;
        this.__system_dependencies = schedule.__system_dependencies;
        this.__system_dependents = schedule.__system_dependents;
        this.__sets_with_conditions_of_systems = schedule.__sets_with_conditions_of_systems;
        this.__systems_in_sets_with_conditions = schedule.__systems_in_sets_with_conditions;
    }

    static default() {
        return new SystemSchedule(
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            []
        )
    }


}


export function is_apply_deferred(system: System<any, any>): boolean {
    return system.type_id() === ApplyDeferred.type_id
}
