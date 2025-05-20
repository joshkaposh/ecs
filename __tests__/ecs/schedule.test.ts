import { test, expect, assert } from 'vitest';
import { defineResource, defineComponent, defineSystem, defineCondition, set } from 'define';
import { World, Schedule, Condition, ApplyDeferred, System } from 'ecs';

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

function n_conditions(log_running = false, descriptive_names = true, ...return_types: boolean[]): Condition<void, boolean>[] {
    return_types.length = Math.min(return_types.length, abc.length);
    return return_types.map((b, i) => defineCondition(() => { }, function (this: any) {
        if (log_running) {
            console.log(this.name);
        }

        return b;
    }).setName(descriptive_names ? abc[i] : String(i)));
}

function with_times_ran(world: World, { num_systems, conditions, log_running, set_name }: {
    num_systems: number;
    conditions?: { return_type: boolean }[]
    log_running?: boolean;
    set_name?: boolean;
}) {
    set_name ??= true;

    const systems = Array.from({ length: num_systems }, (_, i) => {
        const system = defineSystem(b => b.resMut(TimesRan), function (this: any, times) {
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
        const system = defineCondition(b => b.resMut(TimesRan), function (this: any, times) {
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

    // @ts-expect-error
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

function assert_order(systems: System<any, any>[]) {
    if (systems.length > 2) {
        for (let i = 1; i < systems.length; i++) {
            assert(
                systems[i - 1].getLastRun()
                < systems[i].getLastRun()
            )

        }
    } else if (systems.length === 2) {
        assert(systems[0].getLastRun() < systems[1].getLastRun())
    }

    // system length <= 1, nop

}

const Resource1 = defineResource(class Resource1 { })

const Comp1 = defineComponent(class Comp1 { constructor(public value = 'himom') { } })
const Comp2 = defineComponent(class Comp2 { constructor(public value = 'hidad') { } })


const systemNeverRuns = () => defineSystem(b => b, function neverRuns() { throw new Error('cannot run') })
const emptySystem = (log_running = false, name = 'emptySystem') => defineSystem(b => b, function emptySystem() {
    if (log_running) {
        console.log(`${name} running`);

    }
}).setName(name);

const emptyCondition = () => defineCondition(b => b, function emptyCondition() { return false })

test('systems receive their condition', () => {
    const w = new World();
    const s = new Schedule();

    const system1 = emptySystem(false, 'system1').runIf(defineCondition(() => { }, function condition1() { return true }));
    const system2 = emptySystem(false, 'system2').runIf(defineCondition(() => { }, function condition2() { return true }));
    const system3 = emptySystem(false, 'system3');
    const system4 = emptySystem(false, 'system4').runIf(defineCondition(() => { }, function condition4() { return true }));

    s.addSystems(system1);
    s.addSystems(system2);
    s.addSystems(system3);
    s.addSystems(system4);
    s.addSystems(emptySystem(false, 'system5'))

    s.run(w);

    const executable = s.executable;
    const expected = {
        system1: ['condition1'],
        system2: ['condition2'],
        system3: [],
        system4: ['condition4'],
        system5: []
    }

    executable.__systems.forEach((system, i) => {
        const conditions = executable.__system_conditions[i].map(c => c.name);
        expect(conditions).toEqual(expected[system.name as keyof typeof expected]);
    })
})

test('dependency cycle', () => {
    const w = new World();
    const s = new Schedule();

    const [s1, s2, s3] = n_systems(3);

    s.addSystems(s1.after(s3));
    s.addSystems(s2.after(s1));
    s.addSystems(s3.after(s1));

    let errored;
    try {
        s.run(w);
    } catch (error) {
        errored = error
    }
    // @ts-expect-error
    assert(errored && errored.message.includes('System dependencies contain cycle(s)'))
})

test('after', () => {
    const w = new World();
    const s = new Schedule();

    const [s1, s2, s3, s4, s5] = n_systems(5);

    s.addSystems(s1);
    s.addSystems(s2.after(s1));
    s.addSystems(s3.after(s2));
    s.addSystems(s4.after(s3));
    s.addSystems(s5.after(s4));

    s.run(w);

    assert_order([s1, s2, s3, s4, s5]);
})

test('set chain', () => {
    const w = new World();
    const s = new Schedule();

    const systems = n_systems(5);
    s.addSystems(set(...systems).chain());
    s.run(w);

    assert_order(systems);
})

test('ambiguousWith not breaking run conditions', () => {
    const Set = set();

    const w = new World();
    const s = new Schedule();

    const system = defineSystem(() => { }, () => { throw new Error('this system should not run') })

    s.configureSets(Set.runIf(defineCondition(b => b, () => false)));
    s.addSystems(
        set(
            system.ambiguousWith(emptySystem()).inSet(Set),
            system.inSet(Set)
        )
    )

    // s.run(w);

})

test('set runIf', () => {
    const w = new World();
    const s = new Schedule();

    s.addSystems(set(
        systemNeverRuns(),
        systemNeverRuns()
    ).runIf(emptyCondition())
    )

    s.run(w);
})

test('inserts a sync point', () => {
    const w = new World();
    const s = new Schedule();

    s.addSystems(
        set(
            defineSystem(b => b.commands(), (commands) => commands.insertResource(Resource1)),
            defineSystem(b => b.res(Resource1), () => { })
        ).chain()
    )

    s.run(w);

    assert(s.executable.__systems.length === 3);
})

test('explicit sync point used as auto sync point', () => {
    const w = new World();
    const s = new Schedule();

    s.addSystems(
        set(
            defineSystem(b => b.commands(), (commands) => commands.insertResource(Resource1)),
            emptySystem()
        ).chain()
    )

    s.addSystems(set(
        emptySystem(),
        ApplyDeferred,
        emptySystem()
    ).chain())

    s.run(w);

    assert(s.executable.__systems.length === 5);
})

test('conditional explicit sync point not used as auto sync point condition on chain', () => {
    const s = new Schedule();
    const w = new World();

    s.addSystems(
        set(
            defineSystem(b => b.commands(), (commands) => commands.insertResource(Resource1)),
            defineSystem(b => b.optRes(Resource1), () => { })
        ).chain()
    )

    s.addSystems(set(
        emptySystem(),
        ApplyDeferred,
        emptySystem(),
    ).chain().runIf(emptyCondition())
    )

    s.run(w);

    assert(s.executable.__systems.length === 6);
})

test('conditional explicit sync point not used as auto sync point', () => {
    const s = new Schedule();
    const w = new World();

    s.addSystems(
        set(
            defineSystem(b => b.commands(), (commands) => { commands.insertResource(Resource1) }),
            defineSystem(b => b.res(Resource1), (_resource) => { })
        ).chain()
    )

    s.addSystems(set(
        emptySystem(),
        ApplyDeferred.runIf(emptyCondition()) as any,
        emptySystem(),
    ).chain())

    s.run(w);

    assert(s.executable.__systems.length === 6);
})

test('runIf combine', () => {

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

test('in-between set', () => {
    const w = new World();
    const s = new Schedule('Update');

    const [s1, s2, s3] = n_systems(3);
    s.addSystems(set(s1, s3).chain());
    s.addSystems(s2.before(s3).after(s1));

    s.run(w);

    assert_order([s1, s2, s3]);
})

test('inSet before system', () => {
    const w = new World();
    const s = new Schedule();

    const [a, b, c, d, e, f, g, h] = n_systems(8);

    const first_set = set(a, b, c);
    const last_set = set(d, e, f);

    s.addSystems(first_set.chain());
    s.addSystems(last_set.chain());

    s.addSystems(
        set(g, h).chain().inSet(first_set).before(d)
    );

    s.run(w);

    assert(g.getLastRun() < d.getLastRun())

})