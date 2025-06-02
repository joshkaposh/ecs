import { v4 } from 'uuid';
import type { Prettify } from 'joshkaposh-iterator/src/util';
import type { Option, View } from 'joshkaposh-option'
import type { FromWorld } from 'ecs/src/world';
import { Bundle, BundleEffect, ThinBundle } from 'ecs/src/bundle';
import { Component, ComponentCloneBehavior, ComponentHook, ComponentId, Components, ComponentsRegistrator, RequiredComponents, Resource } from 'ecs/src/component';
import type { StorageType } from 'ecs/src/storage/storage-type';
import { all_tuples_into_flattened, type Class, type TypeId } from 'ecs/src/util';
import type { Relationship, RelationshipTarget } from 'ecs/src/relationship';

type TypedArrayConstructor =
    Uint8ArrayConstructor |
    Uint16ArrayConstructor |
    Uint32ArrayConstructor |
    Int8ArrayConstructor |
    Int16ArrayConstructor |
    Int32ArrayConstructor |
    Float32ArrayConstructor |
    Float64ArrayConstructor

type CtoA<T extends TypedArrayConstructor, TBuf extends ArrayBufferLike = ArrayBuffer> =
    T extends Uint8ArrayConstructor ? Uint8Array<TBuf> :
    T extends Uint16ArrayConstructor ? Uint16Array<TBuf> :
    T extends Uint32ArrayConstructor ? Uint32Array<TBuf> :
    T extends Int8ArrayConstructor ? Int8Array<TBuf> :
    T extends Int16ArrayConstructor ? Int16Array<TBuf> :
    T extends Int32ArrayConstructor ? Int32Array<TBuf> :
    T extends Float32ArrayConstructor ? Float32Array<TBuf> :
    T extends Float64ArrayConstructor ? Float64Array<TBuf> :
    never


export type ComponentRecord = Record<string, TypedArrayConstructor>;

