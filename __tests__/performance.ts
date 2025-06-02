export function bench(count: number, setup: (count: number) => () => void) {
    const fn = setup(count);

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

    return {
        hz: (target_n / total_ms) * 1000, // ops/sec
        ms: total_ms / target_n // ms/op
    }
}

export function bench_second(count: number, setup: (count: number) => () => void) {
    const fn = setup(count);

    let cycle_n = 1, cycle_ms = 0, cycle_total_ms = 0;

    while (cycle_total_ms < 1000) {
        const elapsed = bench_iter(fn, cycle_n);
        cycle_ms = elapsed / cycle_n;
        cycle_n *= 2;
        cycle_total_ms += elapsed;
    }

    const target_n = 1000 / cycle_ms;
    const total_ms = bench_iter(fn, target_n);

    return {
        hz: total_ms * 1000, // ops/sec
        ms: cycle_total_ms / target_n // ms/op
    }
}

function bench_iter(fn: (count: number) => void, count: number) {
    const start = performance.now();
    for (let i = 1; i <= count; i++) {
        fn(i);
    }

    return performance.now() - start;
}