import { assert, expect, test } from "vitest";
import { SparseSet, SparseSets } from "ecs/src/storage/sparse-set";
// import { is_none } from "joshkaposh-option";
// import { StorageType } from "../src/ecs/storage";

class Foo { constructor(public value: number) { } }

// class TestComponent1 { }
// define_component(TestComponent1, StorageType.SparseSet)
// class TestComponent2 { }
// define_component(TestComponent2, StorageType.SparseSet)


test('sparse_set', () => {
    // const set = new SparseSet();

    // const e0 = Entity.from_raw(0);
    // const e1 = Entity.from_raw(1);
    // const e2 = Entity.from_raw(2);
    // const e3 = Entity.from_raw(3);
    // const e4 = Entity.from_raw(4);

    // set.insert(e1.index(), new Foo(1))
    // set.insert(e2.index(), new Foo(2))
    // set.insert(e3.index(), new Foo(3))

    //     assert(is_none(set.get(e0.index())));
    //     expect(set.get(e1.index())).toEqual(new Foo(1));
    //     expect(set.get(e2.index())).toEqual(new Foo(2));
    //     expect(set.get(e3.index())).toEqual(new Foo(3));
    //     assert(is_none(set.get(e4.index())));

    //     const iter_results = set.values().collect();
    //     expect(iter_results).toEqual([new Foo(1), new Foo(2), new Foo(3)]);

    //     expect(set.remove(e2.index())).toEqual(new Foo(2));
    //     assert(is_none(set.remove(e2.index())))


    //     assert(is_none(set.get(e0.index())));
    //     expect(set.get(e1.index())).toEqual(new Foo(1));
    //     assert(is_none(set.get(e2.index())));
    //     expect(set.get(e3.index())).toEqual(new Foo(3));
    //     assert(is_none(set.get(e4.index())));

    //     expect(set.remove(e1.index())).toEqual(new Foo(1));

    //     assert(is_none(set.get(e0.index())));
    //     assert(is_none(set.get(e1.index())));
    //     assert(is_none(set.get(e2.index())));
    //     expect(set.get(e3.index())).toEqual(new Foo(3));
    //     assert(is_none(set.get(e4.index())));

    //     set.insert(e1.index(), new Foo(10));

    //     expect(set.get(e1.index())).toEqual(new Foo(10));

    //     // set.get_mut(e1.index(), () => new Foo(11));
    //     // expect(set.get(e1.index())).toEqual(new Foo(11));
})

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