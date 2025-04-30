import { test, expect, assert } from 'vitest';
import { World, ThinWorld, Schedule, Condition, set, ApplyDeferred } from 'ecs';
import { defineResource, defineSystem, defineCondition, defineComponent } from 'define';
import BTree from 'sorted-btree';
import { NodeId } from 'ecs/src/schedule/graph';

// type IfNoArgs<F extends (...args: any[]) => any, T, K extends keyof T> = Parameters<F> extends readonly [] ?
//     Omit<T, K> :
//     T;

// type True = IfNoArgs<() => any, { sys: 'a', params: never }, 'params'>;
// type True1 = IfNoArgs<typeof testfn, { condition: 'b', params: never }, 'params'>;
// type Args = IfNoArgs<(a: any) => any, { system: 'a1', params: [any] }, 'params'>

// type NeverArray<T> = T extends readonly [] ? true : false;

// const empty = [] as const;
// type N = NeverArray<typeof empty>;

// function a() { }
// type Aparam = NeverArray<Parameters<typeof a>>;

const TimesRan = defineResource(class TimesRan extends Map<any, number> { })
const Timestamps = defineResource(class Timestamps extends Map<any, number> { })

const skip_set_tests = false;
const skip_run_if_tests = false;
const skip_dependency_tests = false;
const skip_hierarchy_tests = false;

const abc = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] as const;

function n_systems(n: number, log_running = false, descriptive_names = true) {
    const min = Math.min(abc.length, n);
    return Array.from({ length: min }, (_, i) => {
        const name = descriptive_names ? abc[i] : `${i}`;
        const system = defineSystem(b => b, function () {
            if (log_running) {
                console.log(`system ${name} running!`)
            }
        })

        system.setName(name);

        return system
    })
}

function n_conditions(log_running = false, descriptive_names = true, ...return_types: boolean[]) {
    return_types.length = Math.min(return_types.length, abc.length);
    return return_types.map((b, i) => defineCondition(() => { }, function () {
        if (log_running) {
            console.log(this.name);
        }

        return b;
    }).setName(descriptive_names ? abc[i] : String(i)));
}

function with_timestamps(world: World | ThinWorld, { num_systems, conditions, log_running, set_name }: {
    num_systems: number;
    conditions?: { return_type: boolean }[]
    log_running?: boolean;
    set_name?: boolean;
}) {

    set_name ??= true;

    const times_ran = new TimesRan();
    function temp_defineSystem(fn: (...args: any[]) => any) {
        return () => fn(times_ran);
    }
    const systems = Array.from({ length: num_systems }, (_, i) => {
        const system = defineSystem(b => b, temp_defineSystem(function (times) {
            if (log_running) {
                console.log(`system_${i} running!`)
            }
            times.v.set(this, performance.now())
        }))

        if (set_name) {
            system.setName(`system_${i}`)
        }

        return system
    })

    const condition_systems = (conditions ?? []).map(({ return_type }, i) => {
        const condition = defineCondition(b => b.resMut(TimesRan), function (times) {
            if (log_running) {
                console.log(`condition_${i} running!`)
            }
            times.v.set(this, performance.now())
            return return_type;
        })

        if (set_name) {
            condition.setName(`condition_${i}`)
        }

        return condition
    })

    const timestamps = world instanceof World ? world.getResourceOrInit(TimesRan) : world.getResourceOrInit(TimesRan as any)
    // const timestamps = world.get_resource_or_init(TimesRan);

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
        const system = defineSystem(b => b.resMut(TimesRan), function (times) {
            if (log_running) {
                console.log(`system_${i} running!`)
            }
            const amount = times.v.get(this) ?? 0;
            times.v.set(this, amount + 1);
        })

        if (set_name) {
            system.setName(`system_${i}`)
        }

        return system
    })

    const condition_systems = (conditions ?? []).map(({ return_type }, i) => {
        const system = defineCondition(b => b.resMut(TimesRan), function (times) {
            if (log_running) {
                console.log(`condition_${i} running!`)
            }
            const amount = times.v.get(this) ?? 0;
            times.v.set(this, amount + 1);
            return return_type;
        })

        if (set_name) {
            system.setName(`condition_${i}`)
        }

        return system

    })

    const timestamps = world.getResourceOrInit(TimesRan);

    return [timestamps, { systems, conditions: condition_systems }] as const;
}

