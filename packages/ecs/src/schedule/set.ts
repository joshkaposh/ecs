import type { Option } from "joshkaposh-option";
import { SetRegistry } from 'define'
import { Chain, type ScheduleGraph } from "./schedule";
import { Configs, Schedulable, ScheduleConfig, type SystemConfig } from "./config";
import { Ambiguity } from "./graph";
import { entry, type TypeId } from "../util";

export const $is_system_set = Symbol('SYSTEM SET');

export type InternedSystemSet = SystemSet;

export interface SystemSet {
    readonly systemType: Option<UUID>;
    readonly isAnonymous: boolean;

    intern(): SystemSet;
}

export class SystemTypeSet implements SystemSet {
    #phantom_data: TypeId;
    constructor(phantom_data: TypeId) {
        this.#phantom_data = phantom_data;

        this.systemType = phantom_data.type_id;
        this.isAnonymous = false;
    }

    [$is_system_set] = true;

    intern(): SystemSet {
        //! SAFETY: this was interned at object creation
        // return this;
        return entry(SetRegistry, this.#phantom_data.type_id, () => this)
    }

    intoConfig(): Configs<Schedulable<SystemSet, Chain>> {
        throw new Error('configuring system type sets is not allowed')
    }

    processConfig(schedule_graph: ScheduleGraph, config: SystemConfig) {
        return schedule_graph.configureSetInner(config);
    }

    clone() {
        return new SystemTypeSet(this.#phantom_data);
    }

    readonly isAnonymous: boolean;
    readonly systemType: Option<UUID>;


    [Symbol.toPrimitive]() {
        return `SystemTypeSet:${this.#phantom_data}`;
    }
}

export class AnonymousSet implements SystemSet {
    #id: number;
    constructor(id: number) {
        this.#id = id;
    }

    [$is_system_set] = true;

    intern(): SystemSet {
        return entry(SetRegistry, `AnonymousSet:${this.#id}`, () => this)
    }

    intoConfig() {
        return new ScheduleConfig(
            this,
            {
                hierarchy: [this],
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    }

    processConfig(schedule_graph: ScheduleGraph, config: SystemConfig) {
        return schedule_graph.configureSetInner(config);
    }

    get systemType(): Option<UUID> {
        return
    }

    get isAnonymous() {
        return true
    }

    [Symbol.toPrimitive]() {
        return `AnonymousSet:${this.#id}`
    }
}

export interface IntoSystemSet {
    intoSystemSet(): SystemSet;
}

// const SetRegistry = new Map() as Map<string, SystemSet>;

// function get_hash_of_systems(sets: (System<any, any> | SystemSet)[]) {
//     let h = ''
//     for (let i = 0; i < sets.length; i++) {
//         const type = sets[i];
//         if ('type_id' in type) {
//             h += type.type_id;
//         } else {
//             h += `${type}`;
//         }
//     }
//     return h;
// }

// interface ToString {
//     [Symbol.toPrimitive](): string;
//     [Symbol.toStringTag](): string;

// }

// export interface SystemSetDefinition extends SystemSet, IntoSystemSet<SystemSet>, IntoScheduleConfig<Schedulable<SystemSet, Chain>>, ProcessScheduleConfig, ToString { }

// export function set<const S extends readonly (System<any, any> | SystemSet | IntoScheduleConfig<Schedulable>)[]>(...system_sets: S): SystemSetDefinition {
//     const sets = system_sets.flat(Infinity) as unknown as (SystemSet & IntoSystemSet<any> & IntoScheduleConfig<Schedulable>)[];
//     const hash = get_hash_of_systems(sets);

//     const set = SetRegistry.get(hash);

//     if (set) {
//         return set as SystemSetDefinition;
//     } else {
//         const set_configs = sets.map(s => s.intoConfig());

//         const system_set: SystemSetDefinition = {
//             isAnonymous: false,
//             systemType: undefined,
//             intern() {
//                 return entry(SetRegistry, hash, () => this)
//             },
//             intoSystemSet() {
//                 return this
//             },
//             intoConfig() {
//                 return new Configs(this, set_configs, [], Chain.Unchained)
//                 // return new ScheduleConfig(
//                 //     this as any,
//                 //     {
//                 //         hierarchy: default_system_sets,
//                 //         dependencies: [],
//                 //         ambiguous_with: Ambiguity.default()
//                 //     },
//                 //     []
//                 // )
//             },
//             inSet(set) {
//                 return this.intoConfig().inSet(set);
//             },
//             before(set) {
//                 return this.intoConfig().before(set);
//             },
//             after(set) {
//                 return this.intoConfig().after(set);
//             },
//             beforeIgnoreDeferred(set) {
//                 return this.intoConfig().beforeIgnoreDeferred(set);
//             },
//             afterIgnoreDeferred(set) {
//                 return this.intoConfig().afterIgnoreDeferred(set);
//             },
//             chain() {
//                 return this.intoConfig().chain();
//             },
//             chainIgnoreDeferred() {
//                 return this.intoConfig().chainIgnoreDeferred();
//             },
//             runIf(condition) {
//                 return this.intoConfig().runIf(condition);
//             },
//             distributiveRunIf(condition) {
//                 return this.intoConfig().distributiveRunIf(condition);
//             },
//             ambiguousWith(set) {
//                 return this.intoConfig().ambiguousWith(set);
//             },
//             ambiguousWithAll() {
//                 return this.intoConfig().ambiguousWithAll();
//             },
//             processConfig(schedule_graph, config) {
//                 return schedule_graph.configureSetInner(config as any);
//             },
//             [Symbol.toPrimitive]() {
//                 return `set (${sets.join(',')})`
//             },
//             [Symbol.toStringTag]() {
//                 return `set (${sets.join(',')})`
//             }
//         }

//         SetRegistry.set(hash, system_set);
//         return system_set;
//     }
// }
