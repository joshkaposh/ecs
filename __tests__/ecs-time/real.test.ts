import { test, assert } from 'vitest';
import { Real, secs } from 'ecs-time';

async function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('update', async () => {
    const startup = performance.now();
    const time = Real.newWith(startup);


    assert(time.startup() === startup);
    assert(time.first_update() == null);
    assert(time.last_update() == null);
    assert(time.delta === 0);
    assert(time.elapsed === 0);

    time.update();

    assert(time.first_update() != null);
    assert(time.last_update() != null);
    assert(time.delta === 0);
    assert(time.elapsed === 0);

    time.update();
    const prev_elapsed = time.elapsed;

    assert(time.first_update() != null);
    assert(time.last_update() != null);
    assert(time.delta !== 0);
    assert(time.elapsed === time.delta);
});

test('update with instant', () => {
    const startup = performance.now();
    const time = Real.newWith(startup);

    const first_update = performance.now();
    time.updateWithInstant(first_update);

    assert(time.startup() === startup);
    assert(time.first_update() === first_update);
    assert(time.last_update() === first_update);
    assert(time.delta === 0);
    assert(time.elapsed === 0);

    const second_update = performance.now();
    time.updateWithInstant(second_update);

    assert(time.first_update() === first_update);
    assert(time.last_update() === second_update);
    assert(time.delta = second_update - first_update);
    assert(time.elapsed === second_update - first_update);

    const third_update = performance.now();
    time.updateWithInstant(third_update);

    assert(time.first_update() === first_update);
    assert(time.last_update() === third_update);
    assert(time.delta === third_update - second_update);
    assert(time.elapsed === third_update - first_update);
});

test('update with duration', () => {
    const startup = performance.now();
    const time = Real.newWith(startup);

    time.updateWithDuration(secs(1));

    assert(time.startup() === startup);
    assert(time.first_update() === startup + secs(1));
    assert(time.last_update() === startup + secs(1));
    assert(time.delta === 0);
    assert(time.elapsed === 0);

    time.updateWithDuration(secs(1));
    assert(time.first_update() === startup + secs(1));
    assert(time.last_update() === startup + secs(2));
    assert(time.delta = secs(1));
    assert(time.elapsed === secs(1));

    time.updateWithDuration(secs(1));

    assert(time.first_update() === startup + secs(1));
    assert(time.last_update() === startup + secs(3));
    assert(time.delta === secs(1), `${time.delta} !== ${secs(1)}`);
    assert(time.elapsed === secs(2));
});