function test_combine(
    type: string,
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

    s.addSystems(system.runIf(ca[type](cb)));

    s.run(w);

    if (expected_times_ran_a === 0) {
        assert(times_ran.v.get(ca) === undefined);
    } else {
        assert(times_ran.v.get(ca) === expected_times_ran_a);
    }

    if (expected_times_ran_b === 0) {
        assert(times_ran.v.get(cb) === undefined);
    } else {
        assert(times_ran.v.get(cb) === expected_times_ran_b);
    }



    if (!system_expected_to_run) {
        assert(times_ran.v.get(system) == null);
    } else {
        const times_ran_system = Boolean(times_ran.v.get(system));
        assert(times_ran_system === system_expected_to_run, `Expected ${times_ran.v.get(system)} to equal ${system_expected_to_run}`)
    }
}

const Resource1 = defineResource(class Resource1 { })

const Comp1 = defineComponent(class Comp1 { constructor(public value = 'himom') { } })
const Comp2 = defineComponent(class Comp2 { constructor(public value = 'hidad') { } })

// test('set chain', () => {
//     const w = new World();
//     const s = new Schedule();

//     const systems = n_systems(5, true, true);
//     const MySet = set(...systems);
//     s.addSystems(MySet.chain());
//     s.run(w);

//     for (let i = 1; i < systems.length; i++) {
//         const prev = systems[i - 1];
//         assert(prev.getLastRun() < systems[i].getLastRun())
//     }
// })

// test('deferred parameter gets executed', () => {
//     const w = new World();
//     const s = new Schedule();

//     // s.addSystems(
//     //     set(
//     //         defineSystem(b => b.commands(), (commands) => {
//     //             console.log('commands running');

//     //             commands.spawn(new Comp1());
//     //         }).setName('command system'),
//     //         defineSystem(b => b.query([Comp1]), (q) => {
//     //             console.log('query running');

//     //             console.log('query count: ', q.iter().count());
//     //         }).setName('query systen')
//     //     ).chain()
//     // )

//     // s.run(w);

// })

test('inserts a sync point', () => {
    const w = new World();
    const s = new Schedule();


    const deferred = defineSystem(b => b.commands(), (commands) => { });

    s.addSystems(
        set(
            deferred,
            defineSystem(b => b.optRes(Resource1), () => { })
        ).chain()
    )

    s.run(w);

    assert(s.executable.__systems.length === 3);
})

function emptySystem() {
    return defineSystem(b => b, function emptySystem() { })
}

test('explicit sync point used as auto sync point', () => {
    const w = new World();
    const s = new Schedule();

    s.addSystems(
        set(
            defineSystem(b => b.commands(), () => { }),
            emptySystem()
        ).chain()
    )

    s.addSystems(set(
        emptySystem(),
        new ApplyDeferred(),
        emptySystem()
    ).chain())

    s.run(w);

    assert(s.executable.__systems.length === 5);
})

// test('conditional explicit sync point not used as auto sync point', () => {
//     const s = new Schedule();
//     const w = new World();

//     // s.addSystems(
//     //     set(
//     //         defineSystem(b => b.commands(), (commands) => commands.insert_resource(Resource1)),
//     //         emptySystem()
//     //     ).chain()
//     // )

//     // s.addSystems(set(
//     //     emptySystem(),
//     //     new ApplyDeferred().runIf(defineCondition(b => b, () => false)) as any,
//     //     emptySystem(),
//     // ).chain())

//     // s.run(w);

//     // console.log(s.executable.__systems.length);

// })

// test('in_set', () => {

//     const [a, b, c, d, e, f, g] = n_systems(7, true, true);
//     const w = new World();
//     const s = new Schedule();

//     const Set = set(c, d, e);

//     // s.addSystems(a);

//     // s.addSystems(Set);

//     // s.addSystems(g.after(Set));

//     // s.run(w);

// })

// test('only one system', () => {
//     const w = new World();
//     const s = new Schedule();

//     const [a, b] = n_systems(2, true);

//     // s.addSystems(a.before(b));
//     // s.run(w);

//     // assert(s.executable.__systems.length === 1);
// })

// test('cycle', () => {
//     const w = new World();
//     const s = new Schedule();

//     const [a, b] = n_systems(3, true);


//     // s.addSystems(a.after(b));
//     // s.addSystems(b.after(a));

//     // let errored = false;
//     // try {
//     //     s.run(w);
//     // } catch (error) {
//     //     errored = true;
//     // } finally {
//     //     assert(errored, `Expected a.after(b) && b.after(a) to throw an error`)
//     // }
// })

// test('schedule in_set before last', () => {
//     const w = new World();
//     const s = new Schedule();

//     // const [a, b, c, d] = n_systems(4, true);
//     // const Set = set(a as any, b, c);


