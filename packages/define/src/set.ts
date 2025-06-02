import { type System, type SystemSet, type IntoSystemSet, type IntoScheduleConfig, type ProcessScheduleConfig, type Schedulable, Chain, Configs } from "ecs";
import { entry } from "ecs/src/util";

export const SetRegistry = new Map() as Map<string, SystemSet>;

function get_hash_of_systems(sets: (System<any, any> | SystemSet)[]) {
    let h = ''
    for (let i = 0; i < sets.length; i++) {
        const type = sets[i];
        if ('type_id' in type) {
            h += type.type_id;
        } else {
            h += `${type}`;
        }
    }
    return h;
}

interface ToString {
    [Symbol.toPrimitive](): string;
    [Symbol.toStringTag](): string;

}

export interface SystemSetDefinition extends SystemSet, IntoSystemSet, IntoScheduleConfig<Schedulable<SystemSet, Chain>>, ProcessScheduleConfig, ToString { }

export function set<const S extends readonly (System<any, any> | SystemSet | IntoScheduleConfig<Schedulable>)[]>(...system_sets: S): SystemSetDefinition {
    const sets = system_sets.flat(Infinity) as unknown as (SystemSet & IntoSystemSet & IntoScheduleConfig<Schedulable>)[];
    const hash = get_hash_of_systems(sets);

    const set = SetRegistry.get(hash);

    if (set) {
        return set as SystemSetDefinition;
    } else {
        const set_configs = sets.map(s => s.intoConfig());

        const system_set: SystemSetDefinition = {
            isAnonymous: false,
            systemType: undefined,
            intern() {
                return entry(SetRegistry, hash, () => this)
            },
            intoSystemSet() {
                return this
            },
            intoConfig() {
                return new Configs(this, set_configs, [], Chain.Unchained)
                // return new ScheduleConfig(
                //     this as any,
                //     {
                //         hierarchy: default_system_sets,
                //         dependencies: [],
                //         ambiguous_with: Ambiguity.default()
                //     },
                //     []
                // )
            },
            inSet(set) {
                return this.intoConfig().inSet(set);
            },
            before(set) {
                return this.intoConfig().before(set);
            },
            after(set) {
                return this.intoConfig().after(set);
            },
            beforeIgnoreDeferred(set) {
                return this.intoConfig().beforeIgnoreDeferred(set);
            },
            afterIgnoreDeferred(set) {
                return this.intoConfig().afterIgnoreDeferred(set);
            },
            chain() {
                return this.intoConfig().chain();
            },
            chainIgnoreDeferred() {
                return this.intoConfig().chainIgnoreDeferred();
            },
            runIf(condition) {
                return this.intoConfig().runIf(condition);
            },
            distributiveRunIf(condition) {
                return this.intoConfig().distributiveRunIf(condition);
            },
            ambiguousWith(set) {
                return this.intoConfig().ambiguousWith(set);
            },
            ambiguousWithAll() {
                return this.intoConfig().ambiguousWithAll();
            },
            processConfig(schedule_graph, config) {
                return schedule_graph.configureSetInner(config as any);
            },
            [Symbol.toPrimitive]() {
                return `set (${sets.join(',')})`
            },
            [Symbol.toStringTag]() {
                return `set (${sets.join(',')})`
            }
        }

        SetRegistry.set(hash, system_set);
        return system_set;
    }
}