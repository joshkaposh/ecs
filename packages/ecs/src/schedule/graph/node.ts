
export type NodeIdString = `${'system' | 'set'}:${number}`
export type NodeId = InstanceType<typeof NodeId['Set' | 'System']>;
export const NodeId = {
    System: class {
        constructor(public index: number) { }
        is_system() { return true }
        is_set() { return false }
        to_primitive() {
            return `system:${this.index}` as const
        }
        eq(other: NodeId) {
            return this.index === other.index && this.is_system() === other.is_system()
        }
        [Symbol.toPrimitive]() {
            return this.to_primitive()
        }
    },
    Set: class {
        constructor(public index: number) { }
        is_system() { return false }
        is_set() { return true }
        to_primitive() {
            return `set:${this.index}` as const
        }
        eq(other: NodeId) {
            return this.index === other.index && this.is_system() === other.is_system()

        }
        [Symbol.toPrimitive]() {
            return this.to_primitive()
        }
    },
    to_node_id(key: string) {
        const [type, id_] = key.split(':');
        const id = Number(id_)
        const is_system = type === 'system';
        return is_system ? new NodeId.System(id) : new NodeId.Set(id)
    },

    [Symbol.hasInstance](other: any) {
        return other instanceof NodeId.Set || other instanceof NodeId.System;
    }
};