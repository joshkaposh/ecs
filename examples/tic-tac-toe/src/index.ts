import { set } from 'define';
import { $PostUpdate, $Startup, $Update, App, Plugin, ScheduleRunnerPlugin } from 'ecs-app';
import { InputPlugin } from 'ecs-input';
import { Render2dPlugin } from 'ecs-render';
import { Board } from './components';
import { can_select, check_win, game_over, render_grid, render_selected, select_square, spawn_squares } from './systems';

const TicTacToePlugin = Plugin({
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
        .addPlugin(ScheduleRunnerPlugin.runLoop())
        .addPlugin(InputPlugin)
        .addPlugin(Render2dPlugin)
        .addPlugin(TicTacToePlugin)
        .run();
}

init();
