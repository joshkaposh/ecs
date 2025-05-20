export type StorageTypeTable = 0;
export type StorageTypeSparseSet = 1;

export type StorageType = StorageTypeTable | StorageTypeSparseSet;
export const StorageType = {
    Table: 0,
    SparseSet: 1
} as const
