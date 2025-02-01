import { assert, expect, test } from 'vitest';
import { define_resource, World } from '../../src/ecs';

const MyRes = define_resource(class MyRes { constructor(public value = 0) { } })

test('resource init_then_get', () => {
    const w = new World();

    w.init_resource(MyRes);
    const res1 = w.resource_mut(MyRes);
    const res1_id = w.resource_id(MyRes);
    res1.value += 1;
    expect(res1).toEqual(new MyRes(1));
    const res2 = w.resource_mut(MyRes);
    const res2_id = w.resource_id(MyRes);
    expect(res1).toEqual(res2);
    assert(res1_id === res2_id);

    res1.value += 1;
    assert(res1.value === res2.value);
    expect(res1).toEqual(res2);
})