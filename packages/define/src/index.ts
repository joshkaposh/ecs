import { v4 } from 'uuid';
import { Option, View } from 'joshkaposh-option'
import type { Prettify } from 'joshkaposh-iterator/src/util'
import {
    type World,
    type Event,
    type FromWorld,
    type ThinBundle,
    type ThinComponents
} from 'ecs';
import { Events } from 'ecs/src/event/collections';
import { alloc } from 'ecs/src/storage/table/thin-column';
import { capacity } from 'ecs/src/array-helpers';

export type Class<Static = {}, Inst = {}> = (new (...args: any[]) => Inst) & Static;
export type TypeId = { readonly type_id: UUID }

type StorageType = 0 | 1;

type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
type Component<T extends Class = Class> = T & Prettify<ComponentMetadata>;

type ResourceMetadata<R extends new (...args: any[]) => any> = { from_world(world: World): InstanceType<R> };
type Resource<R = Component> = R extends Class ? R & ComponentMetadata & ResourceMetadata<R> : never;

type UUID = `${string}-${string}-${string}-${string}`;

type TypedArrayConstructor =
    Uint8ArrayConstructor |
    Uint16ArrayConstructor |
    Uint32ArrayConstructor |
    Int8ArrayConstructor |
    Int16ArrayConstructor |
    Int32ArrayConstructor |
    Float32ArrayConstructor |
    Float64ArrayConstructor


export type CtoA<T extends TypedArrayConstructor, TBuf extends ArrayBufferLike = ArrayBuffer> =
    T extends Uint8ArrayConstructor ? Uint8Array<TBuf> :
    T extends Uint16ArrayConstructor ? Uint16Array<TBuf> :
    T extends Uint32ArrayConstructor ? Uint32Array<TBuf> :
    T extends Int8ArrayConstructor ? Int8Array<TBuf> :
    T extends Int16ArrayConstructor ? Int16Array<TBuf> :
    T extends Int32ArrayConstructor ? Int32Array<TBuf> :
    T extends Float32ArrayConstructor ? Float32Array<TBuf> :
    T extends Float64ArrayConstructor ? Float64Array<TBuf> :
    never

// type GetRange<N extends number, Acc extends Array<number> = []> = Acc['length'] extends N ? Acc : GetRange<N, [0, ...Acc]>;
// type Inc<N extends number> = [0, ...GetRange<N>]['length'];
// type Add<A extends number, B extends number> = [...GetRange<A>, ...GetRange<B>]['length']

// type Sub<A extends number, B extends number, Num1 extends Array<number> = GetRange<A>, Num2 extends Array<number> = GetRange<B>> =
//     Num2 extends [...Num1, ...infer R] ? `-${R['length']}` :
//     Num1 extends [...Num2, ...infer T] ? T['length'] : 0;

// type Mul<A extends number, B extends number, Counter = 0, Acc extends Array<number> = [], Num1 extends Array<number> = GetRange<A>> = 
//     B extends Counter ? Acc['length'] : Mul<A, B, Inc<number & Counter>, [...Acc, ...Num1]>

// type Div<N extends number, D extends number, Acc extends Array<number> = [], ReducedN extends number = GetRange<N> extends [...GetRange<D>, ...infer T] ? T['length'] : 0> =
//     N extends 0? Acc['length'] : Div<ReducedN, D, [...Acc, 0]>




export type ComponentRecord = Record<string, TypedArrayConstructor>;

export type ComponentInstance<C extends ComponentRecord> = {
    [K in keyof C]: CtoA<C[K], ArrayBuffer>;
}

type UnionToIntersection<U> = (
    U extends any ? (arg: U) => any : never
) extends (arg: infer I) => void
    ? I
    : never;

export type UnionToTuple<T> = UnionToIntersection<(T extends any ? (t: T) => T : never)> extends (_: any) => infer W
    ? [...UnionToTuple<Exclude<T, W>>, W]
    : [];


type UnionToNumberTuple<T> = UnionToIntersection<(T extends any ? (t: T) => T : never)> extends (_: any) => infer W
    ? [...UnionToNumberTuple<Exclude<T, W>>, number]
    : [];

// type ToViewTuple<T> = UnionToIntersection<(T extends any ? (t: T) => T : never)> extends (_: any) => infer W
//     ? [...ToViewTuple<Exclude<T, W>>, number & { __type__: W }]
//     : [];


