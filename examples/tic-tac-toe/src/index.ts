import { definePlugin, set } from 'define';
import { $PostUpdate, $Startup, $Update, App } from 'ecs-app';
import { DefaultPlugins } from 'ecs-internal';
import { Board } from './components';
import { can_select, check_win, game_over, render_grid, render_selected, select_square, spawn_squares } from './systems';

const TicTacToePlugin = definePlugin({
    name: 'TicTacToePlugin',
    build(app) {
        app
            .initResource(Board)
            .addSystems($Startup, spawn_squares)
            .addSystems($Update,
                set(
                    select_square.runIf(can_select as any),
                    game_over.runIf(check_win)
                ).chain()
            )
            .addSystems($PostUpdate, set(render_grid, render_selected).chain())
    }
});

function init() {
    App.default()
        .addPlugins(new DefaultPlugins())
        .addPlugin(TicTacToePlugin)
        .run();
}

init();
