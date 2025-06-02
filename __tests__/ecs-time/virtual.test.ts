import { test, assert } from 'vitest'
import { Virtual } from 'ecs-time';

test('default', () => {
    const time = Virtual.default();
    assert(!time.isPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.maxDelta() === Virtual.DEFAULT_MAX_DELTA);
    assert(time.delta === 0);
    assert(time.elapsed === 0);
});

test('advance', () => {
    const time = Virtual.default();

    time.advanceWithRawDelta(125);
    assert(time.delta === 125);
    assert(time.elapsed === 125);

    time.advanceWithRawDelta(125);
    assert(time.delta === 125);
    assert(time.elapsed === 250);

    time.advanceWithRawDelta(125);
    assert(time.delta === 125);
    assert(time.elapsed === 375);

    time.advanceWithRawDelta(125);
    assert(time.delta === 125);
    assert(time.elapsed === 500);
});

test('relativeSpeed', () => {
    const time = Virtual.default();

    time.advanceWithRawDelta(250);

    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 1);
    assert(time.delta === 250);
    assert(time.elapsed === 250);

    time.setRelativeSpeed(2);

    assert(time.relativeSpeed() === 2);
    assert(time.effectiveSpeed() === 1);

    time.advanceWithRawDelta(250);
    assert(time.relativeSpeed() === 2);
    assert(time.effectiveSpeed() === 2);
    assert(time.delta === 500);
    assert(time.elapsed === 750);

    time.setRelativeSpeed(0.5);
    assert(time.relativeSpeed() === 0.5);
    assert(time.effectiveSpeed() === 2);

    time.advanceWithRawDelta(250);
    assert(time.relativeSpeed() === 0.5);
    assert(time.effectiveSpeed() === 0.5);
    assert(time.delta === 125);
    assert(time.elapsed === 875);
});

test('pause', () => {
    const time = Virtual.default();
    time.advanceWithRawDelta(250);

    assert(!time.isPaused());
    assert(!time.wasPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 1);
    assert(time.delta === 250);
    assert(time.elapsed === 250);

    time.pause();

    assert(time.isPaused());
    assert(!time.wasPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 1);

    time.advanceWithRawDelta(250);

    assert(time.isPaused());
    assert(time.wasPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 0);
    assert(time.delta === 0);
    assert(time.elapsed === 250);

    time.unpause();
    assert(!time.isPaused());
    assert(time.wasPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 0);

    time.advanceWithRawDelta(250);

    assert(!time.isPaused());
    assert(!time.wasPaused());
    assert(time.relativeSpeed() === 1);
    assert(time.effectiveSpeed() === 1);
    assert(time.delta === 250);
    assert(time.elapsed === 500);
});

test('max delta', () => {
    const time = Virtual.default();
    time.setMaxDelta(500);

    time.advanceWithRawDelta(250);
    assert(time.delta === 250);
    assert(time.elapsed === 250);

    time.advanceWithRawDelta(500);
    assert(time.delta === 500);
    assert(time.elapsed === 750);

    time.advanceWithRawDelta(750);
    assert(time.delta === 500);
    assert(time.elapsed === 1250);

    time.setMaxDelta(1000);
    assert(time.maxDelta() === 1000);

    time.advanceWithRawDelta(750);
    assert(time.delta === 750);
    assert(time.elapsed === 2000);

    time.advanceWithRawDelta(1250);
    assert(time.delta === 1000);
    assert(time.elapsed === 3000);
});