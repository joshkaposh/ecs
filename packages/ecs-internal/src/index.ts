import { definePlugin, set } from 'define';
import { $PostUpdate, App, Plugins, ScheduleRunnerPlugin } from 'ecs-app';
import { TimePlugin } from 'ecs-time';
import { InputPlugin } from 'ecs-input';
import { DiagnosticsPlugin, FrameCountPlugin } from 'ecs-diagnostic';
// TODO: use env to determine if rendering is 2d or 3d
import { Render2dPlugin as RenderPlugin } from 'ecs-render';
import { UiPlugin } from 'ecs-ui';

const PanicHandlerPlugin = definePlugin({
    name: 'PanicHandlerPlugin',
    build() { }
});

const LogPlugin = definePlugin({
    name: 'LogPlugin',
    build() { }
});

const WindowPlugin = definePlugin({
    name: 'WindowPlugin',
    build() { }
});

const AccessibilityPlugin = definePlugin({
    name: 'AccessibilityPlugin',
    build() { }
});

const TransformPlugin = definePlugin({
    name: 'TransformPlugin',
    build() { }
});

const AssetPlugin = definePlugin({
    name: 'AssetPlugin ',
    build() { }
});

const ScenePlugin = definePlugin({
    name: 'ScenePlugin ',
    build() { }
});

const ImagePlugin = definePlugin({
    name: 'ImagePlugin',
    build() { }
});

const PipelinedRenderingPlugin = definePlugin({
    name: 'PipelinedRenderingPlugin',
    build() { }
});

const CorePipelinePlugin = definePlugin({
    name: 'CorePipelinePlugin',
    build() { }
});

const AntiAliasingPlugin = definePlugin({
    name: 'AntiAliasingPlugin',
    build() { }
});

const SpritePlugin = definePlugin({
    name: 'SpritePlugin',
    build() { }
});

const TextPlugin = definePlugin({
    name: 'TextPlugin',
    build() { }
});

const AudioPlugin = definePlugin({
    name: 'AudioPlugin',
    build() { }
});

const AnimationPlugin = definePlugin({
    name: 'AnimationPlugin',
    build() { }
});

const StatesPlugin = definePlugin({
    name: 'StatesPlugin',
    build() { }
});

const DevToolsPlugin = definePlugin({
    name: 'DevToolsPlugin',
    build() { }
});

const CiTestingPlugin = definePlugin({
    name: 'CiTestingPlugin',
    build() { }
});

// TODO: implement
const advanceAnimations = set();
const uiLayoutSystem = set();
const animateTargets = set();

const IgnoreAmbiguitiesPlugin = definePlugin({
    name: 'IgnoreAmbiguitiesPlugin',
    build(app: App) {
        const env = import.meta.env;
        if (env.ANIMATION && env.UI) {
            if (app.isPluginAdded(AnimationPlugin)
                && app.isPluginAdded(UiPlugin)) {
                app.ignoreAmbiguity($PostUpdate, advanceAnimations, uiLayoutSystem);
                app.ignoreAmbiguity($PostUpdate, animateTargets, uiLayoutSystem);
            }
        }
    }
});

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

    addToApp(app: App) {
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
    #frame_count = FrameCountPlugin;
    #time = TimePlugin;
    #runner = ScheduleRunnerPlugin.runLoop();
    #ci_testing?: typeof CiTestingPlugin;

    addToApp(app: App) {
        app
            .addPlugin(this.#frame_count)
            .addPlugin(this.#time)
            .addPlugin(this.#runner);

        if (this.#ci_testing) {
            app.addPlugin(this.#ci_testing);
        }
    }
}