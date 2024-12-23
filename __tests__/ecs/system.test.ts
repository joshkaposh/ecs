import { test, assert, expect } from "vitest";
import { define_resource, define_system, Resource, World } from "../../src/ecs";

class _Counter { constructor(public count = 0) { } }
const Counter = _Counter as Resource
define_resource(Counter);

const count_up = define_system(function count_up(counter: InstanceType<typeof Counter>) {
    // console.log('count_up', counter);

    counter.count += 1;
}, false, Counter)

test('run_system_once_with', () => {

    class Test { constructor(public value: number) { } }
    define_resource(Test);

    const w = World.default();

    const system = define_system(function system(input: number) {
        // console.log('system running!', input);
        return input + 1;
    }, false, 1);

    let n = w.run_system_once_with(system, 1);
    // assert(n === 2);
})

test('run_two_systems', () => {
    const world = World.new();
    world.init_resource(Counter);
    expect(world.resource(Counter)).toEqual(new Counter(0));
    // * OLD
    // world.resource_mut(Counter).count = 69;
    // assert(world.resource(Counter).count === 69)
    // world.run_system_once_with(count_up, Counter)
    // * NEW
    world.run_system_once_with(count_up, Counter);
    // expect(world.resource(Counter)).toEqual(new Counter(1));
})

test('run_system_once', () => {
    class Test { constructor(public value: number) { } }
    define_resource(Test);

    const w = World.default();

    const system = define_system(function system(input: Test) {
        // console.log('system running!', input);
    }, false, Test as any);

    w.init_resource(Test as Resource);
    w.run_system_once(system);
})