import { assert, test } from "vitest";
import { defineSystem } from "define";

test('into_system_type_id_consistency', () => {
    const function_system = defineSystem(b => b, () => { })
    const reference_system = defineSystem(b => b, () => { })
    const system = function_system.intoSystem();

    assert(system.type_id === function_system.system_type_id)
    assert(system.type_id !== reference_system.intoSystem().type_id)
})