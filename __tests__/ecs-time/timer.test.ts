import { test, assert } from 'vitest';
import { Timer, TimerMode } from 'ecs-time';
import { u32 } from 'joshkaposh-option';
test('non-repeating timer', () => {
    const t = new Timer(10 * 1000, TimerMode.Once);

    t.tick(0.25 * 1000);

    assert(t.elapsedSecs() === 0.25);
    assert(t.duration() === 10 * 1000);

    assert(!t.finished());
    assert(!t.justFinished());
    assert(t.timesFinishedThisTick() === 0);
    assert(t.mode() === TimerMode.Once);
    assert(t.fraction() === 0.025);
    assert(t.fractionRemaining() === 0.975);

    t.pause();
    t.tick(500 * 1000);

    assert(t.elapsedSecs() === 0.25);
    assert(t.duration() === 10 * 1000);
    assert(!t.finished());
    assert(!t.justFinished());
    assert(t.timesFinishedThisTick() === 0);
    assert(t.mode() === TimerMode.Once);
    assert(t.fraction() === 0.025);
    assert(t.fractionRemaining() === 0.975);

    // tick past the end and make sure elapsed doesn't go past 0,0 and other things update
    t.unpause();
    t.tick(500 * 1000);
    assert(t.elapsedSecs() === 10);
    assert(t.finished());
    assert(t.justFinished());
    assert(t.timesFinishedThisTick() === 1);
    assert(t.fraction() === 1);
    assert(t.fractionRemaining() === 0);

    // continuing to tick when finished should only change justFinished
    t.tick(1000);
    assert(t.elapsedSecs() === 10);
    assert(t.finished());
    assert(!t.justFinished());
    assert(t.timesFinishedThisTick() === 0);
    assert(t.fraction() === 1);
    assert(t.fractionRemaining() === 0);
});

test('repeating timer', () => {
    const t = new Timer(2000, TimerMode.Repeating);
    t.tick(0.75 * 1000);
    assert(t.elapsedSecs() === 0.75);
    assert(t.duration() === 2000);
    assert(!t.finished());
    assert(!t.justFinished());
    assert(t.timesFinishedThisTick() === 0);
    assert(t.mode() === TimerMode.Repeating);
    assert(t.fraction() === 0.375);
    assert(t.fractionRemaining() === 0.625);
    // tick past the end and make sure elapsed wraps
    t.tick(1.5 * 1000);
    assert(t.elapsedSecs() === 0.25);
    assert(t.finished());
    assert(t.justFinished());
    assert(t.timesFinishedThisTick() === 1);
    assert(t.fraction() === 0.125);
    assert(t.fractionRemaining() === 0.875);
    // continuing to tick should turn off both finished and justFinshed for repeating timers.
    t.tick(1000);
    assert(t.elapsedSecs() === 1.25);
    assert(!t.finished());
    assert(!t.justFinished());
    assert(t.timesFinishedThisTick() === 0);
    assert(t.fraction() === 0.625);
    assert(t.fractionRemaining() === 0.375);
});

test('times finished repeating', () => {
    const t = new Timer(1000, TimerMode.Repeating);
    assert(t.timesFinishedThisTick() === 0);
    t.tick(3.5 * 1000);
    assert(t.timesFinishedThisTick() === 3);
    assert(t.elapsedSecs() === 0.5);
    assert(t.finished());
    assert(t.justFinished());
    t.tick(200);
    assert(t.timesFinishedThisTick() === 0);
});

test('times finished this tick', () => {
    const t = new Timer(1000, TimerMode.Once);
    assert(t.timesFinishedThisTick() === 0);
    t.tick(1500);
    assert(t.timesFinishedThisTick() === 1);
    t.tick(500);
    assert(t.timesFinishedThisTick() === 0);
});

test('times finished this tick repeating zero duration', () => {
    const t = new Timer(0, TimerMode.Repeating);
    assert(t.timesFinishedThisTick() === 0);
    assert(t.elapsed() === 0);
    assert(t.fraction() === 1);
    t.tick(1000);
    assert(t.timesFinishedThisTick() === u32.MAX);
    assert(t.elapsed() === 0);
    assert(t.fraction() === 1);
    t.reset();
    assert(t.timesFinishedThisTick() === 0);
    assert(t.elapsed() === 0);
    assert(t.fraction() === 1);
});

test('times finished this tick precise', () => {
    const t = new Timer(0.01 * 1000, TimerMode.Repeating);
    const duration = 0.333 * 1000;
    t.tick(duration);
    assert(t.timesFinishedThisTick() === 33);
    t.tick(duration);
    assert(t.timesFinishedThisTick() === 33);
    t.tick(duration);
    assert(t.timesFinishedThisTick() === 33);
    t.tick(duration);
    assert(t.timesFinishedThisTick() === 34);
});

test('paused', () => {
    const t = new Timer(10 * 1000, TimerMode.Once);
    t.tick(10 * 1000);
    assert(t.justFinished());
    assert(t.finished());
    t.pause();
    t.tick(5 * 1000);
    assert(!t.justFinished());
    assert(t.finished());
});

test('paused repeating', () => {
    const t = new Timer(10 * 1000, TimerMode.Repeating);
    t.tick(10 * 1000);

    assert(t.justFinished());
    assert(t.finished());
    t.pause();
    t.tick(5 * 1000);
    assert(!t.justFinished());
    assert(!t.finished());
});
