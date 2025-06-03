import type { Option } from "joshkaposh-option";
import { App, AppExit } from "./app";
import { type Plugin, PluginsState } from "./plugin";
import { definePlugin } from "define";

export type RunMode = { Once: number } | { Loop: Option<number> }

class _ScheduleRunnerPlugin implements Plugin {
    run_mode: RunMode;
    readonly name = 'ScheduleRunnerPlugin';
    private constructor(mode: RunMode) {
        this.run_mode = mode;
    }

    /**
     * @returns a ScheduleRunner configured to be run only once.
     */
    static runOnce(): Required<Plugin> {
        return new ScheduleRunnerPlugin({ Once: 0 }) as unknown as Required<Plugin>;
    }

    /**
     * `duration` is in ms.
     * @returns a ScheduleRunner configured to be looped.
     */
    static runLoop(duration?: number | null): Required<Plugin> {
        return new ScheduleRunnerPlugin({ Loop: duration }) as unknown as Required<Plugin>;
    }

    build(app: App) {
        const mode = this.run_mode;
        const is_once = 'Once' in mode;
        app.setRunner(() => {
            const plugins_state = app.pluginsState();
            if (plugins_state !== PluginsState.Cleaned) {
                while (app.pluginsState() === PluginsState.Adding) {
                }
                app.finish();
                app.cleanup();
            }

            if (is_once) {
                app.update();
                return app.shouldExit() ?? AppExit.Success();
            } else {
                const wait = mode.Loop;
                const tick = (app: App, wait: Option<number>) => {
                    const start_time = performance.now();
                    app.update();
                    const exit = app.shouldExit();
                    if (exit) {
                        console.log('exitting');
                        return exit;
                    }

                    const end_time = performance.now();

                    if (wait != null) {
                        const execution_time = end_time - start_time;
                        if (execution_time < wait) {
                            return wait - execution_time;
                        }
                    }

                    return
                }

                let animationId: number;
                const tick_app = () => {
                    const exit = tick(app, wait);
                    if (exit) {
                        console.log('should exit');

                        cancelAnimationFrame(animationId);
                        return exit;
                    }
                    animationId = requestAnimationFrame(tick_app);

                }

                const exit = tick_app();
                return exit instanceof AppExit ? exit : AppExit.Success();
            }


        })
    }
}

definePlugin(_ScheduleRunnerPlugin.prototype);

export const ScheduleRunnerPlugin = _ScheduleRunnerPlugin;