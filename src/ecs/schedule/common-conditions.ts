import { is_some, Option } from "joshkaposh-option";
import { Condition } from "./condition";
import { Res } from "../change_detection";
import { Component, Event, EventReader, In, IntoSystemTrait, Query, QueryData, QueryFilter, Resource, System, SystemInput, With } from "..";
import { RemovedComponents } from "../removal-detection";
import { unit } from "../../util";

export function run_once(has_run: Local<boolean>) {
    if (!has_run) {
        has_run = true
        return true
    }

    return false;
}

export function resource_exists<T extends Resource>(res: Option<Res<T>>) {
    return is_some(res)
}

export function resource_equals<T extends Resource>(value: T): (resource: Res<T>) => boolean {
    return (res) => res.value === value;
}

export function resource_exists_and_equals<T extends Resource>(value: T): (resource: Option<Res<T>>) => boolean {
    return (res) => res?.value === value;
}

export function resource_added<T extends Resource>(res: Option<Res<T>>): boolean {
    return res?.is_added() ?? false;
}


export function resource_changed<T extends Resource>(res: Res<T>): boolean {
    return res.is_changed()
}

export function resource_exists_and_changed<T extends Resource>(res: Option<Res<T>>): boolean {
    return res?.is_changed() ?? false;
}

export function resource_changed_or_removed<T extends Resource>(res: Option<Res<T>>, existed: Local<boolean>): boolean {
    if (is_some(res)) {
        existed = true;
        return res.is_changed();
    } else if (existed) {
        existed = false;
        return true;
    } else {
        return false;
    }
}

export function resource_removed<T extends Resource>(res: Option<Res<T>>, existed: Local<boolean>): boolean {
    if (is_some(res)) {
        existed = true;
        return false;
    } else if (existed) {
        existed = false;
        return true;
    } else {
        return false;
    }
}

export function on_event<T extends Event>(reader: EventReader<T>): boolean {
    return reader.read().len() > 0;
}

export function any_with_component<T extends Component>(query: Query<QueryData, With<T>>) {
    return !query.is_empty();
}

export function any_removed_component<T extends Component>(removals: RemovedComponents<T>) {
    return removals.read().count() > 0;
}

export function not<Marker, Tout, T extends IntoSystemTrait<unit, Tout, Marker>>(condition: T): NotSystem<T> {
    // @ts-expect-error
    condition = IntoSystemTrait.into_system(condition);
    const name = condition.name();
    return new NotSystem(NotMarker, condition, name)
}

export function condition_changed<Marker, CIn extends SystemInput, C extends Condition<Marker, CIn>>(condition: C): Condition<unit, CIn> {
    // @ts-expect-error
    return IntoSystemTrait.into_system(condition.pipe((current: In<boolean>, prev: Local<boolean>) => {
        const changed = prev !== current.value;
        prev = current.value;
        return changed;
    })) as any
}


// export function condition_changed<Marker, CIn extends SystemInput, C extends Condition<Marker, CIn>>(to: boolean, condition: C): Condition<unit, CIn> {
//     // @ts-expect-error
//     return IntoSystemTrait.into_system(condition.pipe((current: In<boolean>, prev: Local<boolean>) => {
//         const now_true = prev !== current.value && current.value === to;
//         prev = current.value;
//         return now_true;
//     })) as any
// }

export class NotMarker<S extends System<any, Not>> {

    adapt(input: any, run_system: (input: any) => S['Out']) {
        return !run_system(input);
    }
}


