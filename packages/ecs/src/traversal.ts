import { Option } from "joshkaposh-option";
import { $WorldQuery, QueryItem, RequiredWorldQuery } from "./query";
import { Entity } from "./entity";
import { Relationship } from "./relationship";
import { defineWorldQuery } from "define";
import { unit } from "./util";

export interface Traversal<D> extends RequiredWorldQuery {
    traverse(item: QueryItem<this>, data: D): Option<Entity> | void;
}

export const traversal_unit = defineWorldQuery({
    IS_DENSE: true,
    [$WorldQuery]: true,
    init_fetch(_world, _state, _last_run, this_run) {
        return unit;
    },

    fetch(_fetch, _entity, _table_row) {
        return unit;
    },

    traverse(_item, _data) {
        return;
    },

} as Traversal<any>)

export function traversal<R extends Relationship, D>(type: R & Partial<Traversal<D>>): R & Traversal<D> {
    type.traverse = function traverse(item: R) {
        return item.get();
    }

    return type as R & Traversal<D>;
}