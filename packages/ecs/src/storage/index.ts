import { ComponentInfo } from "../component";
import { Resources } from "./resources";
import { SparseSets } from "./sparse-set";
import { Tables } from "./table";

export type StorageTypeTable = 0;
export type StorageTypeSparseSet = 1;

export type StorageType = StorageTypeTable | StorageTypeSparseSet;
export const StorageType = {
    Table: 0,
    SparseSet: 1
} as const

export class Storages {
    readonly tables: Tables;
    readonly sparse_sets: SparseSets;
    readonly resources: Resources;

    constructor(tables: Tables = Tables.default(), sparse_sets: SparseSets = new SparseSets(), resources: Resources = new Resources()) {
        this.tables = tables;
        this.sparse_sets = sparse_sets;
        this.resources = resources;
    }

    prepare_component(component: ComponentInfo) {
        if (component.storage_type() === StorageType.SparseSet) {
            this.sparse_sets.__get_or_insert(component);
        }
    }
}