import { test, assert } from 'vitest';
import { Fixed, secs } from 'ecs-time';

test('set timestep', () => {
    const time = Fixed.default();
    assert(time.timestep() === Fixed.DEFAULT_TIMESTEP);

    time.setTimestep(500);
    assert(time.timestep() === 500);


    time.setTimestepSeconds(0.25);
    assert(time.timestep() === 250);

    time.setTimestepHz(8.0);
    assert(time.timestep() === 125);
});

test('expend', () => {
    const time = Fixed.fromSeconds(2);

    assert(time.delta === 0);
    assert(time.elapsed === 0);

    time.accumulate(secs(1));

    assert(time.delta === 0);
    assert(time.elapsed === 0);
    assert(time.overstep() === secs(1));
    assert(time.overstepFraction() === 0.5);

    assert(!time.expend());

    assert(time.delta === 0);
    assert(time.elapsed === 0);
    assert(time.overstep() === secs(1));
    assert(time.overstepFraction() === 0.5);

    time.accumulate(secs(1));

    assert(time.delta === 0);
    assert(time.elapsed === 0);
    assert(time.overstep() === secs(2));
    assert(time.overstepFraction() === 1);

    assert(time.expend());

    assert(time.delta === secs(2));
    assert(time.elapsed === secs(2));
    assert(time.overstep() === 0);
    assert(time.overstepFraction() === 0.0);

    assert(!time.expend()); // false

    assert(time.delta === secs(2));
    assert(time.elapsed === secs(2));
    assert(time.overstep() === 0);
    assert(time.overstepFraction() === 0.0);

    time.accumulate(secs(1));

    assert(time.delta === secs(2));
    assert(time.elapsed === secs(2));
    assert(time.overstep() === secs(1));
    assert(time.overstepFraction() === 0.5);

    assert(!time.expend()); // false

    assert(time.delta === secs(2));
    assert(time.elapsed === secs(2));
    assert(time.overstep() === secs(1));
    assert(time.overstepFraction() === 0.5);
});

test('expend multiple', () => {
    const time = Fixed.fromSeconds(2);

    time.accumulate(secs(7));
    assert(time.overstep() === secs(7));

    assert(time.expend());
    assert(time.elapsed === secs(2));
    assert(time.overstep() === secs(5));

    assert(time.expend());
    assert(time.elapsed === secs(4));
    assert(time.overstep() === secs(3));

    assert(time.expend());
    assert(time.elapsed === secs(6));
    assert(time.overstep() === secs(1));

    assert(!time.expend());
    assert(time.elapsed === secs(6));
    assert(time.overstep() === secs(1));
});