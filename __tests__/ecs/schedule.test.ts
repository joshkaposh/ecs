import { test, expect, assert } from 'vitest';
import { World, Schedule, define_system, define_condition, set, Condition, Schedules } from 'ecs';

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

type NeverArray<T> = T extends readonly [] ? true : false;

const empty = [] as const;
type N = NeverArray<typeof empty>;

function a() { }
type Aparam = NeverArray<Parameters<typeof a>>;

const skip_run_if_tests = true;
const skip_basic_tests = true;

// test('set_intern', () => {
//     const sA = define_system(() => console.log('system_a running!'), () => [],
//     ).set_name('system_a')

//     const sB = define_system(() => console.log('system_b running!'), () => [],
//     ).set_name('system_b')

//     const sC = define_system(() => console.log('system_c running!'), () => [],
//     ).set_name('system_c')

//     const sD = define_system(() => console.log('system_d running!'), () => [],
//     ).set_name('system_d')

//     const set1 = set(sA);
//     const set2 = set(sA);

//     const set3 = set(set(sA, sB));
//     const set4 = set(set(sA, sB));

//     const set5 = set(set(set(sC)));
//     const set6 = set(set(set(sD)));

//     // const set7 = set(set(sA, sB).chain())
//     // const set8 = set(set(sA, sB).chain())

//     assert(set1 === set2);
//     assert(set3 === set4);
//     assert(set5 !== set6);
//     // assert(set7 === set8);
//     // assert(set3 !== set7);
// })

test.skipIf(skip_basic_tests)('add_one_system', () => {
    const one = define_system(
        () => { },
        () => { console.log('one running!') },
    ).set_name('one_system')

    const w = new World();
    const s = new Schedule('Update');
    s.add_systems(one);
    s.run(w);

})

test.skipIf(skip_basic_tests)('add_one_system_in_set', () => {
    const one = define_system(
        () => { },
        () => { console.log('one running!') },
    ).set_name('one_system')

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(one));
    s.run(w);
})

test.skipIf(skip_basic_tests)('add_two_systems_in_set', () => {
    const one = define_system(
        () => { },
        () => { console.log('one running!') },
    ).set_name('one_system')
    const two = define_system(
        () => { },
        () => { console.log('two running!') },
    ).set_name('two_system')

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(one, two));

    s.run(w);
})


test.skipIf(skip_basic_tests)('add_two_systems_in_set_chained', () => {
    const one = define_system(() => { console.log('one running!') }, () => []).set_name('one');
    const two = define_system(() => { console.log('two running!') }, () => []).set_name('two');

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(one, two).chain());

    s.run(w);
})

function test_combine(
    type: keyof Condition<any, any>,
    a_bool: boolean,
    b_bool: boolean,
    expected_times_ran_a: number,
    expected_times_ran_b: number,
    system_expected_to_run: boolean,
) {
    const s = new Schedule('Update');
    const w = new World();

    const times_ran_a = { count: 0 };
    const times_ran_b = { count: 0 };
    const times_ran_system = { ran: false };

    const ca = define_condition(() => {
        console.log('condition_a running!');
        times_ran_a.count++;
        return a_bool
    },
        () => [],
    ).set_name('condition_a')


    const cb = define_condition(() => {
        console.log('condition_b running!')
        times_ran_b.count++;
        return b_bool
    },
        () => [],
    ).set_name('condition_b');

    const system = define_system(() => {
        times_ran_system.ran = true;
        console.log('system running!')
    },
        () => []
    ).set_name('my_system')


    s.add_systems(system.run_if(ca[type](cb)));

    s.run(w);

    assert(times_ran_a.count === expected_times_ran_a);
    assert(times_ran_b.count === expected_times_ran_b);
    assert(times_ran_system.ran === system_expected_to_run);
}

test.skipIf(skip_run_if_tests)('add_two_system_run_if', () => {
    const system = define_system(() => { console.log('system running!') }, () => []).set_name('my_system')
    const condition = define_condition(() => { console.log('condition running!'); return false }, () => []).set_name('my_condition')

    const w = new World();
    const s = new Schedule('Update');

    // @ts-expect-error
    s.add_systems(system.run_if(condition).chain());
    s.run(w);
})

test.skipIf(skip_run_if_tests)('run_if_combine', () => {
    test_combine('and', true, true, 1, 1, true);
    test_combine('and', true, false, 1, 1, false);
    // short-curcuits because first condition is not met
    test_combine('and', false, false, 1, 0, false);
    // short-curcuits because first condition is not met
    test_combine('and', false, true, 1, 0, false);

    // short-curcuits because first condition is not met
    test_combine('nand', true, true, 1, 0, false);
    // short-curcuits because first condition is not met
    test_combine('nand', true, false, 1, 0, false);
    test_combine('nand', false, true, 1, 1, true);
    test_combine('nand', false, false, 1, 1, false);

    // short-curcuits because first condition is met
    test_combine('or', true, true, 1, 0, true);
    // short-curcuits because first condition is met
    test_combine('or', true, false, 1, 0, true);
    test_combine('or', false, true, 1, 1, true);
    test_combine('or', false, false, 1, 1, false);

    test_combine('nor', true, true, 1, 1, true);
    test_combine('nor', true, false, 1, 1, false);
    // short-curcuits because first condition is not met
    test_combine('nor', false, true, 1, 0, true);
    // short-curcuits because first condition is not met
    test_combine('nor', false, false, 1, 0, true);

    test_combine('xor', true, true, 1, 1, false);
    test_combine('xor', true, false, 1, 1, true);
    test_combine('xor', false, true, 1, 1, true);
    test_combine('xor', false, false, 1, 1, false);

    test_combine('xnor', true, true, 1, 1, true);
    test_combine('xnor', true, false, 1, 1, false);
    test_combine('xnor', false, true, 1, 1, false);
    test_combine('xnor', false, false, 1, 1, true);
})

test('add_two_systems_with_dependency', () => {
    const before = define_system(
        () => { },
        () => { console.log('before running!') },
    ).set_name('before_system');
    const middle = define_system(
        () => { },
        () => { console.log('middle running!') },
    ).set_name('middle_system');
    const after = define_system(
        () => { },
        () => { console.log('after running!') },
    ).set_name('after_system');

    const fourth = define_system(
        () => { },
        () => { console.log('fourth running!') },
    ).set_name('fourth_system');

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(before, after).chain());
    s.add_systems(middle.before(after));
    s.add_systems(fourth.before(middle));
    s.run(w);
})
