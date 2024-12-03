import { v4 } from "uuid";
import { StorageType } from "./storage";
import { Class, Component, ComponentMetadata, World } from ".";

export function define_component<T>(ty: Class<T> & Partial<ComponentMetadata>, storage_type: StorageType = StorageType.Table): Component<T> {
    // @ts-expect-error
    ty.type_id = v4() as UUID;
    // @ts-expect-error
    ty.storage_type = storage_type;
    return ty as Component;
}

export function define_resource<T extends new (...args: any[]) => any>(ty: T & { from_world?(world: World): InstanceType<T> }): void {
    define_component(ty, StorageType.SparseSet);
    ty.from_world = (_world: World) => {
        return new ty();
    }
}

// class SysBase {
//     #fn: any;
//     #args: any;
//     #condition: boolean;
//     constructor(condition: boolean, fn: any, args: any) {
//         this.#condition = condition
//         this.#fn = fn;
//         this.#args = args;
//     }


//     into_config(): IntoConfig {
//         return this as unknown as IntoConfig
//     }

//     is_condition() {
//         return this.#condition
//     }

//     name() {
//         return this.#fn.name
//     }

//     initialize(world: World) {
//     }

//     run(...args: any[]) {
//         return this.#fn(...args) as any
//     }

//     params() {
//         return this.#args()
//     }
// }

// class ConfigBase {
//     #sys: SysBase;
//     constructor(system: SysBase) {
//         this.#sys = system;
//     }

//     run_if(condition: Condition) {
//         return this
//     }

//     before(other: System) {
//         return this
//     }

//     after(other: System) {
//         return this
//     }

//     dependencies(): DoubleEndedIterator<readonly [System, System]> {
//         return iter([])
//     }

//     conditions(): DoubleEndedIterator<readonly [System, System]> {
//         return iter([])
//     }
// }

// class SysDef implements System {
//     #fn: any;
//     #args: any;
//     #condition: boolean;
//     constructor(condition: boolean, fn: any, args: any) {
//         this.#condition = condition
//         this.#fn = fn;
//         this.#args = args;
//     }

//     into_config(): IntoConfig {
//         return this
//     }

//     is_condition() {
//         return this.#condition
//     }

//     name() {
//         return this.#fn.name
//     }

//     initialize(world: World) {
//     }

//     run(...args: any[]) {
//         return this.#fn(...args) as any
//     }

//     params() {
//         return this.#args()
//     }

//     run_if(condition: Condition): IntoConfig {
//         return this
//     }

//     before(other: System) {
//         return this
//     }

//     after(other: System) {
//         return this
//     }

//     dependencies(): DoubleEndedIterator<readonly [System, System]> {
//         return iter([])
//     }

//     conditions(): DoubleEndedIterator<readonly [System, System]> {
//         return iter([])
//     }
// }


// export function define_system<S extends SystemFn, In extends Parameters<S>, Out extends ReturnType<S>>(fn: S, args: () => In): System<In, Out> {
//     return new SysDef(false, fn, args)
// }

// export function define_condition<S extends ConditionFn, In extends Parameters<S>, Out extends ReturnType<S>>(fn: S, args: () => In): System<In, Out> {
//     return new SysDef(true, fn, args)
// }

