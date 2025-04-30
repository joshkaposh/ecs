import { assert, test } from "vitest";
import { defineSystem, System } from "ecs";

test('into_system_type_id_consistency', () => {
    function testfn(fn: System<any, any>) {
        const reference_system = defineSystem(b => b, () => { })
        const system = fn.intoSystem();

        assert(system.type_id === fn.system_type_id)
        assert(system.type_id !== reference_system.intoSystem().type_id)
    }

    const function_system = defineSystem(b => b, () => { })

    testfn(function_system);
})