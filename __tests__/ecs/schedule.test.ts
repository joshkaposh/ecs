import { test, expect, assert } from 'vitest';
import { World, Schedule, define_system, define_condition, set, Condition, Schedules } from 'ecs';
import { define_resource } from 'define';

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

function with_timestamps(world: World, num_systems: number, config: {
    log_running?: boolean;
    set_name?: boolean;
} = {}) {

    const Timestamps = define_resource(class Timestamps extends Map<any, number> { })
    const systems = Array.from({ length: num_systems }, (_, i) => {
        const system = define_system(b => b.res_mut(Timestamps), function (timestamps) {
            if (config.log_running) {
                console.log(`system_${i} running!`)
            }
            timestamps.set(this, performance.now())
        })

        if (config.set_name) {
            system.set_name(`system_${i}`)
        }

        return system
    })

    const timestamps = world.get_resource_or_init(Timestamps);

    return [timestamps, systems] as const;
}

const skip_basic_tests = true;
const skip_set_tests = true;
const skip_run_if_tests = true;
const skip_dependency_tests = true;

test.skipIf(skip_basic_tests)('add_one_with_parameters', () => {
    const w = new World();
    const s = new Schedule('Update');

    const system = define_system(b => b.local(0), (n) => {
        console.log('system_with_parameter running: ', n);
    }).set_name('system_with_parameter')


    s.add_systems(system);

    s.run(w);
})

test.skipIf(skip_set_tests)('add_systems_with_2_in_set', () => {
    const w = new World();
    const s = new Schedule('Update');

    const system_a = define_system(b => b, () => { console.log('running system a!') }).set_name('system_a');
    const system_b = define_system(b => b, () => { console.log('running system b!') }).set_name('system_b');
    const system_c = define_system(b => b, () => { console.log('running system c!') }).set_name('system_c');
    const system_d = define_system(b => b, () => { console.log('running system d!') }).set_name('system_d');

    s.add_systems(set(system_a, system_b));
    s.run(w);

})

test.skipIf(skip_dependency_tests)('before', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, [
        system_a,
        system_b,
        system_c,
        system_d
    ]] = with_timestamps(w, 4)

    s.add_systems(system_a);
    s.add_systems(system_b);
    s.add_systems(system_c.after(system_b));
    s.add_systems(system_d.before(system_c));

    s.run(w);

    assert(timestamps.get(system_d)! < timestamps.get(system_c)!);
    assert(timestamps.get(system_b)! < timestamps.get(system_c)!)
})


test.skipIf(skip_basic_tests)('add_one_system', () => {
    const one = define_system(b => b, () => { console.log('one running!') },
    ).set_name('one_system')

    const w = new World();
    const s = new Schedule('Update');
    s.add_systems(one);
    s.run(w);

})

test.skipIf(skip_set_tests)('add_one_system_in_set', () => {
    const one = define_system(b => b, () => {
        console.log('one running!')
    },
    ).set_name('one_system')

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(one));
    s.run(w);
})

test.skipIf(skip_set_tests)('add_two_systems_in_set', () => {
    const one = define_system(
        b => b,
        () => { console.log('one running!') },
    ).set_name('one_system')
    const two = define_system(
        b => b,
        () => { console.log('two running!') },
    ).set_name('two_system')

    const w = new World();
    const s = new Schedule('Update');

    s.add_systems(set(one, two));

    s.run(w);
})

test('add_two_systems_in_set_chained', () => {


    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, [one, two]] = with_timestamps(w, 2)

    s.add_systems(set(one, two).chain());

    s.run(w);

    assert(timestamps.get(one)! < timestamps.get(two)!)
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
    let system_ran = false;

    const ca = define_condition((b) => b, () => {
        console.log('condition_a running!');
        times_ran_a.count++;
        return a_bool
    },
    ).set_name('condition_a')


    const cb = define_condition((b) => b, () => {
        console.log('condition_b running!')
        times_ran_b.count++;
        return b_bool
    }
    ).set_name('condition_b');

    const system = define_system((b) => b, () => {
        system_ran = true;
        console.log('system running!')
    }

    ).set_name('my_system')

    // @ts-expect-error
    s.add_systems(system.run_if(ca[type](cb)));

    s.run(w);

    assert(times_ran_a.count === expected_times_ran_a);
    assert(times_ran_b.count === expected_times_ran_b);
    assert(system_ran === system_expected_to_run);
}

test.skipIf(skip_run_if_tests)('add_two_system_run_if', () => {
    const system = define_system(b => b, () => { console.log('system running!') }).set_name('my_system')
    const condition = define_condition(b => b, () => { console.log('condition running!'); return false }).set_name('my_condition')

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

// test('add_two_systems_with_dependency', () => {
//     const before = define_system((b) => b, () => { console.log('before running!') },
//     ).set_name('before_system');
//     const middle = define_system((b) => b,
//         () => { console.log('middle running!') },
//     ).set_name('middle_system');
//     const after = define_system((b) => b, () => { console.log('after running!') },
//     ).set_name('after_system');

//     const fourth = define_system((b) => b, () => { console.log('fourth running!') },
//     ).set_name('fourth_system');

//     const w = new World();
//     const s = new Schedule('Update');

//     s.add_systems(before)
//     s.add_systems(middle)
//     s.add_systems(after)


//     s.run(w);
// })
