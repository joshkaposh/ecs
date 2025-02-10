import { test, expect, assert } from 'vitest';
import { World, Schedule, define_system, define_condition, set, Condition, Schedules, Local } from 'ecs';
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

const TimesRan = define_resource(class TimesRan extends Map<any, number> { })
const Timestamps = define_resource(class Timestamps extends Map<any, number> { })

const skip_set_tests = false;
const skip_run_if_tests = false;
const skip_dependency_tests = false;

function with_timestamps(world: World, { num_systems, conditions, log_running, set_name }: {
    num_systems: number;
    conditions?: { return_type: boolean }[]
    log_running?: boolean;
    set_name?: boolean;
}) {

    set_name ??= true;

    const systems = Array.from({ length: num_systems }, (_, i) => {
        const system = define_system(b => b.res_mut(TimesRan), function (times) {
            if (log_running) {
                console.log(`system_${i} running!`)
            }
            times.set(this, performance.now())
        })

        if (set_name) {
            system.set_name(`system_${i}`)
        }

        return system
    })

    const condition_systems = (conditions ?? []).map(({ return_type }, i) => {
        const condition = define_condition(b => b.res_mut(TimesRan), function (times) {
            if (log_running) {
                console.log(`condition_${i} running!`)
            }
            times.set(this, performance.now())
            return return_type;
        })

        if (set_name) {
            condition.set_name(`condition_${i}`)
        }

        return condition
    })

    const timestamps = world.get_resource_or_init(TimesRan);

    return [timestamps, { systems, conditions: condition_systems }] as const;
}

function with_times_ran(world: World, { num_systems, conditions, log_running, set_name }: {
    num_systems: number;
    conditions?: { return_type: boolean }[]
    log_running?: boolean;
    set_name?: boolean;
}) {
    set_name ??= true;

    const systems = Array.from({ length: num_systems }, (_, i) => {
        const system = define_system(b => b.res_mut(TimesRan), function (times) {
            if (log_running) {
                console.log(`system_${i} running!`)
            }
            const amount = times.get(this) ?? 0;
            times.set(this, amount + 1);
        })

        if (set_name) {
            system.set_name(`system_${i}`)
        }

        return system
    })

    const condition_systems = (conditions ?? []).map(({ return_type }, i) => {
        const system = define_condition(b => b.res_mut(TimesRan), function (times) {
            if (log_running) {
                console.log(`condition_${i} running!`)
            }
            const amount = times.get(this) ?? 0;
            times.set(this, amount + 1);
            return return_type;
        })

        if (set_name) {
            system.set_name(`condition_${i}`)
        }

        return system

    })

    const timestamps = world.get_resource_or_init(TimesRan);

    return [timestamps, { systems, conditions: condition_systems }] as const;
}

function test_combine(
    type: keyof Condition<any, any>,
    a_bool: boolean,
    b_bool: boolean,
    expected_times_ran_a: number,
    expected_times_ran_b: number,
    system_expected_to_run: boolean,
    { log_running }: { log_running?: boolean } = {}
) {
    const s = new Schedule('Update');
    const w = new World();

    const condition_returns = [{ return_type: a_bool }, { return_type: b_bool }]

    const [times_ran, { systems, conditions }] = with_times_ran(w, {
        num_systems: 1,
        conditions: condition_returns,
        set_name: true,
        log_running
    })

    const system = systems[0];
    const [ca, cb] = conditions;

    // @ts-expect-error
    s.add_systems(system.run_if(ca[type](cb)));

    s.run(w);

    if (expected_times_ran_a === 0) {
        assert(times_ran.get(ca) === undefined);
    } else {
        assert(times_ran.get(ca) === expected_times_ran_a);
    }

    if (expected_times_ran_b === 0) {
        assert(times_ran.get(cb) === undefined);
    } else {
        assert(times_ran.get(cb) === expected_times_ran_b);
    }

    if (!system_expected_to_run) {
        assert(times_ran.get(system) === undefined);
    } else {
        assert(!!times_ran.get(system) === system_expected_to_run)
    }
}

function assert_order(timestamps: InstanceType<typeof Timestamps>, a: any, b: any) {
    assert(timestamps.get(a)! < timestamps.get(b)!)
}

test.skipIf(skip_dependency_tests)('before_and_after', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, {
        systems: [system_a, system_b, system_c, system_d]
    }] = with_timestamps(w, { num_systems: 4 })

    s.add_systems(system_a);
    s.add_systems(system_b);
    s.add_systems(system_c.after(system_b));
    s.add_systems(system_d.before(system_c));

    s.run(w);

    assert(timestamps.get(system_d)! < timestamps.get(system_c)!);
    assert(timestamps.get(system_b)! < timestamps.get(system_c)!)
})

test.skipIf(skip_set_tests)('add_two_systems_in_set_chained', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, { systems: [one, two] }] = with_timestamps(w, { num_systems: 2 })

    s.add_systems(set(one, two).chain());

    s.run(w);

    assert(timestamps.get(one)! < timestamps.get(two)!)
})


test.skipIf(skip_run_if_tests)('system_never_runs', () => {
    const w = new World();
    const s = new Schedule('Update');
    const [times_ran, { systems: [system], conditions: [condition] }] = with_times_ran(w, { num_systems: 1, conditions: [{ return_type: false }] })

    s.add_systems(system.run_if(condition));
    s.run(w);

    assert(times_ran.get(system) === undefined);

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

test('in-between_set', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, { systems: [first, middle, last] }] = with_timestamps(w, { num_systems: 3, log_running: false })

    s.add_systems(set(first, last).chain());
    s.add_systems(middle.before(last));

    s.run(w);

    assert_order(timestamps, first, last);
    assert_order(timestamps, middle, last);
})

test('system_add_in_set', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [timestamps, { systems: [a, b, c, d, e, f, g, h] }] = with_timestamps(w, { num_systems: 8, log_running: true })

    const my_set = set(a, b, c);

    s.add_systems(my_set.chain());
    s.add_systems(set(d, e, f).chain());

    s.add_systems(g.in_set(my_set).after(a));

    s.run(w);

    assert_order(timestamps, a, b);
    assert_order(timestamps, b, c);

})