import { test, assert, expect } from "vitest";
import { ComponentMetadata, define_system, ParamBuilder, Resource, StorageType, World } from "../../src/ecs";
import { define_component, define_resource } from "../../src/define";
import { Prettify } from "joshkaposh-iterator/src/util";

const Counter = define_resource(class Counter { constructor(public count = 0) { } });
const CompA = define_component(class CompA { });
const CompB = define_component(class CompB { });
const CompC = define_component(class CompC { });



const testWorld = new World();
testWorld.init_resource(Counter);
const builder = new ParamBuilder(testWorld);

const b = builder.local(5).local('').res(Counter).query([CompA, CompB, CompC]);
const [n, str, res, q] = b.params();

// function define_system2<P>(params: (builder: ParamBuilder) => P, system: (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => any) {
// };

// define_system2(b => b.local(5).local(''), (...args) => {
//     const [a, b] = args;
// })

test('run_system_once', () => {
    const Test = define_resource(class Test { constructor(public value: number) { } });

    const w = new World();

    const system = define_system(
        (b) => b.local(Test),
        (t) => {
            console.log('testme running', t);
        },
    );

    w.init_resource(Test);
    w.run_system_once(system);
})

test('run_system_once_with', () => {

    // const Test = define_resource(class Test { constructor(public value: number = 0) { } });
    // type Test = InstanceType<typeof Test>;
    // const w = new World();
    // w.init_resource(Test);

    // const system = define_system(
    //     function system(input: number) {
    //         console.log('system running!', input);

    //         return input + 1;
    //     },
    //     (b) => b.local(1).params()
    // );

    // let n = w.run_system_once_with(system, 1);

    // assert(n === 2);

})