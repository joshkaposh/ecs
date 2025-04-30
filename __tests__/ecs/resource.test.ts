import { assert, expect, test } from 'vitest';
import { World } from 'ecs';
import { defineResource } from 'define';

const MyRes = defineResource(class MyRes { constructor(public value = 0) { } })

test('resource init then get', () => {
    const w = new World();

    w.initResource(MyRes);
    const res1 = w.resourceMut(MyRes);
    const res1_id = w.resourceId(MyRes);
    res1.v.value += 1;
    expect(res1.v).toEqual(new MyRes(1));
    const res2 = w.resourceMut(MyRes);
    const res2_id = w.resourceId(MyRes);
    expect(res1.v).toEqual(res2.v);
    assert(res1_id === res2_id);

    res1.v.value += 1;

    expect(res1.v).toEqual(res2.v);
})