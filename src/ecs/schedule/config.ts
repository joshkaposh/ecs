import { Condition, IntoSystemTrait, ScheduleSystem, System } from "../system";
import { Chain, ScheduleGraph, SystemNode } from "./schedule";
import { Ambiguity, DependencyKind, GraphInfo } from './graph'
import { assert } from "joshkaposh-iterator/src/util";
import { is_none } from "joshkaposh-option";
import { IntoSystemSet, SystemSet } from "./set";
import { iter } from "joshkaposh-iterator";

// @ts-expect-error
function new_condition<M>(condition: Condition<M>): any {
    const condition_system = IntoSystemTrait.into_system(condition as any);
    assert(condition_system.is_send(), `Condition ${condition_system.name()} accesses \`NonSend\` resources. This is currently unsupported`)
    return condition_system
}

function ambiguous_with(graph_info: GraphInfo, set: SystemSet) {
    const amb = graph_info.ambiguous_with
    if (amb === Ambiguity.Check) {
        graph_info.ambiguous_with = Ambiguity.IgnoreWithSet([set])
    } else if (Array.isArray(amb)) {
        amb.push(set)
    }
}

export class NodeConfig<T> {
    constructor(
        public node: T,
        public graph_info: GraphInfo,
        public conditions: Condition[]
    ) { }

    process_config(schedule_graph: ScheduleGraph) {
        // @ts-expect-error
        this.node.process_config(schedule_graph, this)
    }
}

export type SystemConfig = NodeConfig<ScheduleSystem>;

export class Configs<T> {
    constructor(
        public configs: NodeConfig<T>[],
        public collective_conditions: Condition[],
        public chained: Chain) { }

    [Symbol.iterator]() {
        return iter(this.configs);
    }
}

export type NodeConfigs<T> = Configs<T> | NodeConfig<T>
export const NodeConfigs = {
    Configs,
    NodeConfig,
    new_system(system: ScheduleSystem) {
        const sets = system.default_system_sets();
        return new this.NodeConfig(
            system,
            {
                hierarchy: sets,
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    },
    in_set_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            config.graph_info.hierarchy.push(set);
        } else {
            for (const cfg of config) {
                cfg.in_set_inner(set);
            }
        }
    },

    before_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            config.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set))
        } else {
            for (const cfg of config) {
                cfg.before_inner(set);
            }
        }
    },

    after_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            config.graph_info.dependencies.push(new Dependency(DependencyKind.After, set))
        } else {
            for (const cfg of config) {
                cfg.after_inner(set);
            }
        }
    },

    before_ignore_deferred_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            config.graph_info.dependencies.push(new Dependency(DependencyKind.BeforeNoSync, set))
        } else {
            for (const cfg of config) {
                cfg.before_ignore_deferred_inner(set);
            }
        }
    },

    after_ignore_deferred_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            config.graph_info.dependencies.push(new Dependency(DependencyKind.AfterNoSync, set))
        } else {
            for (const cfg of config) {
                cfg.after_ignore_deferred_inner(set);
            }
        }
    },

    ambiguous_with_inner<T>(config: NodeConfigs<T>, set: SystemSet) {
        if (config instanceof NodeConfig) {
            ambiguous_with(config.graph_info, set);
        } else {
            for (const cfg of config) {
                cfg.ambiguous_with_inner(set);
            }
        }
    },

    ambiguous_with_all_inner<T>(config: NodeConfigs<T>) {
        if (config instanceof NodeConfig) {
            config.graph_info.ambiguous_with = Ambiguity.IgnoreAll;
        } else {
            for (const cfg of config) {
                cfg.ambiguous_with_all_inner();
            }
        }
    },

    run_if_dyn<T>(config: NodeConfigs<T>, condition: Condition) {
        if (config instanceof NodeConfig) {
            config.conditions.push(condition)
        } else {
            config.collective_conditions.push(condition)
        }
    },

    chain_inner<T>(config: NodeConfigs<T>) {
        if (config instanceof Configs) {
            config.chained = Chain.Yes
        }
        return config;
    },

    chain_ignore_deferred_inner<T>(config: NodeConfigs<T>) {
        if (config instanceof Configs) {
            config.chained = Chain.YesIgnoreDeferred;
        }
        return config;
    },


    //* IntoSystemSetConfigs

    into_configs() {
        return this;
    },

    in_set<T>(config: NodeConfigs<T>, set: SystemSet) {
        assert(is_none(set.system_type()), 'Adding arbitrary systems to a system type set is not allowed')
        this.in_set_inner(config, set);
        return this;
    },

    before<T, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_inner(config, set as unknown as SystemSet)
        return this;
    },

    after<T, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
        // @ts-expect-error
        set = set.into_system_set();
        this.after_inner(config, set as unknown as SystemSet)
        return this;
    },


    before_ignore_deferred<T, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
        // @ts-expect-error
        set = set.into_system_set();
        this.before_ignore_deferred_inner(config, set as unknown as SystemSet)
        return this;
    },

    after_ignore_deferred<T, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
        // @ts-expect-error
        set = set.into_system_set();
        this.after_ignore_deferred_inner(config, set as unknown as SystemSet)
        return this;
    },

    // @ts-expect-error
    run_if<T, M>(config: NodeConfigs<T>, condition: Condition<M>) {
        this.run_if_dyn(config, new_condition(condition));
        return this
    },

    ambiguous_with<T, M extends SystemSet>(config: NodeConfigs<T>, set: IntoSystemSet<M>) {
        this.ambiguous_with_inner(config, set as unknown as SystemSet)
        return this
    },


    ambiguous_with_all<T>(config: NodeConfigs<T>) {
        this.ambiguous_with_all_inner(config)
        return this
    },

    chain<T>(config: NodeConfigs<T>) {
        return this.chain_inner(config);
    },

    chain_ignore_deferred<T>(config: NodeConfigs<T>) {
        return this.chain_ignore_deferred_inner(config);
    }
}

