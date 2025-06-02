import { Stopwatch } from "./stopwatch";
import { u32 } from 'joshkaposh-option';

export type TimerMode = typeof TimerMode[keyof typeof TimerMode];
export const TimerMode = {
    Once: 0,
    Repeating: 1,
} as const;

export class Timer {
    #duration_ms: number;
    #mode: TimerMode;
    #stopwatch: Stopwatch;
    #finished: boolean;
    #times_finished_this_tick: number;

    constructor(duration_ms: number, mode: TimerMode) {
        this.#duration_ms = duration_ms;
        this.#mode = mode;
        this.#stopwatch = new Stopwatch();
        this.#finished = false;
        this.#times_finished_this_tick = 0;
    }

    finished() {
        return this.#finished;
    }

    justFinished() {
        return this.#times_finished_this_tick > 0;
    }

    elapsed() {
        return this.#stopwatch.elapsed;
    }

    elapsedSecs() {
        return this.#stopwatch.elapsed_secs;
    }

    setElapsed(elapsed: number) {
        this.#stopwatch.elapsed = elapsed;
    }

    /** Duration is in ms */
    duration() {
        return this.#duration_ms;
    }

    setDuration(duration_ms: number) {
        this.#duration_ms = duration_ms;
    }

    mode() {
        return this.#mode;
    }

    setMode(mode: TimerMode) {
        if (this.#mode !== TimerMode.Repeating && mode === TimerMode.Repeating && this.#finished) {
            this.#stopwatch.reset();
            this.#finished = this.justFinished();
        }
        this.#mode = mode;
    }

    tick(delta: number) {
        if (this.paused()) {
            this.#times_finished_this_tick = 0;
            if (this.#mode === TimerMode.Repeating) {
                this.#finished = false;
            }
            return this;
        }

        if (this.#mode !== TimerMode.Repeating && this.finished()) {
            this.#times_finished_this_tick = 0;
            return this;
        }

        this.#stopwatch.tick(delta);

        this.#finished = this.#stopwatch.elapsed >= this.#duration_ms;
        if (this.finished()) {
            if (this.#mode == TimerMode.Repeating) {
                const elapsed = this.#stopwatch.elapsed,
                    duration = this.#duration_ms;
                const div_ = Math.floor(elapsed / duration);
                const div = Number.isNaN(div_) || !Number.isFinite(div_) ? u32.MAX : div_;
                this.#times_finished_this_tick = div;

                const rem_ = elapsed % duration;
                const rem = Number.isNaN(rem_) ? 0 : rem_;
                this.#stopwatch.elapsed = rem;
            } else {
                this.#times_finished_this_tick = 1;
                this.#stopwatch.elapsed = this.#duration_ms;
            }
        } else {
            this.#times_finished_this_tick = 0;
        }

        return this;
    }

    pause() {
        this.#stopwatch.paused = true;
    }

    unpause() {
        this.#stopwatch.paused = false;
    }

    paused() {
        return this.#stopwatch.paused;
    }

    reset() {
        this.#stopwatch.reset();
        this.#finished = false;
        this.#times_finished_this_tick = 0;
    }

    /**
     * @returns the fraction of the timer elapsed time (goes from 0.0 to 1.0).
     */
    fraction() {
        if (this.#duration_ms === 0) {
            return 1
        } else {
            return this.#stopwatch.elapsed / this.#duration_ms;
        }
    }

    /**
     * @returns the fraction of the timer remaining time (goes from 1.0 to 0.0).
     */
    fractionRemaining() {
        return 1 - this.fraction();
    }

    /**
     * @returns the remaining time in seconds.
     */
    remaining_secs() {
        return this.remaining() * 1000;
    }

    /**
     * @returns the remaining time in milliseconds.
     */
    remaining() {
        return this.#duration_ms - this.#stopwatch.elapsed;
    }

    timesFinishedThisTick() {
        return this.#times_finished_this_tick;
    }
}