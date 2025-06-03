import { iter } from 'joshkaposh-iterator';
import { clamp_unchecked } from 'joshkaposh-option/src/math';
import { debug_assert } from "ecs/src/util";
import { defineResource, defineSystemParam } from 'define';
import { Deferred, Res, SystemMeta, World } from 'ecs';
import { DEFAULT_MAX_HISTORY_LENGTH } from '.';
import { durationSince } from 'ecs-time';

export class DiagnosticPath {
    readonly path: string;
    readonly hash: number;
    constructor(path: string) {

        debug_assert(path.length !== 0, "diagnostic path can't be empty");
        debug_assert(!path.startsWith('/'), "diagnostic path can't start with `/`");
        debug_assert(!path.endsWith('/'), "diagnostic path cannot end with `/`");
        debug_assert(!path.includes('//'), 'diagnostic path cannot contain empty components');

        this.path = path;
        this.hash = 0;
    }

    static fromComponents(components: Iterable<string>) {
        let path = '';

        for (const [i, component] of iter(components).enumerate()) {
            if (i > 0) {
                path += '/';
            }

            path += component;
        }

        return new DiagnosticPath(path);
    }

    components() {
        return this.path.split('/');
    }

    [Symbol.toPrimitive]() {
        return this.path;
    }

    [Symbol.toStringTag]() {
        return this.path;
    }
}

export class DiagnosticMeasurement {
    /** when this measurement was taken */
    time: number;
    /** value of the measurement */
    value: number;

    constructor(time: number, value: number) {
        this.time = time;
        this.value = value;
    }
}

export class Diagnostic {
    #path: DiagnosticPath;
    suffix: string;
    // VeqDeque
    #history: DiagnosticMeasurement[]
    #sum: number;
    #ema: number;
    #ema_smoothing_factor: number;
    #max_history_length: number;
    /** Disabled [`Diagnostic`]s are not measured or logged. */
    is_enabled: boolean;

    constructor(path: any) {
        this.#path = path;
        this.suffix = '';
        this.#history = [];
        this.#sum = 0;
        this.#ema = 0;
        this.#max_history_length = DEFAULT_MAX_HISTORY_LENGTH;
        this.#ema_smoothing_factor = 2 / 21;
        this.is_enabled = true;
    }

    addMeasurement(measurement: DiagnosticMeasurement) {
        if (Number.isNaN(measurement.value)) {

        } else {
            const previous = this.measurement();
            if (previous != null) {
                const delta = (measurement.time - previous.time) * 1000;
                const alpha = clamp_unchecked(delta / this.#ema_smoothing_factor, 0, 1);
                this.#ema += alpha * (measurement.value - this.#ema);
            } else {
                this.#ema = measurement.value;
            }
        }

        if (this.#max_history_length > 1) {
            if (this.#history.length >= this.#max_history_length) {
                const removed_diagnostic = this.#history.shift();
                if (removed_diagnostic) {
                    if (!Number.isNaN(removed_diagnostic.value)) {
                        this.#sum -= removed_diagnostic.value;
                    }
                }
            }

            if (Number.isFinite(measurement.value)) {
                this.#sum += measurement.value;
            }
        } else {
            this.#history.length = 0;
            if (Number.isNaN(measurement.value)) {
                this.#sum = 0;
            } else {
                this.#sum = measurement.value;
            }
        }

        this.#history.push(measurement);
    }

    withSuffix(suffix: string) {
        this.suffix = suffix;
        return this;
    }

    /**
     * Sets the maximum history length
     */
    withMaxHistoryLength(max_history_length: number) {
        this.#max_history_length = max_history_length;
        return this;
    }

    /**
     * The smoothing factor used for the exponential smoothing used for [`Diagnostic.smoothed`].
     * 
     * If measurements come in less frequently than `smoothing factor` seconds apart, no smoothing will be applied.
     * As measurements come in more frequently, the smoothing takes a greater effect such that it takes approximately `smoothing_factor` seconds for 83% of an instantaneous
     * change in measurement to be reflected in the smoothed value.
     * 
     * A smoothing factor of 0 will effectively disable smoothing.
     */
    withSmoothingFactor(smoothing_factor: number) {
        this.#ema_smoothing_factor = smoothing_factor;
        return this;
    }

    path() {
        return this.#path;
    }

    measurement() {
        return this.#history[this.#history.length - 1];
    }

    value() {
        return this.measurement()?.value;
    }

    average() {
        return this.#history.length !== 0 ?
            this.#sum / this.#history.length :
            undefined;
    }

    smoothed() {
        return this.#history.length !== 0 ? this.#ema : undefined;
    }

    history_length() {
        return this.#history.length;
    }

    duration(): number | undefined {
        if (this.#history.length < 2) {
            return
        }

        const newest = this.#history[this.#history.length - 1];
        if (newest) {
            const oldest = this.#history[0];
            const dur = durationSince(newest.time, oldest.time);
            return typeof dur !== 'number' ? undefined : dur;
        }

        return;
    }

    max_history_length() {
        return this.#max_history_length;
    }

    values() {
        return iter(this.#history).map(m => m.value);
    }

    measurements() {
        return iter(this.#history);
    }

    clear_history() {
        this.#history.length = 0;
        this.#sum = 0;
        this.#ema = 0;
    }

}

export type DiagnosticStore = typeof DiagnosticStore;
export const DiagnosticStore = defineResource(class DiagnosticStore {
    #diagnostics: Map<DiagnosticPath, Diagnostic>;

    constructor() {
        this.#diagnostics = new Map();
    }

    add(diagnostic: Diagnostic) {
        this.#diagnostics.set(diagnostic.path(), diagnostic);
    }

    get(path: DiagnosticPath) {
        return this.#diagnostics.get(path);
    }

    getMeasurement(path: DiagnosticPath) {
        const diagnostic = this.#diagnostics.get(path);
        return diagnostic?.is_enabled ? diagnostic : undefined;
    }

    iter() {
        return iter(this.#diagnostics.values());
    }

    [Symbol.iterator]() {
        return this.iter();
    }
});

// export type Diagnostics = typeof Diagnostics;
export class Diagnostics {
    #store: Res<DiagnosticStore>;
    #queue: Deferred<DiagnosticsBuffer>;

    constructor(store: Res<DiagnosticStore>, queue: Deferred<DiagnosticsBuffer>) {
        this.#store = store;
        this.#queue = queue;
    }

    // static build(world: World) {
    //     return new Diagnostics(world.resource(DiagnosticStore), Deferred(DiagnosticsBuffer))
    // }

    addMeasurement(path: DiagnosticPath, value: () => number) {
        if (this.#store.v.get(path)?.is_enabled) {
            this.#queue.get().insert(path, new DiagnosticMeasurement(performance.now(), value()));
        }
    }
};

// export type DiagnosticsBuffer = typeof DiagnosticsBuffer;
// export const DiagnosticsBuffer = defineSystemBuffer(class DiagnosticsBuffer {
//     #inner: Map<DiagnosticPath, DiagnosticMeasurement>;

//     constructor(map: Map<DiagnosticPath, DiagnosticMeasurement>) {
//         this.#inner = map;
//     }

//     exec(_system_meta: SystemMeta, world: World) {
//         const diagnostics = world.resourceMut(DiagnosticStore);
//         for (const [path, measurement] of this.#inner) {
//             diagnostics.v.get(path)?.addMeasurement(measurement);
//         }
//         this.#inner.clear();
//     }
// });

export interface RegisterDiagnostic {
    registerDiagnostic(diagnostic: Diagnostic): this;
}

