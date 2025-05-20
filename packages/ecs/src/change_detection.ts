import { type Option, u32 } from "joshkaposh-option";
import type { Component, ComponentId, Resource, Tick } from './component';
import { is_newer_than } from './component';
import type { DeepReadonly, Instance } from "./util";
import { assert } from "joshkaposh-iterator/src/util";
import { type SystemMeta, SystemParamValidationError, defineParam } from "./system";
import type { World } from "./world";

export const CHECK_TICK_THRESHOLD = 518_400_000;

export const MAX_CHANGE_AGE = u32.MAX - (2 * CHECK_TICK_THRESHOLD - 1);

function read(target: Record<string | symbol, any>, p: string | symbol, receiver: any): any {
    const value = target[p];
    if (value instanceof Function) {
        return function (this: any, ...args: any[]) {
            return value.apply(this === receiver ? target : this, args)
        }
    }

    return value;
}

// @ts-ignore
export function $readonly<T extends Component>(ty: T, ticks?: Ticks): DeepReadonly<InstanceType<T>> {
    return new Proxy(ty as { [key: string | symbol]: any }, {
        get(target, p, receiver) {
            return read(target, p, receiver);
        },
        set(_target, _p, _newValue, _receiver) {
            return false;
        },

    }) as DeepReadonly<InstanceType<T>>
}

export function $read_and_write<T>(type: Instance<T>, ticks: TicksMut) {
    const mut = new Mut(type, ticks);
    const proxy = new Proxy(type as { [key: string | symbol]: any }, {
        get(target, p, receiver) {
            return read(target, p, receiver);
        },

        set(target, p, newValue, receiver) {
            mut.setChanged();
            Reflect.set(target, p, newValue, receiver)
            return true
        },
    })
    return proxy as T;
}

interface TickCells {
    added: Tick;
    changed: Tick;
}

interface TickCellsDetectChanges extends TickCells {
    last_run: Tick;
    this_run: Tick;
}

export interface DetectChanges<T extends any> {
    v: Instance<T>;
    ticks: TickCellsDetectChanges;

    isAdded(): boolean;
    isChanged(): boolean;
    lastChanged(): number;
}

export interface DetectChangesMut<T extends any> extends DetectChanges<T> {
    ticks: TickCellsDetectChanges;

    setChanged(): void;

    bypassChangeDetection(): Instance<T>;

    mapUnchanged<U>(f: (value: Instance<T>) => Instance<U>): any;

    filterMapUnchanged<U>(f: (value: Instance<T>) => Option<Instance<U>>): void

    setIfNeq(value: T): void;

    replaceIfNeq(value: T): void;
}

export class Ticks {
    #ticks: TickCells
    last_run: Tick;
    this_run: Tick;

    constructor(
        ticks: TickCells,
        last_run: Tick,
        this_run: Tick,
    ) {
        this.#ticks = ticks;
        this.last_run = last_run;
        this.this_run = this_run;

    }

    get added() {
        return this.#ticks.added;
    }

    get changed() {
        return this.#ticks.changed;
    }

    clone() {
        return new Ticks(this.#ticks, this.last_run, this.this_run)
    }

}

export class TicksMut {
    #ticks: {
        added: Tick,
        changed: Tick
    }
    last_run: Tick;
    this_run: Tick;

    constructor(
        ticks: {
            added: Tick,
            changed: Tick
        },
        last_run: Tick,
        this_run: Tick
    ) {
        this.#ticks = ticks;
        this.last_run = last_run;
        this.this_run = this_run;
    }

    get added() {
        return this.#ticks.added;
    }

    get changed() {
        return this.#ticks.changed;
    }

    set changed(changed) {
        this.#ticks.changed = changed;
    }

    clone() {
        return new TicksMut(this.#ticks, this.last_run, this.this_run)
    }
}

export class Ref<T> implements DetectChanges<T> {
    #inner: Instance<T>;
    ticks: Ticks;
    constructor(value: Instance<T>, ticks: Ticks) {
        this.#inner = value;
        this.ticks = ticks;
    }

