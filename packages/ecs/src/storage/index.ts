import type { ComponentInfo, ThinComponentInfo } from "../component/component";
import { Resources, ThinResources } from "./resources";
import { SparseSets, ThinSparseSets } from "./sparse-set";
import { Tables, ThinTables } from "./table";
import { StorageType } from './storage-type';

export * from './storage-type';
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
        if (component.storage_type === StorageType.SparseSet) {
            this.sparse_sets.getOrSet(component);
        }
    }
}

export class Storages {
    readonly tables: Tables;
    readonly sparse_sets: SparseSets;
    readonly resources: Resources;

    constructor(tables = new Tables(), sparse_sets = new SparseSets(), resources = new Resources()) {
        this.tables = tables;
        this.sparse_sets = sparse_sets;
        this.resources = resources;
    }

    prepare_component(component: ComponentInfo) {
        if (component.storage_type === StorageType.SparseSet) {
            this.sparse_sets.__getOrSet(component);
        }
    }
}