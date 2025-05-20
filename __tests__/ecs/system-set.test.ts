import { expect, test } from 'vitest';
import { defineSystem, set } from 'define';

const emptySystem = defineSystem(() => { }, () => { });

test('empty intern', () => {
    const a = set();
    const b = set();

    expect(a.intern()).toEqual(b.intern());
})

test('intern with system', () => {
    const a = set(emptySystem);
    const b = set(emptySystem);

    expect(a.intern()).toEqual(b.intern());
})

test('systemtypeset intern', () => {
    const a = emptySystem;

    expect(a.intoSystemSet().intern()).toEqual(a.intoSystemSet().intern())
})