export type ComponentInstance<C extends ComponentRecord> = {
    [K in keyof C]: CtoA<C[K], ArrayBuffer>;
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

type ToTuple<T> = UnionToNumberTuple<keyof T>

export type ThinComponentMetadata = TypeId & { storage_type: StorageType } & ThinBundle & { readonly keys: string[]; };

export type ThinComponent<T extends ComponentRecord = ComponentRecord> =
    ((...args: ToTuple<T>) => ThinComponent<T>)
    & ComponentInstance<T> & {
        many(...args: SpawnManyInput<[T]>): any
    } & ThinComponentMetadata;


export type ThinResource<T extends Class<ThinComponent> = Class<ThinComponent>> = T & FromWorld<T>

export type SpawnManyInput<T extends ComponentRecord[]> = {
    [K in keyof T]: ComponentProxy<T[K]>
}

// export function defineComponent2<C extends ComponentRecord>(config: C, storage_type: StorageType = 0): ThinComponent<C> {
// const keys = Object.keys(config).filter((key) => ArrayBuffer.isView(new config[key]()));
// const FIELDS = keys.length;

// let length = 0;
// let idx = 0;

// const components: ThinComponent<C> & ((this: ThisType<ThinComponent<C>>, ..._args: ToTuple<C>) => ThinComponent<C>) = function (this: any, ..._args: any[]) {
//     idx = 0;
//     length = 1;
//     // for (let i = 0; i < FIELDS; i++) {
//     //     this[keys[i] as ][0] = args[i];
//     // }

//     return this as unknown as ThinComponent<C>;
// }

// for (let i = 0; i < FIELDS; i++) {
//     const Ty = config[keys[i]];
//     components[keys[i]] = new Ty(new ArrayBuffer(32 * Ty.BYTES_PER_ELEMENT, { maxByteLength: 64 * Ty.BYTES_PER_ELEMENT }));
// }

// components.type_id = v4();

// components.keys = keys;
// components.storage_type = storage_type;
// components.thin = true;
// // * Spawn
// components.many = function (many: ComponentProxy<C>) {
//     const len = many[0]!.length;
//     idx = 0;
//     length = len;

//     for (let i = 0; i < FIELDS; i++) {
//         const field_name = keys[i];
//         let field = components[field_name] as View;
//         if (len > (field.buffer.maxByteLength / field.BYTES_PER_ELEMENT)) {
//             const Ty = config[field_name];
//             field = new Ty(alloc(len * field.BYTES_PER_ELEMENT, capacity(len) * field.BYTES_PER_ELEMENT));
//             // @ts-expect-error
//             components[field_name] = field;
//         }

//         field.buffer.resize(len * field.BYTES_PER_ELEMENT);

//         for (let i = 0; i < FIELDS; i++) {
//             // @ts-expect-error
//             const field = components[keys[i]] as View;
//             field.set(many[i]);
//         }

//     }
// }

// * Bundle methods

// components.componentIds = function (components: ThinComponents, ids: (component_id: number) => void) {
//     ids(components.registerComponent(this as any));
// }

// components.getComponentIds = function (components: ThinComponents, ids: (component_id: Option<number>) => void) {
//     ids(components.getId(this as any));
// }

// components.getComponents = function (func: (storage_type: StorageType, ptr: any) => void) {
//     const i = idx;
//     idx++;

//     // @ts-expect-error
//     const s = keys.map(k => components[k][i]);
//     func(storage_type, s as any);
// }

// components.fromComponents = function (ctx: any, func: (ptr: any) => any) {
//     return func(ctx);
// }

// return components as any;
// }


function componentIds(this: Component, components: Components, ids: (component_id: ComponentId) => void) {
    ids(components.registerComponent(this));
}

function componentIdsInstance(this: InstanceType<Component>, components: Components, ids: (component_id: Option<ComponentId>) => void) {
    ids(components.registerComponent(this.constructor as Component))
}

function getComponentIds(this: Component, components: Components, ids: (component_id: Option<ComponentId>) => void) {
    ids(components.getId(this))
}

function getComponentIdsInstance(this: InstanceType<Component>, components: Components, ids: (component_id: Option<ComponentId>) => void) {
    ids(components.getId(this.constructor as Component))
}

function getComponentsInstance(this: InstanceType<Component>, func: (storage_type: StorageType, ptr: InstanceType<Component>) => void) {
    func((this.constructor as Component).storage_type, this)
}

function getComponents(this: Component, func: (storage_type: StorageType, ptr: InstanceType<Component>) => void) {
    const self = this;
    func(self.storage_type, new self());
}

// function registerRequiredComponents(_components: ComponentsRegistrator, _required_components: RequiredComponents) {

// }

// function registerRequiredComponentsInstance(_components: ComponentsRegistrator, _required_components: RequiredComponents) {

// }

// function clone_behavior(): ComponentCloneBehavior {
//     return ComponentCloneBehavior.Default;
// }

// function registerRequiredComponents(
//     _component_id: ComponentId,
//     _components: ComponentsRegistrator,
//     _required_components: RequiredComponents,
//     _inheritance_depth: number,
//     _recursion_check_stack: ComponentId[]
// ) { }


type ComponentConfig = StorageType | {
    storage_type: StorageType;

    relationship_target?: Relationship;
    effect?: BundleEffect;
    mutable?: boolean;

    on_add?(): Option<ComponentHook>;
    on_insert?(): Option<ComponentHook>;
    on_replace?(): Option<ComponentHook>;
    on_remove?(): Option<ComponentHook>;
    on_despawn?(): Option<ComponentHook>;

    clone_behavior?(): ComponentCloneBehavior;
}

export const $Component = Symbol.for('Component');
export const $Bundle = Symbol.for('Bundle');

export function hash_bundles(bundles: (TypeId | (Partial<TypeId> & { constructor: TypeId & {} }))[]) {
    let hash = '';

    for (let i = 0; i < bundles.length; i++) {
        const b = bundles[i];

        hash += `${i}-${b.type_id ?? b.constructor.type_id}`;
    }
    return hash as UUID;
}

export function defineBundle<Effect extends BundleEffect>(bundle: Bundle | any[] | (Record<PropertyKey, Bundle> & TypeId & Partial<Bundle>), Effect: Effect = BundleEffect.NoEffect as Effect): Bundle<Effect> {
    if ($Bundle in bundle) {
        return bundle as Bundle<Effect>;
    }

    let bundles: Bundle[];

    if (Array.isArray(bundle)) {
        bundles = all_tuples_into_flattened(bundle);
    } else {
        Effect = bundle.Effect as Effect ?? Effect;
        bundles = all_tuples_into_flattened(Object.values(bundle));
    }

    const hash = hash_bundles(bundles);

    const formatted = bundles.reduce(
        // @ts-expect-error
        (acc, x) => acc += `\n(${x.name ? `Component ${x.name}` : `${x.type_id}`})`
        ,
        'Bundle {'
    ) + '\n}';

    return {
        type_id: hash,
        Effect: Effect,
        [$Bundle]: true,
        componentIds(components, ids) {
            for (let i = 0; i < bundles.length; i++) {
                bundles[i].componentIds(components, ids)
            }
        },
        getComponents(func) {
            bundles.forEach(b => b.getComponents(func))
        },

        getComponentIds(components, ids) {
            bundles.forEach(b => b.getComponentIds(components, ids))
        },
        registerRequiredComponents(components, required_components) {
            bundles.forEach(b => b.registerRequiredComponents(components, required_components))
        },

        [Symbol.toStringTag]() {
            return formatted;
        }
    }
}

export function mapEntities(
    data: Component,
    self_ident: any,
    is_relationship: boolean,
    is_relationship_target: boolean
) {
    let is_struct: boolean = true;
    if (is_struct) {
        // const map = [];
        // const fields = Object.values(data);
        // const relationship = is_relationship || is_relationship_target ? relationship_field(fields, 'MapEntities') : null;
        // for (const field of fields) {
        //     field.attrs
        // }
    } else if (!is_struct) {

    } else {

    }
}

export function defineRelationship<T>(type: T & Partial<Relationship>): T & Relationship {
    return type as T & Relationship;
}

export function defineRelationshipTarget<T>(type: T & Partial<RelationshipTarget<Relationship>>): T & RelationshipTarget<Relationship> {
    return type as T & RelationshipTarget<Relationship>;
}

export function defineComponent<T extends new (...args: any[]) => any>(ty: T & Partial<Bundle & Component>, config: ComponentConfig = 0): Component<T> {
    const attrs = typeof config === 'number' ? { storage_type: config } : config;

    const { effect } = attrs;
    const type_id = v4() as UUID;

    const relationship = defineRelationship(ty);

    const relationship_target = defineRelationshipTarget(ty);

    const _map_entities = mapEntities(ty as Component, relationship, relationship_target);

    const storage = attrs.storage_type;

    let on_insert_path;

    if (relationship) {
        on_insert_path = relationship.on_insert;
    } else {
        on_insert_path = attrs.on_insert!;
    }
    if (relationship && 'on_insert' in attrs) {
        throw new Error('Custom on_insert hooks are not supported as relationships already define an on_insert hook.')
    }

    let on_replace_path;

    if (relationship) {
        if ('on_replace' in attrs) {
            throw new Error('Custom on_replace hooks are not supported as relationships already define an on_replace hook.')
        }
        on_replace_path = relationship.on_replace
    } else if ('relationship_target' in attrs) {
        if ('on_replace' in attrs) {
            throw new Error('Custom on_replace hooks are not supported as relationships already define an on_replace hook.')
        }
        on_replace_path = relationship_target.on_replace;
    } else {
        on_replace_path = attrs.on_replace!;
    }

    let on_despawn_path;
    if ('relationship_target' in attrs && attrs.relationship_target.linked_spawn) {
        if ('on_despawn' in attrs) {
            throw new Error("Custom on_despawn hooks are not supported as this RelationshipTarget already defines an on_despawn hook, via the 'linked_spawn' attribute")
        }
        on_despawn_path = relationship_target.on_despawn;
    } else {
        on_despawn_path = attrs.on_despawn;
    }

    // const requires = attrs.requires;
    // const register_required = [];
    // const register_recursive_requires = [];

    // if (requires) {
    //     for (let i = 0; i < requires.length; i++) {
    //         const req = requires[i];
    //         const ident = req.path;
    //         register_recursive_requires.push(ident.registerRequiredComponents(
    //             requiree,
    //             components,
    //             required_components,
    //             inheritance_depth + 1,
    //             recursion_check_stack
    //         ));

    //         if (req.func) {
    //             register_required.push(components.registerRequiredComponentsManual(ident, required_components, () => ident, inheritance_depth, recursion_check_stack));
    //         } else {
    //             register_required.push(components.registerRequiredComponentsManual(ident, required_components, ident.default, inheritance_depth, recursion_check_stack));
    //         }
    //     }
    // }

    const mutable_type = attrs.mutable === false || relationship != null;

    let clone_behavior;

    // if (relationship_target) {
    //     clone_behavior = ComponentCloneBehavior.Custom(ty.cloneBehavior!);
    // } else if ('clone_behavior' in attrs) {
    //     clone_behavior = attrs.clone_behavior;
    // } else {
    //     clone_behavior = DefaultCloneBehaviorSpecialization(ty).default().default_clone_behavior();
    // }


    Object.defineProperties(ty, {
        MUTABLE: {
            get() {
                return mutable_type
            },
            enumerable: false,
            configurable: false,
        },
        type_id: {
            get() {
                return type_id
            },
            enumerable: false,
            configurable: false,
        },
        storage_type: {
            get() {
                return storage
            },
            enumerable: false,
            configurable: false,
        },

        Effect: {
            get() {
                return effect;
            },
            enumerable: false,
            configurable: false
        },

        clone_behavior: {
            get() {
                return clone_behavior;
            },
            enumerable: false,
            configurable: false,
        },

        on_add: {
            get() {
                return on_add_path
            },
            enumerable: false,
            configurable: false
        },
        on_insert: {
            get() {
                return on_insert_path
            },
            enumerable: false,
            configurable: false
        },
        on_replace: {
            get() {
                return on_replace_path
            },
            enumerable: false,
            configurable: false
        },
        on_remove: {
            get() {
                return on_remove_path
            },
            enumerable: false,
            configurable: false
        },
        on_despawn: {
            get() {
                return on_despawn_path
            },
            enumerable: false,
            configurable: false
        },
        mapEntities: {
            get() {
                return _map_entities;
            },
            enumerable: false,
            configurable: false
        },

        relationship: {
            get() {
                return relationship
            },
            enumerable: false,
            configurable: false
        },
        relationship_target: {
            get() {
                return relationship_target;
            },
            enumerable: false,
            configurable: false
        }
    })

    ty.componentIds = componentIds;
    ty.getComponentIds = getComponentIds;

    // ty.registerRequiredComponents = registerRequiredComponents;

    ty.registerRequiredComponents = function registerRequiredComponents(requiree: ComponentId, components: ComponentsRegistrator, required_components: RequiredComponents, inheritance_depth: number, recursion_check_stack: ComponentId[]) {
        const self_id = components.registerComponent(this as Component);
        recursion_check_stack.push(self_id);
    }
    ty.getComponents = getComponents;
    ty.prototype.getComponents = getComponentsInstance;
    ty.prototype.componentIds = componentIdsInstance;
    ty.prototype.getComponentIds = getComponentIdsInstance;
    // ty.prototype.registerRequiredComponents = registerRequiredComponentsInstance;

    return ty as unknown as Component<T>;
}

const ENTITIES = 'entities';

// export function mapEntities() {}

export function defineMarker(): Component {
    return defineComponent(class Marker { }, 1);
}

export function defineResource<R extends Class, M extends boolean>(ty: R & Partial<Resource<R, M>>, mutable: M = true as M): Resource<R, M> {
    // @ts-expect-error
    ty.type_id = v4();
    // @ts-expect-error
    ty.storage_type = 1;
    // @ts-expect-error
    ty.MUTABLE = mutable;
    // @ts-expect-error
    ty.from_world ??= (_world) => {
        return new ty();
    }

    return ty as Resource<R, M>;
}