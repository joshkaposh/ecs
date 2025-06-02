export class Stopwatch {
    elapsed: number;
    paused: boolean;

    constructor(elapsed = 0, paused = false) {
        this.elapsed = elapsed;
        this.paused = paused;
    }

    get elapsed_secs() {
        return this.elapsed / 1000;
    }

    /**
     * Advance the stopwatch by `delta`.
     * If the stopwatch is paused, it will do nothing.
     */
    tick(delta: number) {
        if (!this.paused) {
            this.elapsed += delta;
        }
        return this;
    }

    /**
     * Resets the stopwatch. Resetting does not change the paused state of the stopwatch.
     */
    reset() {
        this.elapsed = 0;
    }


}