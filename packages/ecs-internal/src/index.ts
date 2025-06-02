import { $PostUpdate, App, Plugin, Plugins, ScheduleRunnerPlugin } from 'ecs-app';

const PanicHandlerPlugin = Plugin({
    name: 'PanicHandlerPlugin',
    build(app: App): void {
    }
})

const LogPlugin = Plugin({
    build(app: App): void {
    }
})

const FrameCountPlugin = Plugin({
    build(app: App): void {
    }
})

const WindowPlugin = Plugin({
    build(app: App): void {

    }
})

const AccessibilityPlugin = Plugin({
    build(app: App): void {
    }
})

const InputPlugin = Plugin({
    build(app: App): void {
    }
})

const TimePlugin = Plugin({
    build(app: App): void {
    }
})

const TransformPlugin = Plugin({
    build(app: App): void {
    }
})

const DiagnosticsPlugin = Plugin({
    build(app: App): void {
    }
})

const AssetPlugin = Plugin({
    build(app: App): void {
    }
})

const ScenePlugin = Plugin({
    build(app: App): void {
    }
})

const RenderPlugin = Plugin({
    build(app: App): void {
    }
})

const ImagePlugin = Plugin({
    build(app: App): void {
    }
})

const PipelinedRenderingPlugin = Plugin({
    build(app: App): void {
    }
})

const CorePipelinePlugin = Plugin({
    build(app: App): void {
    }
})

const AntiAliasingPlugin = Plugin({
    build(app: App): void {
    }
})

const SpritePlugin = Plugin({
    build(app: App): void {
    }
})

const TextPlugin = Plugin({
    build(app: App): void {
    }
})

const UiPlugin = Plugin({
    build(app: App): void {
    }
})

const AudioPlugin = Plugin({
    build(app: App): void {
    }
})

const AnimationPlugin = Plugin({
    build(app: App): void {
    }
})

const StatesPlugin = Plugin({
    build(app: App): void {
    }
})

const DevToolsPlugin = Plugin({
    build(app: App): void {
    }
})

const CiTestingPlugin = Plugin({
    build(app: App): void {

    }
})

const IgnoreAmbiguitiesPlugin = Plugin({
    build(app: App): void {
        const env = import.meta.env;
        if (env.ANIMATION && env.UI) {
            if (app.isPluginAdded(AnimationPlugin)
                && app.isPluginAdded(UiPlugin)) {
                app.ignoreAmbiguity($PostUpdate, advanceAnimations, uiLayoutSystem);
                app.ignoreAmbiguity($PostUpdate, animateTargets, uiLayoutSystem);
            }
        }
    }
})

export class DefaultPlugins implements Plugins {
    #panic_handler = PanicHandlerPlugin;
    #frame_count = FrameCountPlugin;
    #time = TimePlugin;
    #transform = TransformPlugin;
    #diagnostics = DiagnosticsPlugin;
    #input = InputPlugin;
    #runner = ScheduleRunnerPlugin.runLoop();
    #ignore_ambiguities = IgnoreAmbiguitiesPlugin;
    #log?: typeof LogPlugin;
    #window?: typeof WindowPlugin;
    #accessibility?: typeof AccessibilityPlugin;
    #asset?: typeof AssetPlugin;
    #scene?: typeof ScenePlugin;
    #render?: typeof RenderPlugin;
    #image?: typeof ImagePlugin;
    #pipelined_rendering?: typeof PipelinedRenderingPlugin;
    #core_pipeline?: typeof CorePipelinePlugin;
    #anti_aliasing?: typeof AntiAliasingPlugin;
    #sprite?: typeof SpritePlugin;
    #text?: typeof TextPlugin;
    #ui?: typeof UiPlugin;
    #audio?: typeof AudioPlugin;
    #animation?: typeof AnimationPlugin;
    #state?: typeof StatesPlugin;
    #dev_tools?: typeof DevToolsPlugin;
    #ci_testing?: typeof CiTestingPlugin;

    addToApp(app: App): void {
        app
            .addPlugin(this.#panic_handler)
            .addPlugin(this.#frame_count)
            .addPlugin(this.#time)
            .addPlugin(this.#transform)
            .addPlugin(this.#diagnostics)
            .addPlugin(this.#input)
            .addPlugin(this.#runner)
            .addPlugin(this.#ignore_ambiguities);

        const env = import.meta.env;

        if (env.LOG) {
            this.#log && app.addPlugin(this.#log);
        }

        if (env.WINDOW) {
            this.#accessibility && app.addPlugin(this.#accessibility);
            this.#window && app.addPlugin(this.#window);
        }

        if (env.ASSET) {
            this.#asset && app.addPlugin(this.#asset);
        }

        if (env.SCENE) {
            this.#scene && app.addPlugin(this.#scene);
        }

        if (env.RENDER) {
            this.#render && app.addPlugin(this.#render);
            this.#image && app.addPlugin(this.#image);
            this.#pipelined_rendering && app.addPlugin(this.#pipelined_rendering);
        }

        if (env.CORE_PIPELINE) {
            this.#core_pipeline && app.addPlugin(this.#core_pipeline);
        }

        if (env.ANTI_ALIASING) {
            this.#anti_aliasing && app.addPlugin(this.#anti_aliasing);
        }

        if (env.SPRITE) {
            this.#sprite && app.addPlugin(this.#sprite);
        }

        if (env.TEXT) {
            this.#text && app.addPlugin(this.#text);
        }

        if (env.UI) {
            this.#ui && app.addPlugin(this.#ui);
        }

        if (env.AUDIO) {
            this.#audio && app.addPlugin(this.#audio);
        }

        if (env.ANIMATION) {
            this.#animation && app.addPlugin(this.#animation);
        }

        if (env.STATE) {
            this.#state && app.addPlugin(this.#state);
        }

        if (env.DEV_TOOLS) {
            this.#dev_tools && app.addPlugin(this.#dev_tools);
        }

        if (env.CI_TESTING) {
            this.#ci_testing && app.addPlugin(this.#ci_testing);
        }
    }
}

export class MinimalPlugins implements Plugins {
    #frame_count = new FrameCountPlugin();
    #time = new TimePlugin();
    #runner = ScheduleRunnerPlugin.runLoop();
    #ci_testing?: CiTestingPlugin;

    addToApp(app: App): void {
        app
            .addPlugin(this.#frame_count)
            .addPlugin(this.#time)
            .addPlugin(this.#runner);

        if (this.#ci_testing) {
            app.addPlugin(this.#ci_testing);
        }
    }
}