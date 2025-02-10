import { Condition } from "./condition";
import { Chain, ProcessNodeConfig, ScheduleGraph } from "./schedule";
import { Ambiguity, Dependency, DependencyKind, GraphInfo } from './graph'
import { assert } from "joshkaposh-iterator/src/util";
import { is_none } from "joshkaposh-option";
import { InternedSystemSet, IntoSystemSet } from "./set";
import { System } from "../system";

type ScheduleSystem = System<any, any>;

function new_condition<M>(condition: Condition<M>): any {
    const condition_system = condition.into_system();
    assert(condition_system.is_send(), `Condition ${condition_system.name()} accesses \`NonSend\` resources. This is currently unsupported`)
    return condition_system
}

function ambiguous_with(graph_info: GraphInfo, set: InternedSystemSet) {
    const amb = graph_info.ambiguous_with
    if (amb === Ambiguity.Check) {
        graph_info.ambiguous_with = Ambiguity.IgnoreWithSet(set)
    } else {
        //* SAFETY: Ambiguity is either a number or Array 
        // @ts-expect-error
        amb.push(set)
    }
}

export interface IntoSystemConfigs<Marker> {
    into_configs(): SystemConfigs;
}

export interface IntoSystemSetConfigs<Marker> {
    into_configs(): SystemSetConfigs;
};

export class NodeConfig<T extends ProcessNodeConfig> implements IntoSystemConfigs<T> {
    constructor(
        public node: T,
        public graph_info: GraphInfo,
        public conditions: Condition<any>[]
    ) {
    }

    process_config(schedule_graph: ScheduleGraph) {
        return schedule_graph.add_system_inner(this as any);
    }

    // * IntoSystemConfigs impl    
    into_configs(): SystemConfigs {
        return this as unknown as SystemConfigs;
    }

    in_set_inner(set: InternedSystemSet) {
        this.graph_info.hierarchy.push(set)
    }

    in_set(set: InternedSystemSet): SystemConfigs {
        assert(is_none(set.system_type()));
        this.in_set_inner(set);
        return this as unknown as SystemConfigs;
    }

    before_inner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set));
        this.graph_info.hierarchy.push(set);
    }

    before<M>(set: IntoSystemSet<M>): SystemConfigs {
        const set_ = set.into_system_set();
        this.before_inner(set_);
        return this as unknown as SystemConfigs;
    }

    after_inner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set));
        this.graph_info.hierarchy.push(set);
    }

    after<M>(set: IntoSystemSet<M>): SystemConfigs {
        const set_ = set.into_system_set()
        this.after_inner(set_);
        return this as unknown as SystemConfigs;
    }

    before_ignore_deferred_inner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.Before, set))
    }

    before_ignore_deferred<M>(set: IntoSystemSet<M>): SystemConfigs {
        const set_ = set.into_system_set();
        this.before_ignore_deferred_inner(set_);
        return this as unknown as SystemConfigs;
    }

    after_ignore_deferred_inner(set: InternedSystemSet) {
        this.graph_info.dependencies.push(new Dependency(DependencyKind.After, set))
    }

    after_ignore_deferred<M>(set: IntoSystemSet<M>): SystemConfigs {
        const set_ = set.into_system_set();
        this.after_ignore_deferred_inner(set_);
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

    ambiguous_with_inner(set: InternedSystemSet) {
        ambiguous_with(this.graph_info, set);
    }

    ambiguous_with<M>(set: IntoSystemSet<M>): SystemConfigs {
        const set_ = set.into_system_set();
        this.ambiguous_with_inner(set_);
        return this as unknown as SystemConfigs;
    }

    chain() {
        return this;
    }
}

// export type SystemConfig = NodeConfig<ScheduleSystem>;
// export type SystemConfigs = NodeConfigs<ScheduleSystem>;
export type SystemConfig = NodeConfig<ProcessNodeConfig>;
export type SystemConfigs = NodeConfigs<ProcessNodeConfig>;

export class Configs<T extends ProcessNodeConfig> implements IntoSystemSetConfigs<any> {
    constructor(
        public configs: readonly NodeConfigs<T>[],
        public collective_conditions: Condition<any>[],
        public chained: Chain
    ) {
    }
    process_config(schedule_graph: ScheduleGraph) {
        // console.log('Configs process_config()');

        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            configs[i].process_config(schedule_graph);
        }
        // return this.node.process_config(schedule_graph, this as unknown as NodeConfig<ProcessNodeConfig>)
    }


    into_configs(): SystemSetConfigs {
        return this as unknown as SystemSetConfigs;
    }

    in_set_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            config.in_set_inner(set);
        }
    }

    in_set(set: InternedSystemSet): SystemSetConfigs {
        assert(!set.system_type());
        this.in_set_inner(set);
        return this as unknown as SystemSetConfigs;
    }

    before_inner(set: InternedSystemSet) {
        const configs = this.configs
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            config.before_inner(set);
        }
    }

    before<M>(set: IntoSystemSet<M>): SystemSetConfigs {
        const set_ = set.into_system_set();
        this.before_inner(set_)
        return this as unknown as SystemSetConfigs;
    }

    after_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            configs[i].after_inner(set);
        }
    }

    after<M>(set: IntoSystemSet<M>): SystemSetConfigs {
        const set_ = set.into_system_set();
        this.after_inner(set_)
        return this as unknown as SystemSetConfigs;
    }

    before_ignore_deferred_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            configs[i].before_ignore_deferred_inner(set);
        }
    }

    before_ignore_deferred<M>(set: IntoSystemSet<M>): SystemSetConfigs {
        const set_ = set.into_system_set();
        this.before_inner(set_)
        return this as unknown as SystemSetConfigs;
    }

    after_ignore_deferred_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            configs[i].after_ignore_deferred_inner(set);
        }
    }

    after_ignore_deferred<M>(set: IntoSystemSet<M>): SystemSetConfigs {
        const set_ = set.into_system_set();
        this.after_inner(set_)
        return this as unknown as SystemSetConfigs;
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

    run_if<M>(condition: Condition<M>): SystemSetConfigs {
        this.run_if_dyn(new_condition(condition));
        return this as unknown as SystemSetConfigs;

    }

    ambiguous_with_inner(set: InternedSystemSet) {
        const configs = this.configs;
        for (let i = 0; i < configs.length; i++) {
            configs[i].ambiguous_with_inner(set);
        }
    }

    ambiguous_with<M>(set: IntoSystemSet<M>): SystemSetConfigs {
        const set_ = set.into_system_set();
        this.ambiguous_with_inner(set_)
        return this as unknown as SystemSetConfigs;
    }

    chain_inner() {
        this.chained = Chain.Chained(new Map());
    }

    chain(): SystemSetConfigs {
        this.chain_inner()
        return this as unknown as SystemSetConfigs;
    }

    chain_ignore_deferred_inner() {
        this.chained = Chain.Chained(new Map());
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
        const sets = system.default_system_sets();
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


export type SystemSetConfig = NodeConfig<ProcessNodeConfig>;
export type SystemSetConfigs = Configs<ProcessNodeConfig>;

// export type SystemSetConfig = NodeConfig<InternedSystemSet>;
// export type SystemSetConfigs = Configs<InternedSystemSet>;

