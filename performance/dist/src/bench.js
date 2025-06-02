import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Worker } from 'node:worker_threads';
const BENCHMARKS = {
    packed_5: 1_000,
    simple_iter: 1_000,
    frag_iter: 100,
    entity_cycle: 1_000,
    add_remove: 1_000
};
const LIBRARIES = [
    { kind: 'soa', name: 'jsecs' }
];
const libraries = LIBRARIES;
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS = [];
for (const lib of libraries) {
    const results = [];
    RESULTS.push(results);
    console.log(lib.name);
    for (const kind in BENCHMARKS) {
        const log = `  ${kind} ${' '.repeat(14 - kind.length)}`;
        const path = resolve(CURRENT_DIR, `./cases/${kind}.js`);
        if (!existsSync(path)) {
            results.push('TODO');
            console.log(`${log} TODO`);
            continue;
        }
        try {
            const config = BENCHMARKS[kind];
            const result = await run_bench(path, config);
            results.push(result);
            console.log(`${log} ${Math.floor(result.hz).toLocaleString()}`);
        }
        catch (error) {
            if (error instanceof Error) {
                results.push('code' in error ? error.code : "ERROR");
                // console.log(`${log} ${'code' in error ? error.code : "ERROR"}`);
            }
            else {
                results.push('ERROR');
                console.log(`${log} ERROR`);
                // console.log(error);
            }
        }
        console.log();
    }
}
console.log('| op/s |' + Object.keys(BENCHMARKS).join(' | ') + ' |');
console.log('| ---- | ' + '--: |'.repeat(Object.keys(BENCHMARKS).length));
for (let i = 0; i < libraries.length; i++) {
    console.log(`| ${libraries[i].name} |` +
        RESULTS[i].map(result => 'hz' in result ? Math.floor(result.hz).toLocaleString() : result).join(' | ') + ' |');
}
function run_bench(path, config) {
    const worker_file = resolve(CURRENT_DIR, 'bench_worker.js');
    return new Promise((resolve, reject) => {
        const worker = new Worker(worker_file, {
            workerData: {
                path,
                config
            }
        });
        worker.on('message', resolve);
        worker.on('error', reject);
    });
}
