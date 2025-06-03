import { Entities } from 'ecs';
import { $Update } from 'ecs-app';
import { DiagnosticPath, Diagnostic, Diagnostics } from './diagnostic';
import { defineSystem, definePlugin } from 'define';

export const EntityCountDiagnosticsPlugin = definePlugin({
    name: 'EntityCountDiagnosticsPlugin',
    ENTITY_COUNT: new DiagnosticPath('entity_count'),
    build(app) {
        app.registerDiagnostic(new Diagnostic(this.ENTITY_COUNT!))
            .addSystems($Update, this.diagnosticSystem!);
    },

    diagnosticSystem: defineSystem(b => b.custom(Diagnostics as any).custom(Entities), function diagnosticSystem(diagnostics, entities) {
        diagnostics.addMeasurement(EntityCountDiagnosticsPlugin.ENTITY_COUNT, () => entities.length);
    })
})