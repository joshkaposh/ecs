import { is_some, Option } from "joshkaposh-option";
import { Chain, ProcessNodeConfig, ScheduleGraph } from "./schedule";
import { Configs, NodeConfig, SystemSetConfig, SystemSetConfigs } from "./config";
import { NodeId } from "./graph";
import { define_type, TypeId } from "define";
import { $is_system, System } from "../system";

export const $is_system_set = Symbol('SYSTEM SET');

export type InternedSystemSet = SystemSet;

export interface SystemSet {
    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<InternedSystemSet>): NodeId;

    system_type(): Option<UUID>;

    is_anonymous(): boolean;

}

export class SystemTypeSet implements SystemSet {
    #phantom_data: { type_id(): UUID };
    constructor(phantom_data: { type_id(): UUID }) {
        this.#phantom_data = phantom_data;
    }

    [$is_system_set] = true;

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<SystemSet>): NodeId {
        const id = schedule_graph.configure_set_inner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    clone() {
        return new SystemTypeSet(this.#phantom_data);
    }

    is_anonymous(): boolean {
        return false;
    }

    system_type(): Option<UUID> {
        return this.#phantom_data.type_id();
    }

    [Symbol.toPrimitive]() {
        return `${this.#phantom_data}`;
    }
}

export class AnonymousSet implements SystemSet {
    #id: number;
    constructor(id: number) {
        this.#id = id;
    }

    [$is_system_set] = true;


    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<InternedSystemSet>): NodeId {
        return schedule_graph.configure_set_inner(config) as NodeId;
    }

    system_type(): Option<UUID> {
        return
    }

    is_anonymous() {
        return true
    }
}

export interface IntoSystemSet<M> {
    into_system_set(): SystemSet;
}

const SetRegistry = new Map() as Map<string, SystemSetConfigs>;

function get_hash_of_systems_inner(system_sets: any) {
    let h = '';
    if (system_sets[$is_system_set]) {
        h += `set${system_sets.into_configs().chained}:${system_sets.type_id()}`;
    } else if (system_sets[$is_system]) {
        h += system_sets.type_id();
    }
    return h;
}

function get_hash_of_systems(s: any) {
    let h = ''
    for (let i = 0; i < s.length; i++) {
        h += get_hash_of_systems_inner(s[i])
    }
    return h;
}

export function set<const S extends readonly (System<any, any> | SystemSet)[]>(...system_sets: S): SystemSet & SystemSetConfigs {

    const hash = get_hash_of_systems(system_sets);

    const set = SetRegistry.get(hash);
    if (set) {
        return set as any;
    }

    class SystemSetImpl implements SystemSet {
        #id: string;
        #sets: SystemSet[];
        constructor(sets: SystemSet[], id: string) {
            this.#sets = sets;
            this.#id = id;
        }

        [$is_system_set] = true;

        type_id() {
            return this.#id;
        }

        system_type(): Option<UUID> {
            return;
        }

        is_anonymous() {
            return false;
        }

        into_configs(): SystemSetConfigs {
            return new Configs(
                // @ts-expect-error
                this.#sets.map(s => s.into_configs()),
                [],
                Chain.Unchained
            )
        }

        process_config(schedule_graph: ScheduleGraph, config: NodeConfig<SystemSetImpl>) {
            const id = schedule_graph.configure_set_inner(config);
            if (!(id instanceof NodeId)) throw new Error(`Expected ${config} to be a NodeId`)
            return id
        }

        chain() {
            return this.into_configs().chain();
        }

        before(set: SystemSet) {
            return this.into_configs().before(set as any);
        }

        after(set: SystemSet) {
            return this.into_configs().after(set as any);
        }
    }

    define_type(SystemSetImpl);

    const system_set = new SystemSetImpl(system_sets as any, hash);

    SetRegistry.set(hash, system_set as any);
    return system_set as any;
}
