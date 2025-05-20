import { assert, expect, test } from "vitest";
import { defineComponent } from "define";
import { StorageType, id, index, SparseSet, ThinSparseSet } from "ecs";

class Foo { constructor(public value: number) { } }

class TestComponent1 { }
defineComponent(TestComponent1, StorageType.SparseSet)
class TestComponent2 { }
defineComponent(TestComponent2, StorageType.SparseSet)

const test_sets = <T extends new (value: number) => any>(set: SparseSet<InstanceType<T>> | ThinSparseSet<InstanceType<T>>, ctor: (value: number) => InstanceType<T>) => {
    const e0 = id(0);
    const e1 = id(1);
    const e2 = id(2);
    const e3 = id(3);
    const e4 = id(4);

    set.set(index(e1), ctor(1));
    set.set(index(e2), ctor(2));
    set.set(index(e3), ctor(3));

    assert(set.get(index(e0)) == null);
    expect(set.get(index(e1))).toEqual(ctor(1));
    expect(set.get(index(e2))).toEqual(ctor(2));
    expect(set.get(index(e3))).toEqual(ctor(3));
    assert(set.get(index(e4)) == null);

    const iter_results = set.values().collect();
    expect(iter_results).toEqual([ctor(1), ctor(2), ctor(3)]);

    expect(set.delete(index(e2))).toEqual(ctor(2));
    assert(set.delete(index(e2)) == null)
    assert(set.get(index(e0)) == null);
    expect(set.get(index(e1))).toEqual(ctor(1));
    assert(set.get(index(e2)) == null);
    expect(set.get(index(e3))).toEqual(ctor(3));
    assert(set.get(index(e4)) == null);

    expect(set.delete(index(e1))).toEqual(ctor(1));

    assert(set.get(index(e0)) == null);
    assert(set.get(index(e1)) == null);
    assert(set.get(index(e2)) == null);
    expect(set.get(index(e3))).toEqual(ctor(3));
    assert(set.get(index(e4)) == null);

    set.set(index(e1), ctor(10));
    expect(set.get(index(e1))).toEqual(ctor(10));

    const f = set.getMut(index(e1));
    if (f) {
        f.value = 11;
    }

    expect(set.get(index(e1))).toEqual(ctor(11));
}

// test('thin_sparse_set', () => {
//     const set: ThinSparseSet<Foo> = new ThinSparseSet<Foo>();
//     const e0 = id(0);
//     const e1 = id(1);
//     const e2 = id(2);
//     const e3 = id(3);
//     const e4 = id(4);

//     set.set(index(e1), new Foo(1));
//     set.set(index(e2), new Foo(2));
//     set.set(index(e3), new Foo(3));

//     set.get(0);
//     assert(!set.get(0));
//     set.get(1)
//     set.get(2)
//     set.get(3)


//     expect(set.get(1)).toEqual(new Foo(1));
//     expect(set.get(2)).toEqual(new Foo(2));
//     expect(set.get(3)).toEqual(new Foo(3));

//     assert(set.get(index(e4)) == null);

//     let iter_results = set.values().collect();
//     expect(iter_results).toEqual([new Foo(1), new Foo(2), new Foo(3)]);
//     expect(set.delete(index(e2))).toEqual(new Foo(2));
//     assert(set.delete(index(e2)) == null)
//     assert(set.get(index(e0)) == null);
//     expect(set.get(index(e1))).toEqual(new Foo(1));
//     assert(set.get(index(e2)) == null);

//     // expect(set.get(index(e3))).toEqual(new Foo(3));
//     // assert(set.get(index(e4)) == null);

//     // expect(set.delete(index(e1))).toEqual(new Foo(1));
//     set.delete(index(e1));


//     // assert(set.get(index(e0)) == null);
//     // assert(set.get(index(e1)) == null);
//     // assert(set.get(index(e2)) == null);
//     // expect(set.get(index(e3))).toEqual(new Foo(3));
//     // assert(set.get(index(e4)) == null);

//     set.set(index(e1), new Foo(10));
//     // expect(set.get(index(e1))).toEqual(new Foo(10));
// })

