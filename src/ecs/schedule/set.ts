import { Option } from "joshkaposh-option";
import { ProcessNodeConfig, ScheduleGraph } from "./schedule";
import { NodeConfig } from "./config";
import { NodeId } from "./graph";

export interface SystemSet extends ProcessNodeConfig {
    system_type(): Option<UUID>;

    is_anonymous(): boolean;
};


/// A [`SystemSet`] grouping instances of the same function.
///
/// This kind of set is automatically populated and thus has some special rules:
/// - You cannot manually add members.
/// - You cannot configure them.


/// - You cannot order something relative to one if it has more than one member.
export class SystemTypeSet<T> implements SystemSet {
    #phantom_data: any;
    constructor(phantom_data: any) {
        this.#phantom_data = phantom_data;
    }
    clone() {
        return this;
    }

    is_anonymous(): boolean {
        return false;
    }

    system_type(): Option<UUID> {
        return
    }
}

export class AnonymousSet implements SystemSet {
    // #id: number;
    constructor(id?: number) {
        // this.#id = id;
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