type ToTuple<T> = UnionToNumberTuple<keyof T>

export type ThinComponentMetadata = ComponentMetadata & ThinBundle & { readonly keys: string[]; };

export type ThinComponent<T extends ComponentRecord = ComponentRecord> =
    ((...args: ToTuple<T>) => ThinComponent<T>)
    & ComponentInstance<T> & {
        many(...args: SpawnManyInput<[T]>): any
    } & ThinComponentMetadata;


export type ThinResource<T extends Class<ThinComponent> = Class<ThinComponent>> = T & FromWorld<T>

export type SpawnManyInput<T extends ComponentRecord[]> = {
    [K in keyof T]: ComponentProxy<T[K]>
}

export type ComponentProxy<T extends ComponentRecord = ComponentRecord> = ComponentInstance<T> & {
    index: number;
    length: number;
    readonly keys: string[];
    toArray(): number[];
}

export function ComponentProxy<T extends ComponentRecord>(keys: string[], rows: View[]): ComponentProxy<T> {
    const proxy = Object.create(null);
    proxy.index = 0;
    proxy.length = rows[0].length;
    proxy.keys = keys;

    proxy.toArray = function () {
        const index = proxy.index;
        return rows.map(r => r[index]);
    }

    for (let i = 0; i < keys.length; i++) {
        Object.defineProperty(proxy, keys[i], {
            get() {
                return rows[i];
            },
        })
    }

    return proxy
}

function createProxy<T extends ComponentRecord>(keys: string[], rows: View[]): ComponentProxy<T> {
    const proxy = Object.create(null);
    proxy.keys = keys;
    proxy.index = 0;
    proxy.length = rows[0].length ?? 0;

    proxy.toArray = function () {
        const index = proxy.index;
        return rows.map(r => r[index]);
    }

    for (let i = 0; i < keys.length; i++) {
        Object.defineProperty(proxy, keys[i], {
            get() {
                return rows[i];
            },
            set(v) {
                rows[i] = v;
            },
        })
    }

    return proxy;
}

ComponentProxy.from_component = function <T extends ComponentRecord, C extends ThinComponent<T>>(component: C): ComponentProxy<T> {
    const keys = component.keys;
    // @ts-expect-error
    const rows = keys.map(k => new component[k].constructor());
    return createProxy(keys, rows);
}

type FromEntries<Entries extends Array<[string, TypedArrayConstructor]>> = Prettify<UnionToIntersection<{
    [K in keyof Entries]: Record<Entries[K][0], Entries[K][1]>;
}[number]>>;

/**
 * Creates a new `ComponentProxy` from the given array of key, value pairs.
 */
ComponentProxy.from_entries = function <Entries extends Array<[string, TypedArrayConstructor]>, Type extends FromEntries<Entries> extends ComponentRecord ? FromEntries<Entries> : never>(entries: Entries): ComponentProxy<Type> {
    const [keys, rows] = entries.reduce((acc, [k, r], i) => {
        acc[0][i] = k;
        acc[1][i] = new r();
        return acc;
    }, [new Array(entries.length), new Array(entries.length)]) as unknown as [string[], View[]]

    return createProxy(keys, rows);
}

/**
 * Creates a new `ComponentProxy`.
 * **SAFETY** - `rows` must be the same length and order of `keys`, each row must be the same type of `T`.
 */
ComponentProxy.from_raw = function <T extends ComponentRecord>(keys: string[], rows: View[]): ComponentProxy<T> {
    return createProxy(keys, rows);
}

/**
 * Copies the given `rows` into the `ComponentProxy`.
 * **SAFETY** - `rows` must be the same length, order, and type as `proxy` fields.
 */
ComponentProxy.copy_raw = function (proxy: ComponentProxy, rows: View[]) {
    const keys = proxy.keys;
    for (let i = 0; i < keys.length; i++) {
        proxy[keys[i]] = rows[i];
    }
}

/**
 * Clones `src` into `dst`.
 * This will clone every field from `src` into `dst`.
 */
ComponentProxy.clone_from = function <T extends ComponentRecord>(dst: ComponentProxy<T>, src: ComponentProxy<T>) {
    const keys = src.keys;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const srca = src[k];
        const dsta = dst[k];

        const src_cap = srca.buffer.maxByteLength;
        const dst_cap = dsta.buffer.maxByteLength;
        if (dst_cap < src_cap) {

        } else {
            dsta.buffer.resize(srca.byteLength);
            dsta.set(srca);
        }
    }
}