    get v() {
        return this.#inner;
    }

    isAdded() {
        const ticks = this.ticks;
        return is_newer_than(ticks.added, ticks.last_run, ticks.this_run);
    }

    isChanged() {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, ticks.last_run, ticks.this_run);
    }

    lastChanged() {
        return this.ticks.changed;
    }

}

export class Mut<T> implements DetectChangesMut<T> {
    #value: Instance<T>;
    ticks: TicksMut;
    constructor(value: Instance<T>, ticks: TicksMut) {
        this.#value = value;
        this.ticks = ticks;
    }

    set last_changed(changed: Tick) {
        this.ticks.changed = changed;
    }

    set v(value) {
        this.#value = value;
    }

    get v() {
        this.setChanged();
        return this.#value;
    }

    setChanged(): void {
        this.ticks.changed = this.ticks.this_run;
    }

    isAdded() {
        const ticks = this.ticks;
        return is_newer_than(ticks.added, ticks.last_run, ticks.this_run);
    }

    isChanged() {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, ticks.last_run, ticks.this_run);
    }

    lastChanged(): number {
        return this.ticks.changed;
    }

    hasChangedSince(tick: Tick) {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, tick, ticks.this_run);
    }

    bypassChangeDetection(): Instance<T> {
        return this.#value;
    }

    filterMapUnchanged<U>(f: (value: Instance<T>) => Option<Instance<U>>) {
        const value = f(this.v);
        if (value != null) {
            return new Mut(value as any, this.ticks)
        }

        return;
    }

    mapUnchanged<U>(f: (value: Instance<T>) => Instance<U>): Mut<U> {
        return new Mut(f(this.#value), this.ticks) as Mut<U>;
    }

    setIfNeq(value: Instance<T>): boolean {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            this.#value = value;
            this.setChanged();
            return true;
        } else {
            return false
        }
    }

    replaceIfNeq(value: Instance<T>): Option<Instance<T>> {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            const prev = old;
            this.#value = value;
            return prev;
        } {
            return
        }
    }
}

class Res<T> implements DetectChanges<T> {
    v: Instance<T>;
    ticks: Ticks;

    constructor(type: Instance<T>, ticks: Ticks) {
        this.v = type;
        this.ticks = ticks;
    }

    isAdded() {
        const ticks = this.ticks;
        return is_newer_than(ticks.added, ticks.last_run, ticks.this_run);
    }

    isChanged() {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, ticks.last_run, ticks.this_run);
    }

    lastChanged(): number {
        return this.ticks.changed;
    }

    hasChangedSince(tick: Tick) {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, tick, ticks.this_run);
    }

    clone() {
        return new Res(this.v, this.ticks.clone())
    }

    static init_state<T extends Resource>(world: World, system_meta: SystemMeta, resource: T) {
        const component_id = world.components.registerResource(resource);
        const archetype_component_id = world.__initializeResourceInternal(component_id).id;

        const combined_access = system_meta.__component_access_set.combined_access();

        assert(!combined_access.has_resource_write(component_id), `Res<${resource.name}> in system ${system_meta.name} conflicts with a previous ResMut<${resource.name}> access. Consider removing the duplicate access.`)

        system_meta.__component_access_set.__add_unfiltered_resource_read(component_id);

        system_meta.__archetype_component_access.add_resource_read(archetype_component_id);
        return component_id;
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        if (world.storages.resources.get(component_id)?.isPresent) {
            return
        } else {
            return SystemParamValidationError.invalid('Res', 'Resource does not exist')
        }
    }

    static get_param<T>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        const tuple = world.getResourceWithTicks(component_id);
        if (!tuple) {
            throw new Error(`Resource requested by ${system_meta.name} does not exist`);
        }

        const [ptr, ticks] = tuple;

        return new Res<T>(ptr as Instance<T>, new Ticks(ticks, system_meta.last_run, change_tick))
    }
}

defineParam(Res);

