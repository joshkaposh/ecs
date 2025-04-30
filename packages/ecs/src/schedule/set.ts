import { Option } from "joshkaposh-option";
import { Chain, ScheduleGraph } from "./schedule";
import { Configs, IntoScheduleConfig, Schedulable, ScheduleConfigs, SystemConfig } from "./config";
import { NodeId } from "./graph";
import { defineType, TypeId } from "define";
import { System } from "../system";
import { Condition } from "./condition";

export const $is_system_set = Symbol('SYSTEM SET');

export type InternedSystemSet = SystemSet;

export interface SystemSet {
    readonly systemType: Option<UUID>;
    readonly isAnonymous: boolean;

    processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId;

}

export class SystemTypeSet implements SystemSet {
    #phantom_data: TypeId;
    constructor(phantom_data: TypeId) {
        this.#phantom_data = phantom_data;

        this.systemType = phantom_data.type_id;
        this.isAnonymous = false;
    }

    [$is_system_set] = true;

    intoConfig(): Configs<Schedulable<SystemSet, Chain>> {
        throw new Error('configuring system type sets is not allowed')
    }

    processConfig(schedule_graph: ScheduleGraph, config: SystemConfig): NodeId {
        const id = schedule_graph.configureSetInner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    clone() {
        return new SystemTypeSet(this.#phantom_data);
    }

    readonly isAnonymous: boolean;
    readonly systemType: Option<UUID>;


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

    intoConfig() {
        return new Configs(
            this,
            [],
            [],
            Chain.Unchained
        )
    }

    processConfig(schedule_graph: ScheduleGraph, config: SystemConfig): NodeId {
        const id = schedule_graph.configureSetInner(config);
        if (!(id instanceof NodeId)) {
            throw id
        }
        return id;
    }

    get systemType(): Option<UUID> {
        return
    }

    get isAnonymous() {
        return true
    }
}

export interface IntoSystemSet<M> {
    intoSystemSet(): SystemSet;
}

const SetRegistry = new Map() as Map<string, ScheduleConfigs>;

function get_hash_of_systems_inner(system_sets: any) {
    return `${system_sets[$is_system_set] ? 'set:' : ''}` + system_sets.typeId;
}

function get_hash_of_systems(s: any) {
    let h = ''
    for (let i = 0; i < s.length; i++) {
        h += get_hash_of_systems_inner(s[i])
    }
    return h;
}

export function set<const S extends readonly (System<any, any> | SystemSet)[]>(...system_sets: S): SystemSet & IntoSystemSet<SystemSet> & ScheduleConfigs {
    const hash = get_hash_of_systems(system_sets);

    const set = SetRegistry.get(hash);
    if (set) {
        return set as SystemSet & IntoSystemSet<SystemSet> & ScheduleConfigs;
    }

    class SystemSetImpl implements SystemSet, IntoScheduleConfig<Schedulable<SystemSet, Chain>> {
        #id: string;
        #sets: SystemSet[];
        constructor(sets: SystemSet[], id: string) {
            this.#sets = sets;
            this.#id = id;
        }

        [$is_system_set] = true;

        get typeId() {
            return this.#id;
        }

        get systemType(): Option<UUID> {
            return;
        }

        get isAnonymous() {
            return false;
        }

        intoConfig() {
            return new Configs(
                this,
                // @ts-expect-error
                this.#sets.map(s => s.intoConfig()),
                [],
                Chain.Unchained
            )
        }

        intoSystemSet() {
            return this;
        }

        processConfig(schedule_graph: ScheduleGraph, config: SystemConfig) {
            const id = schedule_graph.configureSetInner(config);
            if (!(id instanceof NodeId)) throw new Error(`Expected ${config} to be a NodeId`)
            return id
        }

        chain() {
            return this.intoConfig().chain();
        }

        chainIgnoreDeferred(): ScheduleConfigs {
            return this.intoConfig().chainIgnoreDeferred();
        }

        before<M>(set: IntoSystemSet<M>) {
            return this.intoConfig().before(set);
        }

        beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
            return this.intoConfig().beforeIgnoreDeferred(set)
        }

        after<M>(set: IntoSystemSet<M>) {
            return this.intoConfig().after(set);
        }

        afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
            return this.intoConfig().afterIgnoreDeferred(set);
        }

        inSet(set: SystemSet) {
            return this.intoConfig().inSet(set);
        }

        runIf(condition: Condition<any>): ScheduleConfigs {
            return this.intoConfig().runIf(condition);
        }

        distributiveRunIf(condition: Condition<any>): ScheduleConfigs {
            return this.intoConfig().distributiveRunIf(condition);
        }

        ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs {
            return this.intoConfig().ambiguousWith(set);
        }

        ambiguousWithAll(): ScheduleConfigs {
            return this.intoConfig().ambiguousWithAll();
        }

    }

    defineType(SystemSetImpl);

    const system_set = new SystemSetImpl(system_sets as unknown as SystemSet[], hash) as unknown as SystemSet & ScheduleConfigs;
    SetRegistry.set(hash, system_set);
    return system_set as any;
}
