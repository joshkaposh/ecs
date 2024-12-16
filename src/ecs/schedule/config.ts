import { Condition, System } from "../system";
import { SystemNode } from "./schedule";
import { GraphInfo } from './graph'


export class NodeConfig<T> {
    constructor(
        public node: T,
        public graph_info: GraphInfo,
        public conditions: Condition[]
    ) { }
}
export class Configs {
    constructor(
        public configs: NodeConfig<any>[],
        public collective_conditions: NodeConfig<any>[],
        public chained: boolean) { }
}

export type NodeConfigs<ProcessNodeConfig> = Configs | NodeConfig<ProcessNodeConfig>
export const NodeConfigs = {
    Configs,
    NodeConfig,
    new_system(system: System<any, any>) {
        const sets = system.default_system_sets()
    }
}


export type IntoSytemConfigs<M> = {
    into_configs(): any;
};
export type IntoSytemSetConfigs<M> = any;
export type SystemConfig = any;

export type SystemSet = any;

export class SystemSetConfig {
    node!: SystemNode;
    conditions: unknown[];
    graph_info!: GraphInfo;
    constructor(set: SystemSet) {
        this.conditions = []
    }
}