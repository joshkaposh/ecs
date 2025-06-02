import { assert } from 'joshkaposh-iterator/src/util';
import { Time, TimeImpl } from "./time";
import { Real } from './real';

/**
 * The virtual game clock representing game time.
 * 
 * A specialization of the [`Time`] structure.
 * 
 * Normally used as Time<Virtual>.
 * It is automatically inserted as a resource by [`TimePlugin`] and updated based on [Time<Real>]. The virtual clock is automatically set as the default generic [`Time`] resource for the update.
 * 
 * The virtual clock differs from real time clock in that in cab be paused, sped up and slowed down. It also limits how much it can advance in a single update in order to prevent unexpected behavior in cases where updates do not happen
 * at regular intervals (e.g. coming back after the program was suspended a long time).
 * 
 * The virtual clock can be paused by calling `.pause()` and unpaused by `.unpause()`. When the game clock is paused,
 * `Time.delta` will be zero on each update, and `Time.elapsed` will no grow.
 * 
 * `Time.effective_speed` will return `0.0`. Calling `.pause()` will not affect the `Time.delta` value for the update current being processed.
 * 
 * The speed of the virtual clock can be changed by calling `set_relative_speed`. A value of `2.0` means virtual clock will advance twice as fast as real time, meaning that `Time.delta` will be double of what Time<Real>.delta reports and `elapsed` will go twice as fast as `Time<Real>.elasped`.
 * Calling `set_relative_speed` will not affect the `Time.delta` value for the update currently being processed.
 * 
 * The maximum amount of delta time that can be added by a single update can be set by `set_max_delta()`. This value serves a dual purpose in the virtual clock.
 * 
 * If the game temporarily freezes due to any reason, such as disk access, a blocking system call, or operating system level suspend,
 * reporting the full elapsed delta time is likely to cause bugs in game logic. Usually if a laptop is suspended for an hour, it doesn't make sense to try to simulate the game logic for the elapsed hour when resuming.
 * Instead it is better to lose the extra time and pretend a shorter duration of time passed. Setting `max_delta` to a relatively short time means that the impact on game logic will be minimal.
 * 
 * If the game lags for some reason, meaning that it will take a longer time to compute a frame than the real time that passes during the computation, then we would fall behind in processing virtual time.
 * If this sitation persists, and computing a frame takes longer depending on how much virtual time has passed, the game would enter a "death spiral" where computing each frame takes longer and longer and the game will appear to freeze.
 * By limiting the maximum time that can be added at once, we also limit the amount of virtual maximum time that can be added at once, we also limit the amount of virtual time the game needs to compute for each frame.
 * This means that the game will run slow, and it will run slower than real time, but it will not freeze and it will recover and soon as the computation becomes fast again.
 * 
 * You should set `max_delta` to a value that in approximately the minimum FPS your game should have even if heavily lagged for a moment.
 * The actual FPS when lagged will be somewhat lower than this, depending on how much more time it takes to compute a frame compared to real time. You should also consider how stable your FPS is,
 * as the limit will also dictate how big of an FPS drop you can accept without losing time and falling behind real time.
 */
export interface Virtual extends Time {
    max_delta: number;
    paused: boolean;
    relative_speed: number;
    effective_speed: number;

    advanceWithRawDelta(raw_delta: number): void;
}

export const Virtual = TimeImpl() as any;

Virtual.DEFAULT_MAX_DELTA = 250; // 250 ms

Virtual.default = function defaultVirtaul(): Time<Virtual> {
    return new Virtual({
        max_delta: Virtual.DEFAULT_MAX_DELTA,
        paused: false,
        relative_speed: 1.0,
        effective_speed: 1.0
    });
}

Virtual.fromMaxDelta = function fromDelta(max_delta: number) {
    const time = Virtual.default();
    time.setMaxDelta(max_delta);
    return time;
}

Virtual.prototype.maxDelta = function maxDelta() {
    return this.context.max_delta;
}

Virtual.prototype.setMaxDelta = function setMaxDelta(max_delta: number) {
    assert(max_delta !== 0, 'tried to set max delta to zero');
    this.context.max_delta = max_delta;
}

/**
 * @returns the speed the clock advances relative to your system clock as a float.
 * This is known as "time scaling" or "time dilation" in other engines.
 */
Virtual.prototype.relativeSpeed = function relativeSpeed() {
    return this.context.relative_speed;
}

/**
 * Sets the speed the clock advances relative to your system clock.
 * `ratio` is a float.
 * 
 * For example, setting this to `2.0` will make the clock advance twice as fast as your clock.
 * 
 * @throws if `ratio` is negative or not finite.
 */
Virtual.prototype.setRelativeSpeed = function setRelativeSpeed(ratio: number) {
    assert(Number.isFinite(ratio), 'tried to go infinitely fast');
    assert(ratio >= 0, 'tried to go back in time');
    this.context.relative_speed = ratio;
}

/**
 * @returns the speed the clock advanded relative to your system clock in this update as a float.
 * Returns `0.0` if the game was paused or the `relativeSpeed` value was at the start of this update.
 */
Virtual.prototype.effectiveSpeed = function effectiveSpeed() {
    return this.context.effective_speed;
}

/**
 * Stops the clock, preventing it from advancing until resumed.
 */
Virtual.prototype.pause = function pause() {
    this.context.paused = true;
}

/**
 * Resumes the clock if paused.
 */
Virtual.prototype.unpause = function unpause() {
    this.context.paused = false;
}

Virtual.prototype.isPaused = function isPaused() {
    return this.context.paused;
}

/**
 * @returns `true` if the clock was paused at the start of this update. 
 */
Virtual.prototype.wasPaused = function wasPaused() {
    return this.context.effective_speed === 0;
}

/**
 * Updates the elapsed duration of `self` by `raw_delta` up to the `max_delta`.
 */
Virtual.prototype.advanceWithRawDelta = function advanceWithRawDelta(raw_delta: number) {
    const ctx = this.context;
    const max_delta = ctx.max_delta;
    let clamped_delta;
    if (raw_delta > max_delta) {
        console.warn(`delta time larger than maximum delta, clamping delta to ${max_delta} and skipping ${raw_delta - max_delta}`);
        clamped_delta = max_delta;
    } else {
        clamped_delta = raw_delta;
    }

    const effective_speed = ctx.paused ? 0 : ctx.relative_speed;

    const delta = effective_speed !== 1 ?
        clamped_delta * effective_speed :
        // avoid rounding when at normal speed
        clamped_delta;

    ctx.effective_speed = effective_speed;
    this.advanceBy(delta);
}

/**
 * Advances [`Time<Virtual>`] and [`Time`] based on the elapsed [`Time<Real>`].
 */
export function update_virtual_time(current: Time, virt: Virtual, real: Real) {
    const raw_delta = real.delta;
    virt.advanceWithRawDelta(raw_delta);
    current.cloneFrom(virt);
};

