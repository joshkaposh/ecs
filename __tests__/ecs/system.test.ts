import { test, assert, expect } from "vitest";
import { $is_system, ComponentMetadata, define_system, Local, ParamBuilder, Resource, StorageType, World } from "../../packages/ecs";
import { define_component, define_event, define_resource } from "define";

const Counter = define_resource(class Counter { constructor(public count = 0) { } });
const A = define_component(class A { constructor(public value = 'A') { } });
const B = define_component(class B { constructor(public value = 'B') { } });
const C = define_component(class C { constructor(public value = 'C') { } });

const MyEvent = define_event(class MyEvent { constructor(public value = 'event instance!') { } })

test('run_system_once', () => {
    const Test = define_resource(class Test { constructor(public value = 0) { } });

    const w = new World();

    const system = define_system((b) => b.res(Test), (t) => {
        console.log('running system with parameter', t);
        // expect(t.v).toEqual(new Test(0))
    });

    // w.init_resource(Test);
    // w.run_system_once(system);
})

test('run_system_once_with', () => {

    // const Test = define_resource(class Test { constructor(public value: number = 0) { } });
    // const w = new World();
    // w.init_resource(Test);

    // const system = define_system((b) => b.local(1),
    //     function system(input) {
    //         input.value += 1;
    //         return input.value;
    //     },
    // );

    // let n = w.run_system_once_with(system, new Local(1));

    // assert(n === 2);

})

// test('system with query', () => {
//     const w = new World();
//     const system = define_system((b) => b.query([A]), (q) => {
//         for (const [a] of q) {
//             console.log(a);

//         }
//     })

//     w.spawn(new A());
//     w.spawn(new A('with b'), new B())

//     w.run_system_once(system);
// })