import { $Last, App, AppExit, plugin } from 'ecs-app';
import { Added, Changed, Entity, EntityWorldMut, StorageType, With, World, run_once, set } from 'ecs';
import { defineComponent, defineResource, defineSystem, defineCondition } from 'define'
import { AccumulatedMouseMotion, input_pressed, InputPlugin, MouseButton, MouseButtonInput } from '../../../packages/ecs-input';
import { $PostUpdate, $PreUpdate, $Startup, $Update } from 'ecs-app';
import { swap } from 'ecs/src/array-helpers';
import { HTMLAttributes } from 'ecs-ui';
import { unit } from 'ecs/src/util';

const TicTacToePlugin = plugin(app => {
    app.initResource(Board)
        .addSystems($Startup, spawn_squares)
        .addSystems($PreUpdate, set(render_selected, render_grid).chain())
        // .addSystems($PreUpdate, render_selected.after(render_grid))


        .addSystems($Update,
            select_square.runIf(can_select as any) as any,
        )
        .addSystems($PostUpdate,
            game_over.runIf(check_win),
        )
})

// const Time = defineResource(class Time {
//     delta: number;
//     elapsed: number;
//     #lastFrame: number | null;
//     constructor() {
//         this.delta = 0;
//         this.elapsed = 0;
//         this.#lastFrame = null;
//     }

//     step() {
//         if (this.#lastFrame == null) {
//             this.#lastFrame = performance.now();
//             this.elapsed = 0;
//             return;
//         }

//         const now = performance.now();
//         this.delta = (now - this.#lastFrame) / 1000;
//         this.#lastFrame = now;
//         this.elapsed! += this.delta;
//     }
// })

