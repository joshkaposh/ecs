import { definePlugin, defineResource, defineSystem } from "define";
import { $Last } from "ecs-app";

export type FrameCount = typeof FrameCount;
export const FrameCount = defineResource(class FrameCount {
    count: number;
    constructor() {
        this.count = 0;
    }
})

export const FrameCountPlugin = definePlugin({
    name: 'FrameCountPlugin',
    build(app) {
        app.initResource(FrameCount)
            .addSystems($Last, update_frame_count);
    }
});

const update_frame_count = defineSystem((b) => b.resMut(FrameCount), function update_frame_count(frames) {
    const f = frames.v;
    if (f.count + 1 === Number.MAX_SAFE_INTEGER) {
        f.count = 1;
    } else {
        frames.v.count++;
    }
});