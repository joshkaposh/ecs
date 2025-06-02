import { assert } from 'joshkaposh-iterator/src/util';
import { defineResource } from 'define';
import { Virtual } from './virtual';

export function secs(seconds: number) {
    return seconds * 1000;
}

export interface Time<T extends any = any> {
    context: T;
    wrap_period: number;
    delta: number;
    delta_secs: number;
    elapsed: number;
    elapsed_secs: number;
    elapsed_wrapped: number;
    elapsed_secs_wrapped: number;

    /**
     * Advance this clock by adding a `delta` duration to it.
     *
     * The added duration will be returned by [`Time.delta`] and
     * [`Time.elapsed`] will be increased by the duration. Adding
     * 0 is allowed and will set [`Time.delta`] to zero.
     */
    advanceBy(delta: number): void;


    /**
     * Advance this clock to a specific `elapsed` time.
     *
     * [`Self::delta()`] will return the amount of time the clock was advanced
     * and [`Self::elapsed()`] will be the `elapsed` value passed in. Cannot be
     * used to move time backwards.
     *
     * @throws **Throws** if `elapsed` is less than `Time:elapsed`.
     */
    advanceTo(delta: number): void;

    setWrapPeriod(wrap_period: number): void;

    asGeneric(): Time<null>;

    cloneFrom<T2>(time: Time<T2>): Time<T2>;
}

export function TimeImpl() {
    return defineResource(class GenericTime<T extends any = Virtual> implements Time<T> {
        static readonly DEFAULT_WRAP_PERIOD = 3600;

        context: T;
        wrap_period: number;
        delta: number;
        delta_secs: number;
        elapsed: number;
        elapsed_secs: number;
        elapsed_wrapped: number;
        elapsed_secs_wrapped: number;

        constructor(
            context: T = null as T,
            wrap_period = GenericTime.DEFAULT_WRAP_PERIOD,
            delta = 0,
            delta_secs = 0,
            elapsed = 0,
            elapsed_secs = 0,
            elapsed_wrapped = 0,
            elapsed_secs_wrapped = 0
        ) {
            this.context = context;
            this.wrap_period = wrap_period;
            this.delta = delta;
            this.delta_secs = delta_secs;
            this.elapsed = elapsed;
            this.elapsed_secs = elapsed_secs;
            this.elapsed_wrapped = elapsed_wrapped;
            this.elapsed_secs_wrapped = elapsed_secs_wrapped;
        }

        advanceBy(delta: number) {
            this.delta = delta;
            this.delta_secs = delta * 1000;
            this.elapsed += delta;
            this.elapsed_secs = this.elapsed * 1000;
            this.elapsed_wrapped = duration_rem(this.elapsed, this.wrap_period);
            this.elapsed_secs_wrapped = this.elapsed_wrapped * 1000;
        }

        advanceTo(elapsed: number) {
            assert(elapsed >= this.elapsed, 'tried to move time backwards to an earlier elapsed moment.');
            this.advanceBy(elapsed - this.elapsed);
        }

        setWrapPeriod(wrap_period: number) {
            assert(wrap_period !== 0, 'division by zero');
            this.wrap_period = wrap_period;
        }

        asGeneric(): GenericTime<null> {
            return new GenericTime(
                null,
                this.wrap_period,
                this.delta,
                this.delta_secs,
                this.elapsed,
                this.elapsed_secs,
                this.elapsed_wrapped,
                this.elapsed_secs_wrapped
            )
        }

        cloneFrom<T2>(time: Time<T2>): Time<T2> {
            this.context = time.context as unknown as T;
            this.wrap_period = time.wrap_period;
            this.delta = time.delta;
            this.delta_secs = time.delta_secs;
            this.elapsed = time.elapsed;
            this.elapsed_secs = time.elapsed_secs;
            this.elapsed_wrapped = time.elapsed_wrapped;
            this.elapsed_secs_wrapped = time.elapsed_secs_wrapped;
            return this as unknown as Time<T2>;
        }
    })
}

export const Time = TimeImpl();

function duration_rem(dividend: number, divisor: number) {
    const quotient = Math.floor(dividend / divisor);
    return dividend - (quotient * divisor);
}