import { defineComponent, defineResource } from "define";
import { Entity } from "ecs";
import { swap } from "ecs/src/array-helpers";

export const Square = defineComponent(class Square {
    x: number;
    y: number;
    size: number;
    index: number;

    constructor(
        x: number,
        y: number,
        size: number,
        index: number
    ) {

        this.x = x;
        this.y = y;
        this.size = size;
        this.index = index;
    }
})

export const Selected = defineComponent(class Selected {
    symbol: string;
    constructor(symbol: string) {
        this.symbol = symbol;
    }
});

export const Board = defineResource(class Board {
    #entities: ([id: Entity, 'X' | 'O' | null])[];

    cols: number;
    rows: number;
    tilesize: number;

    x: number;
    y: number;
    w: number;
    h: number;

    #active: [string, string];

    constructor() {
        const size = 32;
        const nColsRows = 3;
        this.#entities = [];
        this.cols = nColsRows;
        this.rows = nColsRows;
        this.tilesize = size;
        this.x = 0;
        this.y = 0;
        this.w = nColsRows * size;
        this.h = nColsRows * size;
        this.#active = ['X', 'O'];
    }

    get active() {
        return this.#active[0]
    }

    get entities() {
        return this.#entities;
    }

    set entities(new_entities) {
        // console.log('entities setter');
        this.#entities = new_entities;
    }

    // reset(entities: EntityRef[]) {
    //     this.#active = ['X', 'O'];
    // }

    toggle_player() {
        swap(this.#active, 0, 1);
    }

    entity(x: number, y: number) {
        const size = this.tilesize;
        return this.#entities[Math.floor(y / size) * this.rows + Math.floor(x / size)][0];
    }
})