const Square = defineComponent(class Square {
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

const Selected = defineComponent(class Selected {
    symbol: string;
    constructor(symbol: string) {
        this.symbol = symbol;
    }
}, StorageType.SparseSet);

// type EventListener<E extends HTMLElement, K extends keyof HTMLElementEventMap = keyof HTMLElementEventMap> = (this: E, ev: HTMLElementEventMap[K]) => any;

// type EventListenerMap<E extends HTMLElement, K extends keyof HTMLElementEventMap = keyof HTMLElementEventMap> = Partial<{
//     [P in K]: EventListener<E, P>;
// }>

interface UINodeAttribute<Tag extends keyof HTMLElementTagNameMap> extends HTMLAttributes<HTMLElementTagNameMap[Tag]> { }

function UI_Node<K extends keyof HTMLElementTagNameMap>(type: K) {
    type ElementType = HTMLElementTagNameMap[K];
    const UIElement = class {
        #node: ElementType;
        #entity: number;
        constructor(
            parent: HTMLElement = document.getElementById('root')!,
            attributes: Partial<UINodeAttribute<K>> = Object.create(null)
        ) {
            const element = document.createElement(type);
            this.#node = element;

            for (const key in attributes) {
                element[key] = attributes[key];
            }

            parent.appendChild(element);
        }

        get entity() {
            return this.#entity;
        }

        set entity(new_id) {
            this.#entity = new_id;
        }

    }

    return defineComponent(UIElement)
}

const Button = UI_Node('button');

const Board = defineResource(class Board {
    #entities: Entity[];

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
        this.#active = ['X', 'O']
    }

    get active() {
        return this.#active[0]
    }

    get entities() {
        return this.#entities;
    }

    reset(entities: number[]) {
        this.#entities = entities;
        this.#active = ['X', 'O'];
    }

    set_entities(entities: number[]) {
        this.#entities = entities;
    }

    select(ref: EntityWorldMut) {
        ref.insert(new Selected(this.active));
        this.toggle_player();
    }

    toggle_player() {
        swap(this.#active, 0, 1);
    }

    entity(x: number, y: number) {
        const size = this.tilesize;
        return this.#entities[Math.floor(y / size) * this.rows + Math.floor(x / size)];
    }

    check_state(world: World, state: readonly [number, number, number]) {
        for (const symbol of this.#active) {
            if (state.every(index => world.get(this.#entities[index], Selected)?.symbol === symbol)) {
                return true;
            }
        }
        return false;
    }
})

const Render = defineResource(class Render {
    #ctx: CanvasRenderingContext2D;
    constructor(canvas = document.getElementById('canvas') as HTMLCanvasElement) {
        this.#ctx = canvas.getContext('2d')!;
    }

    set stroke(style: string | CanvasGradient | CanvasPattern) {
        this.#ctx.strokeStyle = style;
    }

    set fill(style: string | CanvasGradient | CanvasPattern) {
        this.#ctx.fillStyle = style;
    }

    rect(x: number, y: number, w: number, h: number) {
        this.#ctx.fillRect(x, y, w, h);
    }

    strokeRect(x: number, y: number, w: number, h: number) {
        this.#ctx.beginPath();
        this.#ctx.rect(x, y, w, h);
        this.#ctx.stroke();
        this.#ctx.closePath();
    }

    text(x: number, y: number, text: string) {
        this.#ctx.fillText(text, x, y);
    }
}
)

const app = App.default();

const canvas = document.getElementById('canvas')! as HTMLCanvasElement;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);

const aabbPointRect = defineCondition(b => b.res(AccumulatedMouseMotion).res(Board), function aabbPointRect(point, rect) {
    const { x: px, y: py } = point.v;
    const { x, y, w, h } = rect.v;

    return px >= x
        && px <= w
        && py >= y
        && py <= h
})

const squareNotOccupied = defineCondition(b => b.world().res(AccumulatedMouseMotion).res(Board), function SquareNotOccupied(w, mouse, board) {
    const { x, y } = mouse.v;
    return w.get(board.v.entity(x, y), Selected) == null;
})

const can_select = aabbPointRect
    .and(input_pressed(MouseButton.Left, MouseButtonInput).setName('MouseButtonPressed') as any)
    .and(squareNotOccupied)

const check_win = defineCondition(b => b.world().res(Board), function check_win(w, board) {
    return WIN_STATE.some(
        state => board.v.check_state(w, state)
    )
        || board.v.entities.every(id => w.get(id, Selected) != null)
})

const game_over = defineSystem(b => b.world().writer(AppExit), function game_over(w, exit) {
    exit.send(AppExit.Success());


    const btn = new Button(
        document.getElementById('root')!,
        {
            id: 'reset',
            innerText: 'Restart Game',
            style: 'z-index: 5; position: absolute; top: 10px; left: 100px;',
            onclick: (e) => {
                e.preventDefault();
                reset();
            }
        }
    )
    const id = w.spawn(btn).id;
    btn.entity = id;

});

const spawn_squares = defineSystem(b => b.world().resMut(Board), function spawn_squares(w, board) {
    const { cols, rows, tilesize } = board.v;
    const entities: number[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * rows + col;
            const x = col * tilesize;
            const y = row * tilesize;
            entities.push(w.spawn(new Square(x, y, tilesize, index)).id);
        }
    }

    board.v.set_entities(entities);
})

// const spawn_ui = defineSystem(b => b.world(), (w) => {

// })

const select_square = defineSystem(b => b.res(AccumulatedMouseMotion).resMut(Board).query([EntityWorldMut, Square]), function select_square(mouse, board, squares) {
    const { x, y } = mouse.v;

    const id = squares.iter().find_map(([id, square]) => {
        const mCol = Math.floor(x / square.size);
        const mRow = Math.floor(y / square.size);

        const sCol = Math.floor(square.x / square.size);
        const sRow = Math.floor(square.y / square.size);

        if (mCol === sCol && mRow === sRow) {
            return id;
        }

        return
    })

    if (id != null) {
        console.log('inserted selected: ', board.v.active);

        id.insert(new Selected(board.v.active));
        board.v.toggle_player();
    }

})

const render_grid = defineSystem(b => b.res(Render).res(Board), function render_grid(render, grid) {
    const r = render.v;

    r.fill = '#000000';
    r.rect(0, 0, canvas.width, canvas.height);

    r.stroke = '#ffffff';
    r.fill = '#ffffff';
    const { tilesize, cols, rows } = grid.v;


    for (let row = 0; row < rows; row++) {
        const y = row * tilesize;
        for (let col = 0; col < cols; col++) {
            const x = col * tilesize;
            r.strokeRect(x, y, tilesize, tilesize);
        }
    }
})

const render_selected = defineSystem(b => b.res(Render).query([Selected, Square]), function render_selected(render, selected) {
    const r = render.v;
    r.fill = '#ffffff';

    for (const [ty, s] of selected) {
        const offset = Math.floor(s.size / 2);
        r.text(s.x + offset, s.y + offset, ty.symbol);
    }
})

// const render_perf_stats = defineSystem(b => b.res(Render).res(Time), (render, time) => {
//     const midX = canvas.clientWidth / 2;
//     const midY = canvas.clientHeight / 2;
//     const x = canvas.clientLeft;
//     const y = canvas.clientTop;

//     render.v.fill = '#fff';
//     render.v.text(x + midX, y + midY, `FPS: ${1 / time.v.delta}`);
// })

// const accumulate_time = defineSystem(b => b.resMut(Time), time => time.bypassChangeDetection().step())

const log_added = defineSystem(b => b.world(), function log_added(w) {
    const added = w.queryFiltered([Square], [Added(Square)]);
    const count = added.iter(w).count();
    console.log('added: ', count);
    if (count > 0) {
    }
})

const WIN_STATE = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6]
] as const;


function run_app(_app: App): AppExit {
    resize();
    animate();

    return undefined as unknown as AppExit
}

function init() {
    app
        .initResource(Render)
        .addPlugin(new InputPlugin())
        .addPlugin(new TicTacToePlugin())
        .setRunner(run_app)
        .run();
}

function reset() {
    app.getEvent(AppExit)?.clear();

    app.world.clearEntities();

    const board = app.world.resource(Board);
    const { cols, rows, tilesize } = board;
    const entities: number[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * rows + col;
            const x = col * tilesize;
            const y = row * tilesize;
            entities.push(app.world.spawn(new Square(x, y, tilesize, index)).id);
        }
    }

    board.reset(entities);

    app.setRunner(run_app);

    app.run();
}

function animate() {
    if (!app.shouldExit()) requestAnimationFrame(animate);

    app.update();
}

init();