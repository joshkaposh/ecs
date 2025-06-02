import { assert } from 'joshkaposh-iterator/src/util'
import { defineSystem } from "define";
import { $FixedMain } from "ecs-app";
import { TimeImpl, Time } from "./time";
import { Virtual } from "./virtual";

/**
 * The fixed timestep game clock following virtual time.
 * A specialization of the [`Time`] structure.
 * 
 * 
 * It is automatically inserted as a resource by
 * [`TimePlugin`](crate::TimePlugin) and updated based on
 * [`Time<Virtual>`](Virtual). The fixed clock is automatically set as the
 * generic [`Time`] resource during [`FixedUpdate`](bevy_app::FixedUpdate)
 * schedule processing.
 *
 * The fixed timestep clock advances in fixed-size increments, which is
 * extremely useful for writing logic (like physics) that should have
 * consistent behavior, regardless of framerate.
 *
 * The default [`timestep()`](Time::timestep) is 64 hertz, or 15625
 * microseconds. This value was chosen because using 60 hertz has the potential
 * for a pathological interaction with the monitor refresh rate where the game
 * alternates between running two fixed timesteps and zero fixed timesteps per
 * frame (for example when running two fixed timesteps takes longer than a
 * frame). Additionally, the value is a power of two which losslessly converts
 * into [`f32`] and [`f64`].
 *
 * To run a system on a fixed timestep, add it to one of the [`FixedMain`]
 * schedules, most commonly [`FixedUpdate`](bevy_app::FixedUpdate).
 *
 * This schedule is run a number of times between
 * [`PreUpdate`](bevy_app::PreUpdate) and [`Update`](bevy_app::Update)
 * according to the accumulated [`overstep()`](Time::overstep) time divided by
 * the [`timestep()`](Time::timestep). This means the schedule may run 0, 1 or
 * more times during a single update (which typically corresponds to a rendered
 * frame).
 *
 * `Time<Fixed>` and the generic [`Time`] resource will report a
 * [`delta()`](Time::delta) equal to [`timestep()`](Time::timestep) and always
 * grow [`elapsed()`](Time::elapsed) by one [`timestep()`](Time::timestep) per
 * iteration.
 *
 * The fixed timestep clock follows the [`Time<Virtual>`](Virtual) clock, which
 * means it is affected by [`pause()`](Time::pause),
 * [`set_relative_speed()`](Time::set_relative_speed) and
 * [`set_max_delta()`](Time::set_max_delta) from virtual time. If the virtual
 * clock is paused, the [`FixedUpdate`](bevy_app::FixedUpdate) schedule will
 * not run. It is guaranteed that the [`elapsed()`](Time::elapsed) time in
 * `Time<Fixed>` is always between the previous `elapsed()` and the current
 * `elapsed()` value in `Time<Virtual>`, so the values are compatible.
 *
 * Changing the timestep size while the game is running should not normally be
 * done, as having a regular interval is the point of this schedule, but it may
 * be necessary for effects like "bullet-time" if the normal granularity of the
 * fixed timestep is too big for the slowed down time. In this case,
 * [`set_timestep()`](Time::set_timestep) and be called to set a new value. The
 * new value will be used immediately for the next run of the
 * [`FixedUpdate`](bevy_app::FixedUpdate) schedule, meaning that it will affect
 * the [`delta()`](Time::delta) value for the very next
 * [`FixedUpdate`](bevy_app::FixedUpdate), even if it is still during the same
 * frame. Any [`overstep()`](Time::overstep) present in the accumulator will be
 * processed according to the new [`timestep()`](Time::timestep) value.
 */
export interface Fixed {
    timestep: number;
    overstep: number;
}


const Fixed = TimeImpl() as any;

Fixed.DEFAULT_TIMESTEP = 0.15625; //Corresponds to 64 Hz.

Fixed.default = function defaultFixed(): Time<Fixed> {
    return new Fixed({
        timestep: Fixed.DEFAULT_TIMESTEP,
        overstep: 0
    });
}
/**
 * Instantiates a new Time<Fixed>
 * @returns a new fixed time clock with given timestep.
 * @throws if `timestep` is zero.
 */
Fixed.fromDuration = function fromDuration(duration: number) {
    const ret = Fixed.default();
    ret.setTimestep(duration);
    return ret;
}

Fixed.fromSeconds = function fromSeconds(seconds: number) {
    const ret = Fixed.default();
    ret.setTimestepSeconds(seconds);
    return ret;
}

Fixed.fromHz = function fromHz(hz: number) {
    const ret = Fixed.default();
    ret.setTimestepHz(hz);
    return ret;
}

Fixed.prototype.timestep = function setTimestep() {
    return this.context.timestep;
}

Fixed.prototype.setTimestep = function setTimestep(timestep: number) {
    assert(timestep !== 0, 'attempted to set fixed timestep to zero');
    this.context.timestep = timestep;
}

Fixed.prototype.setTimestepSeconds = function setTimestepSeconds(seconds: number) {
    assert(Math.abs(seconds) === seconds, 'seconds less than or equal to zero');
    assert(Number.isFinite(seconds), 'seconds is infinite');
    this.setTimestep(seconds * 1000);
}

Fixed.prototype.setTimestepHz = function setTimestepHz(hz: number) {
    assert(Math.abs(hz) === hz, 'hz less than or equal to zero');
    assert(Number.isFinite(hz), 'hz is infinite');
    this.setTimestep((1 / hz) * 1000);
}

Fixed.prototype.overstep = function overstep() {
    return this.context.overstep;
}

Fixed.prototype.discardOverstep = function discardOverstep(discard: number) {
    this.context.overstep -= discard;
}

Fixed.prototype.overstepFraction = function overstepFraction() {
    return this.context.overstep / this.context.timestep;
}

Fixed.prototype.accumulate = function accumulate(delta: number) {
    this.context.overstep += delta;
}

Fixed.prototype.expend = function expend() {
    const ctx = this.context;
    const timestep = ctx.timestep;
    const sub = ctx.overstep - timestep;
    if (sub >= 0) {
        // reduce accumulated and increase elapsed by period
        ctx.overstep = sub;
        this.advanceBy(timestep);
        return true;
    } else {
        // no more period left in accumulated
        return false;
    }

}


export const run_fixed_main_schedule = defineSystem(b => b.world(), function run_fixed_main_schedule(world) {
    const delta = world.resource(Virtual).delta;
    world.resourceMut(Fixed).v.accumulate(delta);

    world.tryScheduleScope($FixedMain, (world, sched) => {
        world.resourceMut(Virtual).v.context = world.resource(Fixed).asGeneric();
        sched.run(world);
        return sched;
    });

    world.resourceMut(Time).v.cloneFrom(world.resource(Virtual).asGeneric());
});

export { Fixed };