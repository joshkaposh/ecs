import type { Option } from 'joshkaposh-option';
import { type Time, TimeImpl } from './time';

export interface Real extends Time {
    startup: number;
    first_update: Option<number>;
    last_update: Option<number>;
}

const Real = TimeImpl() as any;

Real.default = function defaultReal() {
    return new Real({
        startup: 16,
        first_update: null,
        last_update: null,
    })
}

Real.newWith = function newWith(startup: number) {
    return new Real({
        startup: startup,
        first_update: null,
        last_update: null,
    })
}

Real.prototype.update = function update() {
    const now = performance.now();
    this.updateWithInstant(now);
}

Real.prototype.updateWithDuration = function updateWithDuration(duration: number) {
    const ctx = this.context as Real;
    this.updateWithInstant((ctx.last_update ?? ctx.startup) + duration);
}

Real.prototype.updateWithInstant = function updateWithInstant(instant: number) {
    const ctx = this.context as Real;
    const last_update = ctx.last_update;
    if (!last_update) {
        ctx.first_update = instant;
        ctx.last_update = instant;
        return;
    }
    const delta = instant - last_update;
    this.advanceBy(delta);
    ctx.last_update = instant;
}

Real.prototype.startup = function startup() {
    return this.context.startup;
}

Real.prototype.first_update = function first_update() {
    return this.context.first_update;
}

Real.prototype.last_update = function last_update() {
    return this.context.last_update;
}



export { Real }

