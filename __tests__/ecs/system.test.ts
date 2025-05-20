import { test, assert, expect } from "vitest";
import { Local, World } from "ecs";
import { defineResource, defineSystem } from "define";

test('run_system_once', () => {
    const Test = defineResource(class Test { constructor(public value = 0) { } });

    const w = new World();

    w.incrementChangeTick();

    const system = defineSystem((b) => b.res(Test), (t) => {
        t.v.value += 1;
        return t.v;
    });

    w.initResource(Test);
    const times = 5;
    for (let i = 1; i <= times; i++) {
        expect(w.runSystemOnce(system)).toEqual(new Test(i));
    }
})

test('run_system_once_with', () => {
    const w = new World();

    const system = defineSystem((b) => b.local(1),
        function system(input) {
            input.value += 1;
            return input.value;
        },
    );

    let n = w.runSystemOnceWith(system, new Local(1));

    assert(n === 2);

})