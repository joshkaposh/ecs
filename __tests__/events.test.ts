import { assert, expect, test } from 'vitest'
import { Events, ManualEventReader } from '../src/ecs';

class TestEvent {
    constructor(public i: number) { }
}

test('events', () => {
    const events = Events.default<typeof TestEvent>(TestEvent);
    const event_0 = new TestEvent(0)
    const event_1 = new TestEvent(1)
    const event_2 = new TestEvent(2)

    // this reader will miss event_0 and event_1 because it wont read them over the course of
    // two updates
    const reader_missed = events.get_reader();

    const reader_a = events.get_reader();

    events.send(event_0)

    expect(get_events(events, reader_a)).toEqual([event_0]);
    expect(get_events(events, reader_a)).toEqual([]);

    const reader_b = events.get_reader();

    expect(get_events(events, reader_b)).toEqual([event_0]);
    expect(get_events(events, reader_b)).toEqual([]);

    events.send(event_1);

    const reader_c = events.get_reader();

    expect(get_events(events, reader_c)).toEqual([event_0, event_1])
    expect(get_events(events, reader_c)).toEqual([])

    expect(get_events(events, reader_a)).toEqual([event_1]);

    events.update();

    const reader_d = events.get_reader();

    events.send(event_2);

    expect(get_events(events, reader_a)).toEqual([event_2]);
    expect(get_events(events, reader_b)).toEqual([event_1, event_2]);
    expect(get_events(events, reader_d)).toEqual([event_0, event_1, event_2]);

    events.update();

    expect(get_events(events, reader_missed)).toEqual([event_2])

    function get_events(events: Events<typeof TestEvent>, reader: ManualEventReader<typeof TestEvent>) {
        return reader.read(events).collect();
    }

})

class E { constructor(public value: number) { } }

function events_clear_and_read_impl(clear_func: (events: Events<typeof E>) => void) {
    const events = Events.default<typeof E>(E);
    const reader = events.get_reader();

    assert(reader.read(events).next().done);

    events.send(new E(0));
    expect(reader.read(events).next().value).toEqual(new E(0));
    assert(reader.read(events).next().done);

    events.send(new E(1));
    clear_func(events)
    // events.clear();
    assert(reader.read(events).next().done);

    events.send(new E(2));
    events.update();
    events.send(new E(3));

    expect([...reader.read(events)]).toEqual([new E(2), new E(3)]);
}

test('events_clear_and_read_impl', () => {
    events_clear_and_read_impl(events => events.clear());
})

// test('events_drain_and_read', () => {
//     events_clear_and_read_impl(events => {
//         events.drain().eq(iter([new E(0), new E(1)]) as any)
//     })
// })

test('events_extend_impl', () => {
    const events = Events.default<typeof TestEvent>(TestEvent);
    const reader = events.get_reader();

    events.extend([new TestEvent(0), new TestEvent(1)] as any);

    expect(reader.read(events).collect()).toEqual([new TestEvent(0), new TestEvent(1)])
})

test('events_empty', () => {
    const events = Events.default(TestEvent);
    assert(events.is_empty());
    events.send(new TestEvent(0))
    assert(!events.is_empty());
    events.update();
    assert(!events.is_empty());
    // events are only empty after the second call to update
    // due to double buffering.
    events.update();
    assert(events.is_empty());
})

test('events_reader_len empty/filled', () => {
    const events = Events.default(TestEvent);

    assert(events.get_reader().len(events) === 0);
    assert(events.get_reader().is_empty(events));

    events.send(new TestEvent(0));
    assert(events.get_reader().len(events) === 1);
    assert(!events.get_reader().is_empty(events));
})

test('event_iter_len_updated', () => {
    const events = Events.default(TestEvent);
    events.send(new TestEvent(0))
    events.send(new TestEvent(1))
    events.send(new TestEvent(2))
    const reader = events.get_reader();
    const iter = reader.read(events);
    assert(iter.len() === 3)
    iter.next();
    assert(iter.len() === 2)
    iter.next();
    assert(iter.len() === 1)
    iter.next();
    assert(iter.len() === 0)

})

test('event_reader_len_current', () => {
    const events = Events.default(TestEvent);
    events.send(new TestEvent(0))
    const reader = events.get_reader_current()

    assert(reader.is_empty(events));
    events.send(new TestEvent(0));
    assert(reader.len(events) === 1);
    assert(!reader.is_empty(events));
})


test('event_reader_len_update', () => {
    const events = Events.default(TestEvent);
    events.send(new TestEvent(0))
    events.send(new TestEvent(0))
    const reader = events.get_reader();
    assert(reader.len(events) === 2);
    events.update();
    events.send(new TestEvent(0));
    assert(reader.len(events) === 3)
    events.update();
})
