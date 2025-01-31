import { DiGraph, NodeId, Outgoing } from '../../src/ecs/schedule/graph';
import { expect, test } from 'vitest';

const System = (id: number) => new NodeId.System(id);

test('node_order_preservation', () => {
    const graph = DiGraph();

    graph.add_node(System(1))
    graph.add_node(System(2))
    graph.add_node(System(3))
    graph.add_node(System(4))

    expect(graph.nodes().collect()).toEqual([System(1), System(2), System(3), System(4)])

    graph.remove_node(System(1));

    expect(graph.nodes().collect()).toEqual([
        System(4), System(2), System(3)
    ])

    graph.remove_node(System(4));

    expect(graph.nodes().collect()).toEqual([
        System(3), System(2)
    ])

    graph.remove_node(System(2));
    expect(graph.nodes().collect()).toEqual([System(3)])

    graph.remove_node(System(3))

    expect(graph.nodes().collect()).toEqual([])
})

test('strongly_connected_components', () => {

    const graph = DiGraph();

    graph.add_edge(System(1), System(2));
    graph.add_edge(System(2), System(1));

    graph.add_edge(System(2), System(3))
    graph.add_edge(System(3), System(2))

    graph.add_edge(System(4), System(5))
    graph.add_edge(System(5), System(4))

    graph.add_edge(System(6), System(2))

    const sccs = graph.iter_sccs().collect();

    for (const k of graph.nodes()) {
        console.log(`Edges Out: ${k}`, graph.edges_directed(k, Outgoing).collect())
    }

    console.log(sccs)
    // expect(sccs).toEqual([
    //     [System(3), System(2), System(1)],
    //     [System(5), System(4)],
    //     [System(6)]
    // ])
})