export type SystemConfigs = NodeConfigs<ScheduleSystem>;

export abstract class IntoSystemConfigs<Marker> {
    abstract into_configs(): SystemConfigs;

    in_set(set: SystemSet): SystemConfigs {
        return this.into_configs().in_set(set);
    }

    before<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().before(set);
    }

    after<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().after(set)
    }

    before_ignore_deferred<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().before_ignore_deferred(set);
    }

    after_ignore_deferred<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().after_ignore_deferred(set);
    }

    run_if<M>(condition: Condition<M>): SystemConfigs {
        return this.into_configs().run_if(condition)
    }

    ambiguous_with<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().ambiguous_with(set)
    }

    ambiguous_with_all<M>(set: IntoSystemSet<M>): SystemConfigs {
        return this.into_configs().ambiguous_with_all()

    }

    chain() {
        return this.into_configs().chain()
    }


    chain_ignore_deferred() {
        return this.into_configs().chain_ignore_deferred()
    }
}

export class SystemSetConfig extends NodeConfig<SystemSet> {
    constructor(set: SystemSet) {
        super(set, {
            dependencies: [],
            hierarchy: new SystemSet(),
            ambiguous_with: Ambiguity.default()
        }, [])
    }
}

export type SystemSetConfigs = NodeConfigs<SystemSet>;

export abstract class IntoSytemSetConfigs<M> {
    abstract into_configs(): SystemSetConfigs

    in_set(set: SystemSet): SystemSetConfigs {
        // @ts-expect-error
        return this.into_configs().in_set(set)
    }

    before<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().before(set)

    }


    after<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().after(set)

    }

    before_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().before_ignore_deferred(set)

    }

    after_ignore_deferred<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().after_ignore_deferred(set)
    }


    // @ts-expect-error
    run_if<M>(condition: Condition<M>): SystemSetConfigs {
        return this.into_configs().run_if(condition)
    }

    ambiguous_with<M extends SystemSet>(set: IntoSystemSet<M>): SystemSetConfigs {
        return this.into_configs().ambiguous_with(set)

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

