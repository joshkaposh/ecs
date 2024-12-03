import { Condition, System } from "../system";
import { SystemNode } from "./schedule";

type GraphInfo = any;

export class NodeConfig<T> {
    constructor(public node: T, public graph_info: GraphInfo, public conditions: Condition[]) {
    }
}
export class Configs {

    constructor(public configs: NodeConfig<any>[], public collective_conditions: NodeConfig<any>[], public chained: boolean) {
    }
}

export type NodeConfigs<ProcessNodeConfig> = typeof NodeConfigs[keyof typeof NodeConfigs]
export const NodeConfigs = {
    Configs,
    NodeConfig,
    new_system(system: System) {
        const sets = system.default_system_sets().collect();
    }
}


class IntoSytemConfigs {
    into_configs(): any {
        return
    }
};
export type IntoSytemSetConfigs = any;
export type SystemConfig = any;

export type SystemSet = any;

export class SystemSetConfig {
    node!: SystemNode;
    conditions: unknown[];
    graph_info: unknown;
    constructor(set: SystemSet) {
        this.conditions = []
    }
}