import { Commands, defineComponent, defineCondition, defineResource, defineSystem, Entity, EntityRef, EntityWorldMut, on_event, res, set, StorageType, With, World } from 'ecs';
import { $Last, $PostUpdate, $PreUpdate, $Startup, $Update, App, AppExit, plugin, ScheduleRunnerPlugin } from 'ecs-app';
import { AccumulatedMouseMotion, input_pressed, InputPlugin, MouseButton, MouseButtonInput } from 'ecs-input'
import { HTMLAttributes } from 'ecs-ui';
import { swap } from 'ecs/src/array-helpers';


const TicTacToePlugin = plugin(app => {
    app
        .initResource(Render)
        .initResource(Board)
        .addSystems($Startup, spawn_squares)
        .addSystems($Update,
            set(
                select_square.runIf(can_select as any),
                game_over.runIf(check_win)
            )
        )
        .addSystems($PostUpdate, set(render_grid, render_selected).chain())

    // .addSystems($Last, game_over.runIf(check_win))
    // .addSystems($Last, spawn_game_over_button.runIf(app_exitted))


})

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
        #entity!: number;
        constructor(
            parent: HTMLElement = document.getElementById('root')!,
            attributes: Partial<UINodeAttribute<K>> = Object.create(null)
        ) {
            const element = document.createElement(type);
            this.#node = element;

            for (const key in attributes) {
                element[key as keyof typeof element] = attributes[key as keyof typeof attributes];
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
    #entities: EntityRef[];

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
        console.log('entities setter');

        this.#entities = new_entities;
    }

    reset(entities: EntityRef[]) {
        this.#entities = entities;
        this.#active = ['X', 'O'];
    }


    toggle_player() {
        swap(this.#active, 0, 1);
    }

    entity(x: number, y: number) {
        const size = this.tilesize;
        return this.#entities[Math.floor(y / size) * this.rows + Math.floor(x / size)].id;
    }

    check_state(commands: Commands, state: readonly [number, number, number]) {
        // for (const symbol of this.#active) {
        //     if (state.every(index => commands.get(this.#entities[index], Selected)?.symbol === symbol)) {
        //         return true;
        //     }
        // }
        // return false;
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

    return px > x
        && px < w
        && py > y
        && py < h
})

const squareNotOccupied = defineCondition(b => b.world().res(AccumulatedMouseMotion).res(Board), function SquareNotOccupied(w, mouse, board) {
    const { x, y } = mouse.v;
    return w.get(board.v.entity(x, y), Selected) == null;
})

const can_select = input_pressed(MouseButton.Left, MouseButtonInput)
    .and(aabbPointRect)
    .and(squareNotOccupied);

const check_win = defineCondition(b => b.query([Square, Selected]).res(Board), function check_win(query, board) {
    return query.count() === 9
        || WIN_STATE.some(
            state => ['X', 'O'].some(
                type => state.every(
                    i => board.v.entities[i].get(Selected)?.symbol === type)
            )
        );
})

const game_over = defineSystem(b => b.writer(AppExit), function game_over(exit) {
    console.log('GAME OVER');
    exit.v.send(AppExit.Success());
});

const spawn_squares = defineSystem(b => b.world().res(Board), function spawn_squares(w, board) {
    const { cols, rows, tilesize } = board.v;
    const entities: EntityRef[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * rows + col;
            const x = col * tilesize;
            const y = row * tilesize;
            entities.push(w.spawn(new Square(x, y, tilesize, index)).readonly());
        }
    }

    board.v.entities = entities;
})

const spawn_game_over_button = defineSystem(b => b.world(), function spawnGameOverButton(world) {
    const button = new Button(
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
    button.entity = world.spawn(button).id;
})

const select_square = defineSystem(b => b.commands().res(AccumulatedMouseMotion).resMut(Board).query([Entity, Square]), function select_square(commands, mouse, board, squares) {
    const { x, y } = mouse.v;

    const entity = squares.iter().find_map(([id, square]) => {
        const mCol = Math.floor(x / square.size);
        const mRow = Math.floor(y / square.size);

        const sCol = Math.floor(square.x / square.size);
        const sRow = Math.floor(square.y / square.size);

        if (mCol === sCol && mRow === sRow) {
            return id;
        }

        return
    })

    console.log('select entity', entity);

    if (entity != null) {
        commands.entity(entity).insert(new Selected(board.v.active));
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
    r.stroke = '#ffffff'

    for (const [ty, s] of selected) {
        const offset = Math.floor(s.size / 2);
        r.text(s.x + offset, s.y + offset, ty.symbol);
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

function init() {
    resize();
    app
        .addPlugin(ScheduleRunnerPlugin.runLoop())
        .addPlugin(new InputPlugin())
        .addPlugin(new TicTacToePlugin())
        .run()
}

function reset() {

    app.getEvent(AppExit)?.clear();

    app.world.clearEntities();

    const board = app.world.resource(Board);
    const { cols, rows, tilesize } = board;
    const entities = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * rows + col;
            const x = col * tilesize;
            const y = row * tilesize;
            entities.push(app.world.spawn(new Square(x, y, tilesize, index)).readonly());
        }
    }

    board.reset(entities);
    app.run();
}

init();