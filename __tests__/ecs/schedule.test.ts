import { test, expect } from 'vitest';
import { World, Schedule, define_component, define_system } from '../../src/ecs'


// function a() {
//     console.log('first!');
// }

// function b() {
//     console.log('second!');
// }

function testfn() { }

type IfNoArgs<F extends (...args: any[]) => any, T, K extends keyof T> = Parameters<F> extends readonly [] ?
    Omit<T, K> :
    T;

type True = IfNoArgs<() => any, { sys: 'a', params: never }, 'params'>;
type True1 = IfNoArgs<typeof testfn, { condition: 'b', params: never }, 'params'>;
type Args = IfNoArgs<(a: any) => any, { system: 'a1', params: [any] }, 'params'>

function sys_a() { console.log('sys_a running!') }
const sA = define_system({
    system: sys_a
})

function sys_b() {
    console.log('sys_b running!');
}

const sB = define_system({
    system: sys_b
})

type NeverArray<T> = T extends readonly [] ? true : false;

const empty = [] as const;
type N = NeverArray<typeof empty>;

function a() { }
type Aparam = NeverArray<Parameters<typeof a>>;

class Test { x = 5 }

test('schedule_add_one', () => {
    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(sA);
    s.run(w);
    s.add_systems(sB);
    s.run(w);
    // for (let i = 0; i < 10; i++) {
    //     s.run(w);
    // }

}, 5000)