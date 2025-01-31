import { assert, test } from "vitest";
import { define_system, System } from "../../src/ecs";

test('into_system_type_id_consistency', () => {
    function testfn(fn: System<any, any>) {
        const reference_system = define_system(() => { }, () => { })
        const system = fn.into_system();

        assert(system.type_id() === fn.system_type_id())
        assert(system.type_id() !== reference_system.into_system().type_id())
    }

    const function_system = define_system(() => { }, () => { })

    testfn(function_system);
})