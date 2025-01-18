import { test, assert, expect } from "vitest";
import { define_system, Resource, World } from "../../src/ecs";
import { define_resource } from "../../src/define";

class _Counter { constructor(public count = 0) { } }
const Counter = _Counter as Resource
define_resource(Counter);

const count_up = define_system({
    system: function count_up(counter: InstanceType<typeof Counter>) {
        // console.log('count_up', counter);

        counter.count += 1;
    },
    params: (b) => b.res(Counter).params()
})

test('system', () => { })

test('run_system_once_with', () => {

    const Test = define_resource(class Test { constructor(public value: number = 0) { } });
    type Test = InstanceType<typeof Test>;
    const w = new World();
    w.init_resource(Test);

    const system_test = define_system({
        system: (t: Test) => {
            console.log('system_test running!', t.value);

        },
        params: (b) => b.res(Test).params()
    })

    const system = define_system({
        system: function system(input: number) {
            console.log('system running!', input);

            return input + 1;
        },
        params: () => [1]
    });

    let n = w.run_system_once_with(system, 1);
    console.log('n result', n);

    assert(n === 2);

    w.run_system_once(system_test)
})

// test('run_two_systems', () => {
//     const world = new World();
//     world.init_resource(Counter);
//     expect(world.resource(Counter)).toEqual(new Counter(0));
//     // * OLD
//     // world.resource_mut(Counter).count = 69;
//     // assert(world.resource(Counter).count === 69)
//     // world.run_system_once_with(count_up, Counter)
//     // * NEW
//     world.run_system_once_with(count_up, Counter);
//     // expect(world.resource(Counter)).toEqual(new Counter(1));
// })

// test('run_system_once', () => {
//     class Test { constructor(public value: number) { } }
//     define_resource(Test);

//     const w = new World();

//     const system = define_system({
//         system: function testme(t: Test) {
//             console.log('testme running', t);
//         },
//         params: [Test],
//     });

//     w.init_resource(Test as Resource);
//     w.run_system_once(system);
// })