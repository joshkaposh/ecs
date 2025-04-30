import { ComponentInfo, ThinComponentInfo } from "../component";
import { Resources, ThinResources } from "./resources";
import { SparseSets, ThinSparseSets } from "./sparse-set";
import { Tables, ThinTables } from "./table";

export type StorageTypeTable = 0;
export type StorageTypeSparseSet = 1;

export type StorageType = StorageTypeTable | StorageTypeSparseSet;
export const StorageType = {
    Table: 0,
    SparseSet: 1
} as const

export * from './table';
export * from './sparse-set';
export * from './resources';

export class ThinStorages {
    readonly tables: ThinTables;
    readonly sparse_sets: ThinSparseSets;
    readonly resources: ThinResources;

    constructor(tables = new ThinTables(), sparse_sets = new ThinSparseSets(), resources = new ThinResources()) {
        this.tables = tables;
        this.sparse_sets = sparse_sets;
        this.resources = resources;
    }

    prepare_component(component: ThinComponentInfo) {
        if (component.storageType === StorageType.SparseSet) {
            this.sparse_sets.getOrSet(component);
        }
    }
}

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
        if (component.storageType === StorageType.SparseSet) {
            this.sparse_sets.__getOrSet(component);
        }
    }
}