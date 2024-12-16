
/// A [`SystemSet`] grouping instances of the same function.
///
/// This kind of set is automatically populated and thus has some special rules:
/// - You cannot manually add members.
/// - You cannot configure them.

import { SystemSet } from "./config";

/// - You cannot order something relative to one if it has more than one member.
export class SystemTypeSet<T> {
    #phantom_data: any;
    constructor(phantom_data: any) {
        this.#phantom_data = phantom_data;
    }
    clone() {
        return this;
    }

    system_type() {
        return
    }
}

export class AnonymousSet implements SystemSet {
    #id: number;
    constructor(id: number) {
        this.#id = id;
    }

    is_anonymous() {
        return true
    }

}

interface IntoSystemSet {
    into_system_set(): SystemSet;
}

