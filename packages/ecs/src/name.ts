import { defineComponent } from "define";
import { Option } from "joshkaposh-option";
import { Entity } from "./entity";

export type Name = typeof Name;
export const Name = defineComponent(class Name {
    hash: number;
    #name: string;

    constructor(name: string = '', hash: number = 0) {
        this.#name = name;
        this.hash = hash;
    }

    get name() {
        return this.#name;
    }

    set name(new_name) {
        this.#name = new_name;
        this.updateHash();
    }

    updateHash() {
        this.hash = FixedHasher.hash_one(this.#name);
    }

    [Symbol.toStringTag]() {
        return `Name { name: ${this.#name} }`;
    }

    [Symbol.toPrimitive]() {
        `Name { name: ${this.#name} }`;
    }
});

export class NameOrEntity {
    name: Option<InstanceType<Name>>;
    entity: Entity;

    constructor(entity: Entity, name: Option<InstanceType<Name>>) {
        this.entity = entity;
        this.name = name;
    }

    [Symbol.toStringTag]() {
        return `NameOrEntity {name: ${this.name ? this.name : this.entity} }`
    }

    [Symbol.toPrimitive]() {
        return `NameOrEntity {name: ${this.name ? this.name : this.entity} }`
    }

} 