const OptRes = {
    init_state<T extends Resource>(world: World, system_meta: SystemMeta, type: T) {
        return Res.init_state(world, system_meta, type)
    },

    get_param<T extends Resource>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick) {
        const tuple = world.getResourceWithTicks<T>(component_id);
        if (!tuple) {
            return
        }

        const [ptr, ticks] = tuple;
        return new Res(ptr, new Ticks(ticks, system_meta.last_run, change_tick));
    },
};

defineParam(OptRes);

class ResMut<T> implements DetectChangesMut<T> {
    #inner: Instance<T>;
    ticks: TicksMut;
    constructor(type: Instance<T>, ticks: TicksMut) {
        this.#inner = type;
        this.ticks = ticks;
    }

    get v() {
        this.ticks.changed = this.ticks.this_run;
        return this.#inner;
    }

    set last_changed(changed: Tick) {
        this.ticks.changed = changed;
    }

    clone() {
        return new ResMut(this.v, this.ticks.clone())
    }

    setChanged() {
        this.ticks.changed = this.ticks.this_run;
    }

    isAdded() {
        const ticks = this.ticks;
        return is_newer_than(ticks.added, ticks.last_run, ticks.this_run);
    }

    isChanged() {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, ticks.last_run, ticks.this_run);
    }

    lastChanged(): number {
        return this.ticks.changed;
    }

    setIfNeq(value: Instance<T>): boolean {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            this.#inner = value;
            this.setChanged();
            return true;
        } else {
            return false
        }
    }

    replaceIfNeq(value: Instance<T>): Option<Instance<T>> {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            const prev = old;
            this.#inner = value;
            return prev;
        } {
            return
        }
    }

    mapUnchanged<U>(f: (value: Instance<T>) => Instance<U>): ResMut<U> {
        return new ResMut(f(this.#inner), this.ticks) as ResMut<U>;
    }

    filterMapUnchanged<U>(f: (value: Instance<T>) => Option<Instance<U>>): Option<ResMut<U>> {
        const value = f(this.v);
        if (value != null) {
            return new ResMut(value as Instance<U>, this.ticks)
        }
        return
    }

    bypassChangeDetection(): Instance<T> {
        return this.v
    }

    static init_state(world: World, system_meta: SystemMeta, resource: Resource) {
        const component_id = world.components.registerResource(resource);

        const archetype_component_id = world.__initializeResourceInternal(component_id).id;

        const combined_access = system_meta.__component_access_set.combined_access();

        assert(!combined_access.has_resource_read(component_id), `Res<${resource.name}> in system ${system_meta.name} conflicts with a previous ResMut<${resource.name}> access. Consider removing the duplicate access.`)

        system_meta.__component_access_set.__add_unfiltered_resource_write(component_id);
        system_meta.__archetype_component_access.add_resource_write(archetype_component_id);

        return component_id;
    }

    static validate_param(component_id: ComponentId, _system_meta: SystemMeta, world: World) {
        if (world.storages.resources.get(component_id)?.isPresent) {
            return
        }

        return SystemParamValidationError.invalid('ResMut', 'Resource does not exist');
    }

    static get_param<T>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick): ResMut<T> {
        const tuple = world.getResourceWithTicks(component_id);
        if (!tuple) {
            throw new Error(`Resource requested by ${system_meta.name} does not exist`);
        }

        const [ptr, ticks] = tuple;

        return new ResMut(ptr as Instance<T>, new TicksMut(ticks, system_meta.last_run, change_tick))
    }
}

defineParam(ResMut);

const OptResMut = {
    init_state(world: World, system_meta: SystemMeta, resource: Resource) {
        return ResMut.init_state(world, system_meta, resource);
    },

    get_param<T>(component_id: ComponentId, system_meta: SystemMeta, world: World, change_tick: Tick): ResMut<T> {
        const mut = world.getResourceMutById(component_id);
        if (!mut) {
            throw new Error(`Resource requested by ${system_meta.name} does not exist`);
        }

        const { v, ticks } = mut;

        return new ResMut(v as Instance<T>, new TicksMut(ticks, system_meta.last_run, change_tick))
    },
};

defineParam(OptResMut);

export {
    Res,
    OptRes,
    ResMut,
    OptResMut,
}