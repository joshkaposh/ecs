import { test, expect } from 'vitest';
import { World, Schedule, define_component, define_system } from '../../src/ecs'


// function a() {
//     console.log('first!');
// }

// function b() {
//     console.log('second!');
// }

const sA = define_system(function sys_a() { console.log('system a running!') }, false)

const sB = define_system(function sys_b() { console.log('system b running!') }, false)

class Test { x = 5 }

test('schedule', () => {
    const w = World.default();
    const s = new Schedule('Update');

    // s.add_systems(sA);
    // s.run(w)
    // s.add_systems(sB);

    // s.run_disjoint(w)
    // s.run(w);
}, 5000)