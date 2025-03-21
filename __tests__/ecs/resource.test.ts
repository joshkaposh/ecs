import { assert, expect, test } from 'vitest';
import { World } from 'ecs';
import { define_resource } from 'define';

const MyRes = define_resource(class MyRes { constructor(public value = 0) { } })

test('resource init_then_get', () => {
    const w = new World();

    w.init_resource(MyRes);
    const res1 = w.resource_mut(MyRes);
    const res1_id = w.resource_id(MyRes);
    res1.v.value += 1;
    expect(res1.v).toEqual(new MyRes(1));
    const res2 = w.resource_mut(MyRes);
    const res2_id = w.resource_id(MyRes);
    expect(res1.v).toEqual(res2.v);
    assert(res1_id === res2_id);

    res1.v.value += 1;
    assert(res1.v === res2.v);
    expect(res1.v).toEqual(res2.v);
})