import { assert, test } from "vitest";
import { is_class } from "../../packages/ecs/src/util";

class TestClass { }

function TestFunction() { }


test('is_class', () => {
    assert(is_class(TestClass))
    assert(is_class(new TestClass()))
    assert(is_class(TestFunction));
    assert(is_class(new TestFunction()));
    assert(!is_class({}));
    assert(!is_class({ a: 'hello' }));
    assert(!is_class(0));
    assert(!is_class(100_000_000));
    assert(!is_class(false));
    assert(!is_class(true));


})