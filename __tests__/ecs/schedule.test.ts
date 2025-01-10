import { test, expect } from 'vitest';
import { World, Schedule, define_system, set, Schedules } from '../../src/ecs'
import { define_component } from '../../src/define';


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

const sA = define_system({
    system: () => console.log('system_a running!')
}).set_name('system_a')

const sB = define_system({ system: () => console.log('system_b running!') })
    .set_name('system_b');


const sC = define_system({ system: () => console.log('system_c running!') })
    .set_name('system_c');


const sD = define_system({ system: () => console.log('system_d running!') })
    .set_name('system_d');


type NeverArray<T> = T extends readonly [] ? true : false;

const empty = [] as const;
type N = NeverArray<typeof empty>;

function a() { }
type Aparam = NeverArray<Parameters<typeof a>>;

class Test { x = 5 }

test('schedule_add_systems', () => {
    const w = new World();
    w.add_schedule(new Schedule('Update'));

    w.resource(Schedules).add_systems('Update', sA, sB, sC, sD)

    w.run_schedule('Update');
}, 5000);