import { Condition, IntoSystemTrait, ScheduleSystem } from "../system";
import { Chain, ProcessNodeConfig, ScheduleGraph } from "./schedule";
import { Ambiguity, DependencyKind, GraphInfo } from './graph'
import { assert } from "joshkaposh-iterator/src/util";
import { is_none } from "joshkaposh-option";
import { IntoSystemSet, SystemSet } from "./set";

type InternedSystemSet = SystemSet;

function new_condition<M>(condition: Condition<M>): any {
    const condition_system = IntoSystemTrait.into_system(condition as any);
    assert(condition_system.is_send(), `Condition ${condition_system.name()} accesses \`NonSend\` resources. This is currently unsupported`)
    return condition_system
}

function ambiguous_with(graph_info: GraphInfo, set: SystemSet) {
    const amb = graph_info.ambiguous_with
    if (amb === Ambiguity.Check) {
        graph_info.ambiguous_with = Ambiguity.IgnoreWithSet(set)
    } else if (Array.isArray(amb)) {
        amb.push(set)
    }
}

export abstract class IntoSystemConfigs<Marker> {
    abstract into_configs(): SystemConfigs;

    in_set(set: SystemSet): SystemConfigs {
        return this.into_configs().in_set(set);
    }

    before<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().before(set);
    }

    after<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().after(set)
    }

    before_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().before_ignore_deferred(set);
    }

    after_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().after_ignore_deferred(set);
    }

    distributive_run_if<M>(condition: Condition<M>): SystemConfigs {
        return this.into_configs().distributive_run_if(condition);
    }

    run_if<M>(condition: Condition<M>): SystemConfigs {
        return this.into_configs().run_if(condition)
    }

    ambiguous_with<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().ambiguous_with(set)
    }

    ambiguous_with_all(): SystemConfigs {
        return this.into_configs().ambiguous_with_all()
    }

    chain() {
        return this.into_configs().chain()
    }

    chain_ignore_deferred() {
        return this.into_configs().chain_ignore_deferred()
    }
}

export abstract class IntoSystemSetConfigs<M> {
    abstract into_configs(): SystemSetConfigs

    in_set(set: SystemSet): SystemSetConfigs {
        return this.into_configs().in_set(set) as unknown as SystemSetConfigs
    }

    before<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().before(set) as unknown as SystemSetConfigs
    }

    after<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().after(set) as unknown as SystemSetConfigs
    }

    before_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().before_ignore_deferred(set) as unknown as SystemSetConfigs

    }

    after_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().after_ignore_deferred(set) as unknown as SystemSetConfigs
    }

    run_if<M>(condition: Condition<M>): SystemSetConfigs {
        return this.into_configs().run_if(condition) as unknown as SystemSetConfigs
    }

    ambiguous_with<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().ambiguous_with(set) as unknown as SystemSetConfigs

    }

    ambiguous_with_all(): SystemSetConfigs {
        return this.into_configs()

    }

    chain() {
        return this.into_configs().chain();

    }

    chain_ignore_deferred() {
        return this.into_configs().chain_ignore_deferred();
    }

};

// const NodeConfigsImpl = {
//     in_set_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             // @ts-expect-error
//             this.graph_info.hierarchy.push(set);
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.in_set_inner(set);
//             }
//         }
//     },

//     before_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             this.graph_info.dependencies.push({ kind: DependencyKind.Before, set })
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.before_inner(set);
//             }
//         }
//     },

//     after_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             this.graph_info.dependencies.push({ kind: DependencyKind.After, set })
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.after_inner(set);
//             }
//         }
//     },

//     before_ignore_deferred_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             this.graph_info.dependencies.push({ kind: DependencyKind.BeforeNoSync, set })
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.before_ignore_deferred_inner(set);
//             }
//         }
//     },

//     after_ignore_deferred_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             this.graph_info.dependencies.push({ kind: DependencyKind.AfterNoSync, set })
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.after_ignore_deferred_inner(set);
//             }
//         }
//     },

//     ambiguous_with_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>, set: SystemSet) {
//         if (this instanceof NodeConfig) {
//             ambiguous_with(this.graph_info, set);
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.ambiguous_with_inner(set);
//             }
//         }
//     },

//     ambiguous_with_all_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>) {
//         if (this instanceof NodeConfig) {
//             this.graph_info.ambiguous_with = Ambiguity.IgnoreAll;
//         } else {
//             for (const cfg of this) {
//                 // @ts-expect-error
//                 cfg.ambiguous_with_all_inner();
//             }
//         }
//     },

