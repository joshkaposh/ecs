import type { Option } from "joshkaposh-option";
import { defineCondition } from "define";
import { Local, type Component, type Resource, With, type Res, unit } from "ecs";

/**
 * @returns true if and only if this condition has never been called before
 */
export const run_once = defineCondition(b => b.local(false), function run_once(has_run) {
    if (!has_run.value) {
        has_run.value = true;
        return true;
    }
    return false;
})

/**
 * @returns true if the resource exists.
 */
export const resource_exists = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource), function resource_exists(resource) {
    return resource != null;
})

/**
 * @returns the result of the provided `compare` callback.
 */
export const resource_equals = <T extends Resource>(value: T, compare: (a: T, b: T) => boolean) => defineCondition(b => b.res(value), function resource_equals(resource) {
    return compare(value, resource.v);
})

/**
 * Do not rely on the `compare` callback being called. This condition will not call `compare` if the resource does not exist.
 * @returns true if the resource exists and `compare` returns true.
*/
export const resource_exists_and_equals = <T extends Resource>(value: T, compare: (a: T, b: T) => boolean) => defineCondition(b => b.optRes(value), function resource_equals(resource) {
    return !resource ? false : compare(value, resource.v);
})

/**
 * @returns true if the resource was just added.
 */
export function resource_added<T extends Resource>(resource: T) {
    return defineCondition(b => b.optRes(resource), function resource_added(res) {
        return res?.isAdded() ?? false;
    })
}

/**
 * @returns true if the resource was just changed.
 */
export function resource_changed<T extends Resource>(resource: T) {
    return defineCondition(b => b.world().res(resource), function resource_added(w, res) {
        return res.hasChangedSince(w.lastChangeTick);
    })
}

/**
 * @returns true if the resource exists and was just changed.
 */
export const resource_exists_and_changed = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource), function resource_exists_and_changed(res) {
    return res?.isChanged() ?? false;
})

/**
 * @returns true if the resource was just changed or just removed.
 */
export function resource_changed_or_removed<T extends Resource>(res: Option<Res<T>>, existed: Local<boolean>): boolean {
    if (res) {
        existed.value = true;
        return res.isChanged();
    } else if (existed) {
        existed.value = false;
        return true;
    } else {
        return false;
    }
}

/**
 * @returns true if the resource was just removed.
 */
export const resource_removed = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource).local(false), function resource_removed(res, existed) {
    if (res) {
        existed.value = true;
        return false;
    } else if (existed.value) {
        existed.value = false;
        return true;
    } else {
        return false;
    }
})

/**
 * @returns true if any events have been 
 */
export const on_event = <T extends Event>(event: T) => defineCondition(b => b.reader(event), function on_event(reader) {
    return reader.v.isEmpty;
})

/**
 * @returns true if [`Component`] of the type `component` exists.
 */
export const any_with_component = <T extends Component>(component: T) => defineCondition(b => b.queryFiltered([unit], [With(component)]), function any_with_component(query) {
    return !query.is_empty();
})

/**
 * @returns true if any [`Component`] of the type `component` was removed.
 */
export const any_removed_component = <T extends Component>(component: T) => defineCondition(b => b.removedComponent(component), function any_removed_component(removals) {
    return !removals.isEmpty;
})