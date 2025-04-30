import { Option } from "joshkaposh-option";
import { ThinWorld, World } from "../src";

function time(fn: () => void) {
    const then = performance.now();
    fn();
    return performance.now() - then
}

function log_times(tag: string, times: number[], amount: number, delta: number) {
    console.log(`${tag} - Total Time: ${(delta / 1000).toPrecision(3)} Seconds`);
    console.log(`${tag} - Operations/Sec: ${(1000 / (times.reduce((acc, x) => acc += x) / times.length)) * amount}`);
    console.log(`average: ${(times.reduce((acc, x) => acc += x) / times.length).toPrecision(3)}ms`);
    console.log(`fastest: ${times.reduce((acc, x) => acc < x ? acc : x)}ms`);
    console.log(`slowest: ${times.reduce((acc, x) => acc > x ? acc : x)}ms`);
}

class Config<W extends World | ThinWorld, T extends Option<{}> = undefined> {
    #world: W;
    #times: Map<string, number[]>;
    #amount: number;
    #before?: (world: W) => void;
    #context?: <T>(world: W) => T;

    constructor(type: W, amount: number) {
        this.#world = type;
        this.#times = new Map();
        this.#amount = amount;
    }

    setup(fn: (world: W) => void) {
        this.clear();
        fn(this.#world);
        return this;
    }

    clear() {
        this.#world.clear_all();
        return this;
    }

    before(fn: (world: W) => void) {
        this.#before = fn;
        return this;
    }

    with_context<Context extends {}>(context: (world: W) => Context): Config<W, Context> {
        // @ts-expect-error
        this.#context = context;
        return this;
    }

    time<Fn extends T extends {} ? (world: W, context: T) => void : (world: W) => void>(tag: string, fn: Fn) {
        const w = this.#world;
        let times: number[];
        if (this.#times.has(tag)) {
            times = this.#times.get(tag)!;
        } else {
            times = new Array(this.#amount).fill(0);
            this.#times.set(tag, times);
        }

        const len = this.#amount;
        const context = this.#context;
        let ctx;
        let cb;

        if (context) {
            ctx = context(w);
            cb = () => fn(w, ctx);
        } else {
            // @ts-expect-error
            cb = () => fn(w);
        }

        const delta = time(() => {
            for (let i = 0; i < len; i++) {
                this.#before?.call(null, w);
                times[i] = time(cb);
            }
        })

        log_times(tag, times, len, delta);

    }
}

export class Perf<T extends World | ThinWorld> {
    #world: T;
    #amount: number;
    constructor(type: T, amount: number) {
        this.#world = type;
        this.#amount = amount;
    }

    setup(fn: (world: T) => void) {
        return new Config(this.#world, this.#amount).setup((w) => {
            w.clear_all();
            fn(w);
        });
    }

    before(fn: (world: T) => void) {
        return new Config(this.#world, this.#amount).before(fn)
    }

    with_context<Context extends {}>(context: (world: T) => Context): Config<T, Context> {
        return new Config(this.#world, this.#amount).with_context(context)
    }

    time(tag: string, fn: (world: T) => void) {
        new Config(this.#world, this.#amount).time(tag, fn);
    }
}