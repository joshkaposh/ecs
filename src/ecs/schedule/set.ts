import { is_some, Option } from "joshkaposh-option";
import { ProcessNodeConfig, ScheduleGraph } from "./schedule";
import { NodeConfig } from "./config";
import { NodeId } from "./graph";
import { TypeId } from "../../define";

// export interface SystemSet extends ProcessNodeConfig {
//     system_type(): Option<UUID>;

//     is_anonymous(): boolean;
// };

export class SystemSet implements ProcessNodeConfig {
    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>): NodeId {
        return config.process_config(schedule_graph);
    }

    /**
     * Returns UUID if this system set is a SystemTypeSet
     */
    system_type(): Option<UUID> {
        return
    };

    is_anonymous() {
        return false;
    }
}

/// A [`SystemSet`] grouping instances of the same function.
///
/// This kind of set is automatically populated and thus has some special rules:
/// - You cannot manually add members.
/// - You cannot configure them.


/// - You cannot order something relative to one if it has more than one member.
export class SystemTypeSet<T> implements SystemSet {
    #phantom_data: TypeId;
    constructor(phantom_data: TypeId) {
        this.#phantom_data = phantom_data;
    }

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>): NodeId {
        return config.process_config(schedule_graph)
    }

    clone() {
        return this;
    }

    is_anonymous(): boolean {
        return false;
    }

    system_type(): Option<UUID> {
        return this.#phantom_data.type_id;
    }
}

export class AnonymousSet implements SystemSet {
    #id: number;
    constructor(id: number) {
        this.#id = id;
    }

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>): NodeId {
        return config.process_config(schedule_graph);
        // return new NodeId.Set(this.#id)
    }

    system_type(): Option<UUID> {
        return
    }

    is_anonymous() {
        return true
    }

}

export interface IntoSystemSet<M extends SystemSet> {
    into_system_set(): M;
}