//     // s.addSystems(set(a as any, b, c).chain());
//     // s.addSystems(d.inSet(Set).after(b))
//     // s.run(w);
// })

// test('before_and_after', () => {
//     const w = new World();
//     const s = new Schedule('Update');

//     const [timestamps, {
//         systems: [system_a, system_b, system_c, system_d]
//     }] = with_timestamps(w, { num_systems: 4 })

//     s.addSystems(system_a);
//     s.addSystems(system_b);
//     s.addSystems(system_c.after(system_b));
//     s.addSystems(system_d.before(system_c));

//     // s.run(w);

//     // assert(timestamps.v.get(system_d)! < timestamps.v.get(system_c)!);
//     // assert(timestamps.v.get(system_b)! < timestamps.v.get(system_c)!)
// })

// test.skipIf(skip_set_tests)('add_two_systems_in_set_chained', () => {
//     const w = new World();
//     const s = new Schedule('Update');

//     const [timestamps, { systems: [one, two] }] = with_timestamps(w, { num_systems: 2 })

//     // s.addSystems(set(one, two).chain());

//     // s.run(w);
//     // assert_order(timestamps.v, one, two);
// })


// test.skipIf(skip_run_if_tests)('system_never_runs', () => {
//     const w = new World();
//     const s = new Schedule('Update');
//     const [times_ran, { systems: [system], conditions: [condition] }] = with_times_ran(w, { num_systems: 1, conditions: [{ return_type: false }] })

//     // s.addSystems(system.runIf(condition));
//     // s.run(w);

//     // assert(times_ran.v.get(system) === undefined);

// })

// test.skipIf(skip_run_if_tests)('run_if_combine', () => {

//     test_combine('and', true, true, 1, 1, true);
//     test_combine('and', true, false, 1, 1, false);
//     // short-curcuits because first condition is not met
//     test_combine('and', false, false, 1, 0, false);
//     // short-curcuits because first condition is not met
//     test_combine('and', false, true, 1, 0, false);

//     // short-curcuits because first condition is not met
//     test_combine('nand', true, true, 1, 0, false);
//     // short-curcuits because first condition is not met
//     test_combine('nand', true, false, 1, 0, false);
//     test_combine('nand', false, true, 1, 1, true);
//     test_combine('nand', false, false, 1, 1, false);

//     // short-curcuits because first condition is met
//     test_combine('or', true, true, 1, 0, true);
//     // short-curcuits because first condition is met
//     test_combine('or', true, false, 1, 0, true);
//     test_combine('or', false, true, 1, 1, true);
//     test_combine('or', false, false, 1, 1, false);

//     test_combine('nor', true, true, 1, 1, true);
//     test_combine('nor', true, false, 1, 1, false);
//     // short-curcuits because first condition is not met
//     test_combine('nor', false, true, 1, 0, true);
//     // short-curcuits because first condition is not met
//     test_combine('nor', false, false, 1, 0, true);

//     test_combine('xor', true, true, 1, 1, false);
//     test_combine('xor', true, false, 1, 1, true);
//     test_combine('xor', false, true, 1, 1, true);
//     test_combine('xor', false, false, 1, 1, false);

//     test_combine('xnor', true, true, 1, 1, true);
//     test_combine('xnor', true, false, 1, 1, false);
//     test_combine('xnor', false, true, 1, 1, false);
//     test_combine('xnor', false, false, 1, 1, true);
// })

// test.skipIf(skip_dependency_tests)('in-between_set', () => {
//     const w = new World();
//     const s = new Schedule('Update');

//     const [timestamps, { systems: [first, middle, last] }] = with_timestamps(w, { num_systems: 3, log_running: false })

//     // s.addSystems(set(first, last).chain());
//     // s.addSystems(middle.before(last));

//     // s.run(w);

//     // assert_order(timestamps.v, first, last);
//     // assert_order(timestamps.v, middle, last);
// })

// test.skipIf(skip_hierarchy_tests)('system_add_in_set', () => {
//     const w = new World();
//     const s = new Schedule('Update');

//     const [timestamps, { systems: [a, b, c, d, e, f, g, h] }] = with_timestamps(w, { num_systems: 8, log_running: true })

//     // const my_set = set(a, b, c);

//     // s.addSystems(my_set.chain());
//     // s.addSystems(set(d, e, f).chain());

//     // s.addSystems(g.inSet(my_set).after(a));

//     // s.run(w);

//     // asser_order(timestamps.v, a, b);
//     // assert_order(timestamps.v, b, c);

// })