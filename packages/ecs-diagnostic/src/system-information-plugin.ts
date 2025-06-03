import { defineResource } from "define";
import { Plugin } from "ecs-app";
import { DiagnosticPath } from "./diagnostic";

// export const SystemInformationPlugin = Plugin({
//     name: 'SystemInformationPlugin',
//     SYSTEM_CPU_USAGE: new DiagnosticPath('system/cpu_usage'),
//     SYSTEM_MEM_USAGE: new DiagnosticPath('system/mem_usage'),
//     PROCESS_CPU_USAGE: new DiagnosticPath('process/cpu_usage'),
//     PROCESS_MEM_USAGE: new DiagnosticPath('process/mem_usage'),

//     build(app) {
//         internal.setupPlugin(app);
//     }
// });

// export const SystemInfo = defineResource(class SystemInfo {
//     os: string;
//     kernel: string;
//     cpu: string;
//     core_count: string;
//     memory: string;
// });

export { }