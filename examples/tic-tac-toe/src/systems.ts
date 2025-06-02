import { defineCondition, defineSystem } from "define";
import { AccumulatedMouseMotion, input_pressed, MouseButton, MouseButtonInput } from "ecs-input";
import { Button } from "ecs-ui";
import { Board, Selected, Square } from "./components";
import { Entity } from "ecs";
import { Canvas, Render2d } from "ecs-render";
import { AppExit } from "ecs-app";

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

export const can_select = input_pressed(MouseButton.Left, MouseButtonInput)
    .and(aabbPointRect)
    .and(squareNotOccupied);

export const check_win = defineCondition(b => b.query([Square, Selected]).res(Board), function check_win(query, board) {
    const remaining = query.iter().remaining();

    return remaining === 9
        || WIN_STATE.some(
            state => ['X', 'O'].some(
                type => state.every(i => board.v.entities[i][1] === type))
            // i => board.v.entities[i].get(Selected)?.symbol === type))
        )
})

export const game_over = defineSystem(b => b.writer(AppExit), function game_over(exit) {
    console.log('GAME OVER');
    exit.v.send(AppExit.Success());
});

export const spawn_squares = defineSystem(b => b.world().res(Board), function spawn_squares(w, board) {
    const { cols, rows, tilesize } = board.v;
    const entities: [number, any][] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * rows + col;
            const x = col * tilesize;
            const y = row * tilesize;
            entities.push([w.spawn(new Square(x, y, tilesize, index)).id, null]);
        }
    }

    board.v.entities = entities;
})

function reset() {

    // app.getEvent(AppExit)?.clear();

    // app.world.clearEntities();

    // const board = app.world.resource(Board);
    // const { cols, rows, tilesize } = board;
    // const entities = [];
    // for (let row = 0; row < rows; row++) {
    //     for (let col = 0; col < cols; col++) {
    //         const index = row * rows + col;
    //         const x = col * tilesize;
    //         const y = row * tilesize;
    //         entities.push(app.world.spawn(new Square(x, y, tilesize, index)).asReadonly());
    //     }
    // }

    // board.reset(entities);
    // app.run();
}

export const spawn_game_over_button = defineSystem(b => b.world(), function spawnGameOverButton(world) {
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

export const select_square = defineSystem(b => b.commands().res(AccumulatedMouseMotion).resMut(Board).query([Entity, Square]), function select_square(commands, mouse, board, squares) {
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

    if (entity != null) {
        commands.entity(entity).insert(new Selected(board.v.active));
        board.v.toggle_player();
    }
})

export const render_grid = defineSystem(b => b.res(Canvas).res(Render2d).res(Board), function render_grid(canvas, render, grid) {
    const r = render.v;
    const c = canvas.v;

    r
        .setFill('#000000')
        .fillRect(0, 0, c.width, c.height)
        .setStroke('#ffffff')
        .setFill('#ffffff');

    const { tilesize, cols, rows } = grid.v;

    for (let row = 0; row < rows; row++) {
        const y = row * tilesize;
        for (let col = 0; col < cols; col++) {
            r.rect(col * tilesize, y, tilesize, tilesize);
        }
    }
})

export const render_selected = defineSystem(b => b.res(Render2d).query([Selected, Square]), function render_selected(render, selected) {
    const r = render.v;
    r.setFill('#ffffff').setStroke('#ffffff');

    for (const [ty, s] of selected) {
        const offset = Math.floor(s.size / 2);
        r.text(s.x + offset, s.y + offset, ty.symbol);
    }
})
