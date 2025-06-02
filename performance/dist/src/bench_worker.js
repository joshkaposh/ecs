import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";
const setup = await import(pathToFileURL(workerData.path)).then(module => module.default);
const fn = await setup(workerData.config);
let cycle_n = 1;
let cycle_ms = 0;
let cycle_total_ms = 0;
while (cycle_total_ms < 500) {
    const elapsed = bench_iter(fn, cycle_n);
    cycle_ms = elapsed / cycle_n;
    cycle_n *= 2;
    cycle_total_ms += elapsed;
}
const target_n = 500 / cycle_ms;
const total_ms = bench_iter(fn, target_n);
parentPort.postMessage({
    hz: (target_n / total_ms) * 1000, // ops/sec
    ms: total_ms / target_n // ms/op
});
function bench_iter(fn, count) {
    const start = performance.now();
    for (let i = 0; i < count; i++) {
        fn();
    }
    return performance.now() - start;
}
