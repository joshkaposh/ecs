import { type Option, u32 } from "joshkaposh-option";
import { type Component, type ComponentId, type Resource, type SystemMeta, type World, defineParam, is_newer_than, SystemParamValidationError, Tick } from 'ecs';
import type { DeepReadonly, Instance } from "./util";
import { assert } from "joshkaposh-iterator/src/util";

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

type TickCells = {
    added: Tick;
    changed: Tick;
}

export abstract class DetectChanges<T extends any> {
    abstract v: T
    abstract ticks: Ticks;

    deref() {
        return this.v;
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

export abstract class DetectChangesMut<T extends any> extends DetectChanges<T> {
    abstract v: T;
    abstract ticks: Ticks;

    deref() {
        return this.v as Instance<T>
    }

    derefMut() {
        this.setChanged();
        return this.v as Instance<T>
    }

    intoInner() {
        this.setChanged();
        return this, this.v;
    }

    mapUnchanged<U>(f: (value: T) => U): Mut<U> {
        return this.constructor(f(this.v), this.ticks);
    }

    filterMapUnchanged<U>(f: (value: T) => Option<U>) {
        const value = f(this.v);
        if (value != null) {
            return this.constructor(value, this.ticks)
        }
    }

    setChanged() {
        // const { changed, this_run } = this.ticks;
        // changed.set(this_run.get());
        this.ticks.changed = this.ticks.this_run;
    }

    setLastChanged(last_changed: Tick) {
        this.ticks.changed = last_changed;
    }

    setIfNeq(value: T) {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            this.v = value;
            this.setChanged();
            return true;
        } else {
            return false
        }
    }

    replaceIfNeq(value: T) {
        const old = this.bypassChangeDetection();
        if (old !== value) {
            const prev = old;
            this.v = value;
            return prev;
        } {
            return
        }
    }

    bypassChangeDetection(): Instance<T> {
        return this.v as Instance<T>;
    }
}

export class Ticks {
    added: Tick;
    changed: Tick;
    last_run: Tick;
    this_run: Tick;

    constructor(
        added: Tick = 0,
        changed: Tick = 0,
        last_run: Tick = 0,
        this_run: Tick = 0,
    ) {
        this.added = added;
        this.changed = changed;
        this.last_run = last_run;
        this.this_run = this_run;
    }

    clone() {
        return new Ticks(this.added, this.changed, this.last_run, this.this_run)
    }

    static from(ticks: TicksMut): Ticks {
        return new Ticks(ticks.added, ticks.changed, ticks.last_run, ticks.this_run);
    }

    static fromTickCells(cells: TickCells, last_run: Tick, this_run: Tick) {
        return new Ticks(cells.added, cells.changed, last_run, this_run);
    }
}

export class TicksMut {
    added: Tick;
    changed: Tick;
    last_run: Tick;
    this_run: Tick;

    constructor(
        added: Tick = 0,
        changed: Tick = 0,
        last_run: Tick = 0,
        this_run: Tick = 0
    ) {
        this.added = added;
        this.changed = changed;
        this.last_run = last_run;
        this.this_run = this_run;
    }

    static fromTickCells(ticks: { added: Tick; changed: Tick }, last_run: Tick, this_run: Tick) {
        return new TicksMut(ticks.added, ticks.changed, last_run, this_run);
    }

    clone() {
        return new TicksMut(this.added, this.changed, this.last_run, this.this_run)
    }
}

export class Ref<T> extends DetectChanges<T> {
    v: Instance<T>;
    ticks: Ticks;
    constructor(value: Instance<T>, ticks: Ticks) {
        super();
        this.v = value;
        this.ticks = ticks;
    }
}

export class Mut<T> extends DetectChangesMut<T> {
    #value: Instance<T>;
    ticks: TicksMut;
    constructor(value: Instance<T>, ticks: TicksMut) {
        super();
        this.#value = value;
        this.ticks = ticks;
    }

    get v() {
        this.setChanged();
        return this.#value;
    }

    hasChangedSince(tick: Tick) {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, tick, ticks.this_run);
    }
}

class Res<T> extends DetectChanges<T> {
    v: Instance<T>;
    ticks: Ticks;

    // static State: ComponentId;
    // static Item: Instance<Resource>

    constructor(type: Instance<T>, ticks: Ticks) {
        super()
        this.v = type;
        this.ticks = ticks;
    }

    static from<T extends Resource>(res: ResMut<Instance<T>>): Res<T> {
        return new Res(res.v, res.ticks);
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

        return new Res<T>(ptr as Instance<T>, new Ticks(ticks.added, ticks.changed, system_meta.last_run, change_tick))
    }

    hasChangedSince(tick: Tick) {
        const ticks = this.ticks;
        return is_newer_than(ticks.changed, tick, ticks.this_run);
    }

    clone() {
        return new Res(this.v, this.ticks.clone())
    }
}

(await (import('./system/system-param'))).defineParam(Res);

export { Res }

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
        return new Res(ptr, new Ticks(ticks.added, ticks.changed, system_meta.last_run, change_tick));
    },
};

(await (import('./system/system-param'))).defineParam(OptRes);

export { OptRes }

class ResMut<T> extends DetectChangesMut<T> {
    v: Instance<T>;
    ticks: TicksMut;
    constructor(type: Instance<T>, ticks: TicksMut) {
        super();
        this.v = type;
        this.ticks = ticks;
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

        return new ResMut(ptr as Instance<T>, new TicksMut(ticks.added, ticks.changed, system_meta.last_run, change_tick))
    }


    clone() {
        return new Res(this.v, this.ticks.clone())
    }
}

(await (import('./system/system-param'))).defineParam(ResMut);

export { ResMut }

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

        return new ResMut(v as Instance<T>, new TicksMut(ticks.added, ticks.changed, system_meta.last_run, change_tick))
    },
};

(await (import('./system/system-param'))).defineParam(OptResMut);

export { OptResMut }