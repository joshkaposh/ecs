import { u32, type Option } from 'joshkaposh-option'
import { MAX_CHANGE_AGE } from "./change_detection";

export { MAX_CHANGE_AGE }

export function relative_to(tick: number, other: number) {
    return u32.wrapping_sub(tick, other);
}

export function is_newer_than(tick: number, last_run: number, this_run: number) {
    const ticks_since_insert = Math.min(relative_to(this_run, tick), MAX_CHANGE_AGE);
    const ticks_since_system = Math.min(relative_to(this_run, last_run), MAX_CHANGE_AGE);

    return ticks_since_system > ticks_since_insert;
}

export function check_tick(self: number, tick: number) {
    return relative_to(tick, self) > MAX_CHANGE_AGE;
}

export function check_tick_and_assign(self: number, tick: number) {
    return check_tick(self, tick) ? relative_to(tick, Tick.MAX) : self;
}

export type Tick = number;
export const Tick = {
    get MAX() {
        return MAX_CHANGE_AGE;
    }
} as const;

export class ComponentTicks {
    added: Tick;
    changed: Tick;

    constructor(added: Tick, changed: Tick) {
        this.added = added;
        this.changed = changed;
    }

    static new(change_tick: Tick) {
        return new ComponentTicks(change_tick, change_tick)
    }

    static default() {
        return ComponentTicks.new(0);
    }

    is_added(last_run: Tick, this_run: Tick) {
        return is_newer_than(this.added, last_run, this_run);
    }

    is_changed(last_run: Tick, this_run: Tick) {
        return is_newer_than(this.changed, last_run, this_run);
    }

    set_changed(change_tick: Tick) {
        this.changed = change_tick;
    }
}
