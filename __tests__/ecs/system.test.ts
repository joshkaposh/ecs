import { test, assert, expect } from "vitest";
import { $is_system, ComponentMetadata, define_system, Local, ParamBuilder, Resource, StorageType, World } from "../../packages/ecs";
import { define_component, define_event, define_resource } from "define";

const Counter = define_resource(class Counter { constructor(public count = 0) { } });
const CompA = define_component(class CompA { });
const CompB = define_component(class CompB { });
const CompC = define_component(class CompC { });

const MyEvent = define_event(class MyEvent { constructor(public value = 'event instance!') { } })

test('param_builder', () => {

    const w = new World();
    w.init_resource(Counter);
    // @ts-expect-error
    w.init_resource(MyEvent.ECS_EVENTS_TYPE);
    const builder1 = new ParamBuilder(w);
    const b1 = builder1
        .local(5)
        .local('')
        .res(Counter)
        .query([CompA, CompB, CompC]);

    const [events] = new ParamBuilder(w).events(MyEvent)
        // @ts-expect-error
        .params();
    const [reader] = new ParamBuilder(w).reader(MyEvent)
        // @ts-expect-error
        .params();
    const [writer] = new ParamBuilder(w).writer(MyEvent)
        // @ts-expect-error
        .params();

    writer.send(new MyEvent());
})


test('run_system_once', () => {
    const Test = define_resource(class Test { constructor(public value = 0) { } });

    const w = new World();

    const system = define_system((b) => b.res(Test), (t) => {
        expect(t).toEqual(new Test(0))
    });

    w.init_resource(Test);
    w.run_system_once(system);
})

test('run_system_once_with', () => {

    const Test = define_resource(class Test { constructor(public value: number = 0) { } });
    const w = new World();
    w.init_resource(Test);

    const system = define_system(
        (b) => b.local(1),
        function system(input) {
            return input.value + 1;
        },
    );

    let n = w.run_system_once_with(system, new Local(1));

    assert(n === 2);

})