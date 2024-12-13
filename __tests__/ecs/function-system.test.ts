import { assert, test } from "vitest";
import { define_system, IntoSystemTrait, SystemInput } from "../../src/ecs";

test('into_system_type_id_consistency', () => {
    function testfn<In extends SystemInput, Out, Marker, T extends IntoSystemTrait<In, Out, Marker>>(fn: T) {
        const reference_system = define_system(function reference_system() { })
        const system = IntoSystemTrait.into_system(fn)

        assert(system.type_id() === fn.system_type_id())
        assert(system.type_id() !== IntoSystemTrait.into_system(reference_system as any).type_id())
    }

    const function_system = define_system(function function_system() { })

    testfn(function_system);
})