export function defineType<T extends Record<PropertyKey, any>>(type: T & {
    type_id?: UUID;
}): asserts type is T & TypeId {
    type.type_id = v4() as UUID;
}

export function defineComponent2<C extends ComponentRecord>(config: C, storage_type: StorageType = 0): ThinComponent<C> {
    const keys = Object.keys(config).filter((key) => ArrayBuffer.isView(new config[key]()));
    const FIELDS = keys.length;

    let length = 0;
    let idx = 0;

    length;

    function components(this: ThisType<ThinComponent<C>>, ...args: ToTuple<C>) {
        idx = 0;
        length = 1;
        for (let i = 0; i < FIELDS; i++) {
            // @ts-expect-error
            components[keys[i]][0] = args[i];
        }

        return components as unknown as ThinComponent<C>;
    }

    for (let i = 0; i < FIELDS; i++) {
        const Ty = config[keys[i]];
        // @ts-expect-error
        components[keys[i]] = new Ty(new ArrayBuffer(32 * Ty.BYTES_PER_ELEMENT, { maxByteLength: 64 * Ty.BYTES_PER_ELEMENT }));
    }

    defineType(components);

    components.keys = keys;
    components.storage_type = storage_type;
    components.thin = true;
    // * Spawn
    components.many = function (many: ComponentProxy<C>) {
        const len = many[0]!.length;
        idx = 0;
        length = len;

        for (let i = 0; i < FIELDS; i++) {
            const field_name = keys[i];
            // @ts-expect-error
            let field = components[field_name] as View;
            if (len > (field.buffer.maxByteLength / field.BYTES_PER_ELEMENT)) {
                const Ty = config[field_name];
                field = new Ty(alloc(len * field.BYTES_PER_ELEMENT, capacity(len) * field.BYTES_PER_ELEMENT));
                // @ts-expect-error
                components[field_name] = field;
            }

            field.buffer.resize(len * field.BYTES_PER_ELEMENT);

            for (let i = 0; i < FIELDS; i++) {
                // @ts-expect-error
                const field = components[keys[i]] as View;
                field.set(many[i]);
            }

        }
    }

    // * Bundle methods

    components.componentIds = function (components: ThinComponents, ids: (component_id: number) => void) {
        ids(components.registerComponent(this as any));
    }

    components.getComponentIds = function (components: ThinComponents, ids: (component_id: Option<number>) => void) {
        ids(components.getId(this as any));
    }

    components.getComponents = function (func: (storage_type: StorageType, ptr: any) => void) {
        const i = idx;
        idx++;

        // @ts-expect-error
        const s = keys.map(k => components[k][i]);
        func(storage_type, s as any);
    }

    components.fromComponents = function (ctx: any, func: (ptr: any) => any) {
        return func(ctx);
    }

    return components as any;
}

export function defineComponent<T>(ty: T, storage_type: StorageType = 0): T & Prettify<ComponentMetadata> {
    defineType(ty as TypeId)
    // @ts-expect-error
    ty.storage_type = storage_type;
    return ty as T & ComponentMetadata;
}

export function defineMarker(): Component {
    const marker = class { }
    defineComponent(marker, 1);
    return marker as Component
}

export function defineResource<R extends Class>(ty: R & Partial<ComponentMetadata> & Partial<ResourceMetadata<R>> & {}): Resource<R> {
    defineComponent(ty, 1);
    ty.from_world ??= (_world: World) => {
        return new ty() as InstanceType<R>;
    }

    return ty as Resource<R>
}

export const ECS_EVENTS_TYPE = 'ECS_EVENTS_TYPE';

export function defineEvent<E extends Class>(type: E): Event<E> {
    defineResource(type);
    // @ts-expect-error;
    const type_id = type.type_id;
    class EventDefinition extends Events<Event<E>> {
        static readonly storage_type = 1;
        static readonly type_id = type_id;
        constructor() {
            super(type as unknown as Event<E>);
        }

        static from_world() {
            return new EventDefinition();
        }
    }
    // @ts-expect-error
    type[ECS_EVENTS_TYPE] = EventDefinition;
    return type as Event<E>;
}

export { defineSystem, defineCondition } from 'ecs';