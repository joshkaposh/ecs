import { test, expect } from 'vitest';
import { World, Schedule, define_component, define_system } from '../../src/ecs'


// function a() {
//     console.log('first!');
// }

// function b() {
//     console.log('second!');
// }

const sA = define_system(function a() { console.log('first!') }, false)


// const sB = define_system(b, () => [] as [])

test('schedule', () => {
    const w = World.default();
    const s = new Schedule('Update');

    s.add_systems(sA)
    s.run(w)
})