//     run_if_dyn<T extends ProcessNodeConfig>(this: NodeConfigs<T>, condition: Condition<any>) {
//         if (this instanceof NodeConfig) {
//             this.conditions.push(condition)
//         } else {
//             this.collective_conditions.push(condition)
//         }
//     },

//     chain_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>) {
//         if (this instanceof Configs) {
//             this.chained = Chain.Yes
//         }
//         return this;
//     },

//     chain_ignore_deferred_inner<T extends ProcessNodeConfig>(this: NodeConfigs<T>) {
//         if (this instanceof Configs) {
//             this.chained = Chain.YesIgnoreDeferred;
//         }
//         return this;
//     },

//     // * IntoSystemConfigs impl
//     // into_configs() {
//     //     return this;
//     // },

//     // in_set<T extends ProcessNodeConfig>(config: NodeConfigs<T>, set: SystemSet) {
//     //     assert(is_none(set.system_type()), 'Adding arbitrary systems to a system type set is not allowed')
//     //     this.in_set_inner(config, set);
//     //     return this;
//     // },

//     // before<T extends ProcessNodeConfig, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
//     //     // @ts-expect-error
//     //     set = set.into_system_set();
//     //     this.before_inner(config, set as unknown as SystemSet)
//     //     return this;
//     // },

//     // after<T extends ProcessNodeConfig, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
//     //     // @ts-expect-error
//     //     set = set.into_system_set();
//     //     this.after_inner(config, set as unknown as SystemSet)
//     //     return this;
//     // },

//     // before_ignore_deferred<T extends ProcessNodeConfig, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
//     //     // @ts-expect-error
//     //     set = set.into_system_set();
//     //     this.before_ignore_deferred_inner(config, set as unknown as SystemSet)
//     //     return this;
//     // },

//     // after_ignore_deferred<T extends ProcessNodeConfig, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
//     //     // @ts-expect-error
//     //     set = set.into_system_set();
//     //     this.after_ignore_deferred_inner(config, set as unknown as SystemSet)
//     //     return this;
//     // },

//     // run_if<T extends ProcessNodeConfig, M>(config: NodeConfigs<T>, condition: Condition<M>) {
//     //     this.run_if_dyn(config, new_condition(condition));
//     //     return this
//     // },

//     // ambiguous_with<T extends ProcessNodeConfig, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
//     //     this.ambiguous_with_inner(config, set as unknown as SystemSet)
//     //     return this
//     // },


//     // ambiguous_with_all<T extends ProcessNodeConfig>(config: NodeConfigs<T>) {
//     //     this.ambiguous_with_all_inner(config)
//     //     return this
//     // },

//     // chain<T extends ProcessNodeConfig>(config: NodeConfigs<T>) {
//     //     return this.chain_inner(config);
//     // },

//     // chain_ignore_deferred<T extends ProcessNodeConfig>(config: NodeConfigs<T>) {
//     //     return this.chain_ignore_deferred_inner(config);
//     // }

// }

export type SystemConfig = NodeConfig<ScheduleSystem>;

export class NodeConfig<T extends ProcessNodeConfig> extends IntoSystemConfigs<T> {
    constructor(
        public node: T,
        public graph_info: GraphInfo,
        public conditions: Condition<any>[]
    ) {
        super()
    }

    process_config(schedule_graph: ScheduleGraph) {
        return this.node.process_config(schedule_graph, this as unknown as NodeConfig<ProcessNodeConfig>)
    }

    // * IntoSystemConfigs impl    
    into_configs(): SystemConfigs {
        // return this.node;
        return this as unknown as SystemConfigs
    }

    in_set_inner(set: InternedSystemSet) {
        console.log('NodeConfig in_set_inner() adding set to hierarchy', set);

        // @ts-expect-error
        this.graph_info.hierarchy.push(set)
    }

    in_set(set: InternedSystemSet): SystemConfigs {
        assert(is_none(set.system_type()));
        this.in_set_inner(set);
        return this as unknown as SystemConfigs;
    }

    before_inner(set: InternedSystemSet) {
        console.log('before_inner', set);

        this.graph_info.dependencies.push({ kind: DependencyKind.Before, set })
    }

