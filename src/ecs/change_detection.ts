import { is_some, Option } from "joshkaposh-option";
import { Component, Resource, Tick } from ".";
import { u32 } from "../Intrinsics";
import { DeepReadonly } from "../util";


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

export function $read_and_write<T>(type: T, ticks: TicksMut) {
    const mut = new Mut(type, ticks);
    const proxy = new Proxy(type as { [key: string | symbol]: any }, {
        get(target, p, receiver) {
            return read(target, p, receiver);
        },

        set(target, p, newValue, receiver) {
            mut.set_changed();
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
    abstract value: T
    abstract ticks: Ticks;

    deref() {
        return this.value;
    }

    is_added() {
        return this.ticks.added.is_newer_than(this.ticks.last_run, this.ticks.this_run)
    }

    is_changed() {
        return this.ticks.changed.is_newer_than(this.ticks.last_run, this.ticks.this_run)
    }

    last_changed() {
        return this.ticks.changed;
    }
}

export abstract class DetectChangesMut<T extends any> extends DetectChanges<T> {
    abstract value: T;
    abstract ticks: Ticks;
    deref() {
        return this.value
    }

    deref_mut() {
        this.set_changed();
        return this.value
    }

    into_inner() {
        this.set_changed();
        return this, this.value;
    }

    map_unchanged<U>(f: (value: T) => U): Mut<U> {
        return this.constructor(f(this.value), this.ticks);
    }

    filter_map_unchanged<U>(f: (value: T) => Option<U>) {
        const value = f(this.value);
        if (is_some(value)) {
            return this.constructor(value, this.ticks)
        }
    }

    set_changed() {
        const { changed, this_run } = this.ticks
        changed.set(this_run.get());
    }

    set_last_changed(last_changed: Tick) {
        this.ticks.changed.set(last_changed.get());
    }

    set_if_neq(value: T) {
        const old = this.bypass_change_detection();
        if (old !== value) {
            this.value = value;
            this.set_changed();
            return true;
        } else {
            return false
        }
    }

    replace_if_neq(value: T) {
        const old = this.bypass_change_detection();
        if (old !== value) {
            const prev = old;
            this.value = value;
            return prev;
        } {
            return
        }
    }

    bypass_change_detection() {
        return this.value;
    }
}

export class Ticks {
    constructor(
        public added: Tick,
        public changed: Tick,
        public last_run: Tick,
        public this_run: Tick
    ) { }

    clone() {
        return new Ticks(this.added.clone(), this.changed.clone(), this.last_run.clone(), this.this_run.clone())
    }

    static from(ticks: TicksMut): Ticks {
        return new Ticks(ticks.added, ticks.changed, ticks.last_run, ticks.this_run);
    }

    static from_tick_cells(cells: TickCells, last_run: Tick, this_run: Tick) {
        return new Ticks(cells.added, cells.changed, last_run, this_run);
    }

    static new(added: Tick, changed: Tick, last_run: Tick, this_run: Tick) {
        return new Ticks(added, changed, last_run, this_run)
    }

    static default() {
        return Ticks.new(new Tick(0), new Tick(0), new Tick(0), new Tick(0))
    }
}

export class TicksMut {
    constructor(public added: Tick, public changed: Tick, public last_run: Tick, public this_run: Tick) { }

    static new(added: Tick, changed: Tick, last_run: Tick, this_run: Tick) {
        return new TicksMut(added, changed, last_run, this_run)
    }

    static default() {
        return TicksMut.new(new Tick(0), new Tick(0), new Tick(0), new Tick(0))
    }

    static from_tick_cells(ticks: { added: Tick; changed: Tick }, last_run: Tick, this_run: Tick) {
        return new TicksMut(ticks.added, ticks.changed, last_run, this_run);
    }

    clone() {
        return new TicksMut(this.added.clone(), this.changed.clone(), this.last_run.clone(), this.this_run.clone())
    }
}

export class Ref<T> extends DetectChanges<T> {
    constructor(public value: T, public ticks: Ticks) {
        super();
    }
    static new<T>(value: T, added: Tick, last_changed: Tick, last_run: Tick, this_run: Tick): Ref<T> {
        return new Ref(value, new Ticks(added, last_changed, last_run, this_run))
    }
}

export class Mut<T> extends DetectChangesMut<T> {
    constructor(public value: T, public ticks: TicksMut) {
        super();
    }
    static new<T>(value: T, added: Tick, last_changed: Tick, last_run: Tick, this_run: Tick): Mut<T> {
        return new Mut(value, new TicksMut(added, last_changed, last_run, this_run))
    }
}

export class Res<T> extends DetectChanges<T> {
    value: T;
    ticks: Ticks;
    constructor(type: T, ticks: Ticks) {
        super()
        this.value = type;
        this.ticks = ticks;
    }

    static from<T extends Resource>(res: ResMut<T>): Res<T> {
        return new Res(res.value, res.ticks);
    }

    clone() {
        return new Res(this.value, this.ticks.clone())
    }
}

export class ResMut<T> extends DetectChangesMut<T> {
    value: T;
    ticks: TicksMut;
    constructor(type: T, ticks: TicksMut) {
        super();
        this.value = type;
        this.ticks = ticks;
    }

    clone() {
        return new Res(this.value, this.ticks.clone())
    }
}

