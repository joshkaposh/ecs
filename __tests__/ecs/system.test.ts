import { test, assert, expect } from "vitest";
import { Local, World } from "ecs";
import { defineSystem, defineComponent, defineEvent, defineResource } from "define";

test('', () => { })

// const Counter = defineResource(class Counter { constructor(public count = 0) { } });
// const A = defineComponent(class A { constructor(public value = 'A') { } });
// const B = defineComponent(class B { constructor(public value = 'B') { } });
// const C = defineComponent(class C { constructor(public value = 'C') { } });

// const MyEvent = defineEvent(class MyEvent { constructor(public value = 'event instance!') { } })

// const MySystem = defineSystem(() => { }, () => { });

// test('run_system_once', () => {
//     const Test = defineResource(class Test { constructor(public value = 0) { } });

//     const w = new World();

//     w.incrementChangeTick();

//     const system = defineSystem((b) => b.res(Test), (t) => {
//         t.v.value += 1;
//         return t.v;
//     });

//     w.initResource(Test);
//     const times = 5;
//     for (let i = 1; i <= times; i++) {
//         expect(w.runSystemOnce(system)).toEqual(new Test(i));
//     }
// })

// test('run_system_once_with', () => {
//     const w = new World();

//     const system = defineSystem((b) => b.local(1),
//         function system(input) {
//             input.value += 1;
//             return input.value;
//         },
//     );

//     let n = w.runSystemOnceWith(system, new Local(1));

//     assert(n === 2);

// })

// test('system with query', () => {
//     const w = new World();
//     const system = defineSystem((b) => b.query([A]), (q) => {
//         for (const [a] of q) {
//             console.log(a);

//         }
//     })

//     w.spawn(new A());
//     w.spawn(new A('with b'), new B())

//     w.run_system_once(system);
// })