    before<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_inner(set as unknown as SystemSet);
        return this as unknown as SystemConfigs;
    }

    after_inner(set: InternedSystemSet) {
        this.graph_info.dependencies.push({ kind: DependencyKind.After, set })
    }

    after<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set()
        this.after_inner(set as unknown as SystemSet);
        return this as unknown as SystemConfigs;
    }

    before_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_ignore_deferred_inner(set as unknown as SystemSet);
        return this as unknown as SystemConfigs;
    }

    distributive_run_if_inner<M>(condition: Condition<M>) {
        this.conditions.push(new_condition(condition));
    }

    run_if_dyn<M>(condition: Condition<M>) {
        this.conditions.push(condition);
    }

    run_if<M>(condition: Condition<M>): SystemConfigs {
        this.run_if_dyn(new_condition(condition));
        return this as unknown as SystemConfigs;
    }
}

export type SystemConfigs = NodeConfigs<ScheduleSystem>;

export class Configs<T extends ProcessNodeConfig> extends IntoSystemConfigs<any> {
    constructor(
        public configs: readonly NodeConfigs<T>[],
        public collective_conditions: Condition<any>[],
        public chained: Chain
    ) {
        super()
    }

    into_configs(): SystemConfigs {
        return this as unknown as SystemConfigs
    }

    in_set_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            config.in_set_inner(set);
        }
    }

    in_set(set: InternedSystemSet): SystemConfigs {
        assert(!set.system_type());
        this.in_set_inner(set);
        return this as unknown as SystemConfigs;
    }

    before_inner(set: InternedSystemSet) {
        const configs = this.configs
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            config.before_inner(set);
        }
    }

    before<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_inner(set as unknown as SystemSet)
        return this as unknown as SystemConfigs
    }

    after<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.after_inner(set as unknown as SystemSet)
        return this as unknown as SystemConfigs
    }

    before_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_inner(set as unknown as SystemSet)
        return this as unknown as SystemConfigs
    }

    after_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.after_inner(set as unknown as SystemSet)
        return this as unknown as SystemConfigs
    }

    // distributive_run_if_inner<M>(condition: Condition<M>) {
    //     const configs = this.configs;
    //     for (let i = 0; i < configs.length; i++) {
    //         configs[i].distributive_run_if_inner(condition)
    //     }
    // }

    // distributive_run_if<M>(condition: Condition<M>): Configs<T> {
    //     this.distributive_run_if_inner(condition);
    //     return this
    // }

    run_if_dyn<M>(condition: Condition<M>) {
        this.collective_conditions.push(condition);
    }

    run_if<M>(condition: Condition<M>): SystemConfigs {
        this.run_if_dyn(new_condition(condition));
        return this as unknown as SystemConfigs;
        // return this.into_configs().run_if(condition);
    }

    ambiguous_with<M extends SystemSet>(set: IntoSystemSet<M>): SystemConfigs {
        // @ts-expect-error
        set = set.into_system_set();
        this.ambiguous_with_inner(set as unknown as SystemSet)
        return this as unknown as SystemConfigs
    }

    chain_inner(): SystemConfigs {
        this.chained = Chain.Yes;
        return this as unknown as SystemConfigs;
    }

    chain(): SystemConfigs {
        return this.chain_inner()
    }

    chain_ignore_deferred_inner() {
        this.chained = Chain.YesIgnoreDeferred;
        return this;
    }

    chain_ignore_deferred(): SystemConfigs {
        return this.chain_ignore_deferred_inner() as unknown as SystemConfigs;
    }
}

export type NodeConfigs<T extends ProcessNodeConfig> = Configs<T> | NodeConfig<T>

export const NodeConfigs = {
    Configs,
    NodeConfig,
    new_system(system: ScheduleSystem) {
        const sets = system.default_system_sets() as unknown as SystemSet;
        return new NodeConfig(
            system,
            {
                hierarchy: sets,
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    },
}

// Object.entries(NodeConfigsImpl).forEach(([key, value]) => {
//     Object.defineProperty(NodeConfig.prototype, key, { value })
//     Object.defineProperty(Configs.prototype, key, { value })
// })


export class SystemSetConfig extends NodeConfig<SystemSet> {
    constructor(set: SystemSet) {
        super(set, {
            dependencies: [],
            hierarchy: set,
            ambiguous_with: Ambiguity.default()
        }, [])
    }
}

export type SystemSetConfigs = NodeConfigs<SystemSet>;

