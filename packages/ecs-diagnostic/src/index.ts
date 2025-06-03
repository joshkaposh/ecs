import { DiagnosticStore } from './diagnostic';
import { definePlugin } from 'define';
// import { SystemInfo } from './system-information-plugin';

export * from './diagnostic';
export * from './entity-count-plugin';
export * from './frame-count-plugin';
export * from './frame-time-plugin';
export * from './system-information-plugin';

export const DiagnosticsPlugin = definePlugin({
    name: 'DiagnosticsPlugin',
    build(app) {
        app.initResource(DiagnosticStore);

        // if (import.meta.env.SYSINFO_PLUGIN) {
        //     app.initResource(SystemInfo);
        // }
        // .initResource(SystemInfo)
    }
});

export const DEFAULT_MAX_HISTORY_LENGTH = 120;
