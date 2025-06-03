import { $Update } from "ecs-app";
import { Real } from 'ecs-time';
import { Diagnostic, DiagnosticPath, Diagnostics } from "./diagnostic";
import { FrameCount } from './frame-count-plugin';
import { definePlugin, defineSystem } from 'define';

export const FrameTimePlugin = definePlugin({
    name: 'FrameTimePlugin',
    FPS: new DiagnosticPath('fps'),
    FRAME_COUNT: new DiagnosticPath('frame_count'),
    FRAME_TIME: new DiagnosticPath('frame_time'),
    max_history_length: 0,
    smoothing_factor: 0,
    build(app) {
        app.registerDiagnostic(
            new Diagnostic(this.FRAME_TIME)
                .withSuffix('ms')
                .withMaxHistoryLength(this.max_history_length!)
                .withSmoothingFactor(this.smoothing_factor!)
        )
            .registerDiagnostic(
                new Diagnostic(this.FPS)
                    .withMaxHistoryLength(this.max_history_length!)
                    .withSmoothingFactor(this.smoothing_factor!)
            )
            .registerDiagnostic(
                new Diagnostic(this.FRAME_COUNT)
                    .withMaxHistoryLength(0)
                    .withSmoothingFactor(0)
            ).addSystems($Update, this.diagnosticSystem!)
    },

    diagnosticSystem: defineSystem(b => b.custom(Diagnostics as any).res(Real).res(FrameCount), function diagnosticSystem(diagnostics, time, frame_count) {
        diagnostics.addMeasurement(FrameTimePlugin.FRAME_COUNT, () => frame_count.v.count);

        const delta_seconds = time.v.delta_secs;
        if (delta_seconds === 0) {
            return
        }

        diagnostics.addMeasurement(FrameTimePlugin.FRAME_TIME, () => delta_seconds * 1000);
        diagnostics.addMeasurement(FrameTimePlugin.FPS, () => 1 / delta_seconds);
    })
})