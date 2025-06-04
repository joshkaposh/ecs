import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        open: true
    },
    esbuild: {
        target: "es2024",
    },
    build: {
        commonjsOptions: {
            include: [/node_modules/]
        }
    },
    optimizeDeps: {
        // include: ['define','ecs', 'ecs-app']
    }
})