test('sparse_set', () => {
    const set: SparseSet<Foo> = new SparseSet<Foo>();
    const e0 = id(0);
    const e1 = id(1);
    const e2 = id(2);
    const e3 = id(3);
    const e4 = id(4);

    set.set(index(e1), new Foo(1));
    set.set(index(e2), new Foo(2));
    set.set(index(e3), new Foo(3));



    set.get(0);
    assert(!set.get(0));
    set.get(1)
    set.get(2)
    set.get(3)


    expect(set.get(1)).toEqual(new Foo(1));
    expect(set.get(2)).toEqual(new Foo(2));
    expect(set.get(3)).toEqual(new Foo(3));

    assert(set.get(index(e4)) == null);

    let iter_results = set.values().collect();
    expect(iter_results).toEqual([new Foo(1), new Foo(2), new Foo(3)]);
    expect(set.delete(index(e2))).toEqual(new Foo(2));
    assert(set.delete(index(e2)) == null)
    assert(set.get(index(e0)) == null);
    expect(set.get(index(e1))).toEqual(new Foo(1));
    assert(set.get(index(e2)) == null);
    set.get(index(e3));
    expect(set.get(index(e3))).toEqual(new Foo(3));
    assert(set.get(index(e4)) == null);

    expect(set.delete(index(e1))).toEqual(new Foo(1));

    assert(set.get(index(e0)) == null);
    assert(set.get(index(e1)) == null);
    assert(set.get(index(e2)) == null);
    expect(set.get(index(e3))).toEqual(new Foo(3));
    assert(set.get(index(e4)) == null);

    set.set(index(e1), new Foo(10));
    expect(set.get(index(e1))).toEqual(new Foo(10));
})

// test('thin sparse set', () => {
//     const set: ThinSparseSet<Foo> = new ThinSparseSet<Foo>();
//     const e0 = id(0);
//     const e1 = id(1);
//     const e2 = id(2);
//     const e3 = id(3);
//     const e4 = id(4);

//     set.set(index(e1), new Foo(1))
//     set.set(index(e2), new Foo(2))
//     set.set(index(e3), new Foo(3))

//     assert(set.get(index(e0)) == null);
//     expect(set.get(index(e1))).toEqual(new Foo(1));
//     expect(set.get(index(e2))).toEqual(new Foo(2));
//     expect(set.get(index(e3))).toEqual(new Foo(3));
//     assert(set.get(index(e4)) == null);

//     const iter_results = set.values().collect();
//     expect(iter_results).toEqual([new Foo(1), new Foo(2), new Foo(3)]);

//     expect(set.delete(index(e2))).toEqual(new Foo(2));
//     assert(set.delete(index(e2)) == null)
//     assert(set.get(index(e0)) == null);
//     expect(set.get(index(e1))).toEqual(new Foo(1));
//     assert(set.get(index(e2)) == null);
//     expect(set.get(index(e3))).toEqual(new Foo(3));
//     assert(set.get(index(e4)) == null);

//     expect(set.delete(index(e1))).toEqual(new Foo(1));

//     assert(set.get(index(e0)) == null);
//     assert(set.get(index(e1)) == null);
//     assert(set.get(index(e2)) == null);
//     expect(set.get(index(e3))).toEqual(new Foo(3));
//     assert(set.get(index(e4)) == null);

//     set.set(index(e1), new Foo(10));
//     expect(set.get(index(e1))).toEqual(new Foo(10));

//     const f = set.get_mut(index(e1)) as Foo;
//     f.value = 11;
//     expect(set.get(index(e1))).toEqual(new Foo(11));

// })

// test('sparse_sets', () => {
//     const sets = new SparseSets();


//     assert(sets.len() === 0);
//     assert(sets.is_empty());

//     init_component(sets, TestComponent1 as Component, 1);
//     assert(sets.len() === 1);
//     init_component(sets, TestComponent2 as Component, 2);
//     assert(sets.len() === 2);

//     const collected_sets = sets.iter().map(([id, set]) => [id, set.len()] as const).collect();

//     collected_sets.sort((a, b) => a[0] < b[0] ? -1 : 1);

//     expect(collected_sets)
//         .toEqual([[1, 0], [2, 0]]);

//     function init_component<T extends Component>(sets: SparseSets, type: T, id: number) {
//         const descriptor: ComponentDescriptor = {
//             type: type,
//             storage_type: type.storage_type
//         };
//         const info = new ComponentInfo(id, descriptor);
//         sets.__get_or_insert(info)
//     }
// })