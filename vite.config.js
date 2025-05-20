import { defineConfig } from 'vite'

export default defineConfig({
    esbuild: {
        target: "es2024",
    },
    // optimizeDeps: {
    //     include: ['ecs', 'ecs-app', 'define']
    // }
})