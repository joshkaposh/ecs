
export type NodeId = InstanceType<typeof NodeId['Set' | 'System']>;
export const NodeId = {
    System: class {
        constructor(public index: number) { }
        is_system() { return true }
        is_set() { return false }
        to_primitive() {
            return `${this.index} ${true}`
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
            return `${this.index} ${false}`
        }
        eq(other: NodeId) {
            return this.index === other.index && this.is_system() === other.is_system()

        }
        [Symbol.toPrimitive]() {
            return this.to_primitive()
        }
    },
    to_node_id(key: string) {
        const [id_, is_system] = key.split(' ');
        const id = Number(id_)
        return Boolean(Number(is_system)) ? new this.System(id) : new this.Set(id)
    },

    [Symbol.hasInstance](other: any) {
        return other instanceof NodeId.Set || other instanceof NodeId.System;
    }
};