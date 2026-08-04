import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from "vitest/config";
import removeMissingSourceMapPlugin from './removeMissingSourceMapPlugin.js';

export default defineConfig({
    plugins: [
        removeMissingSourceMapPlugin(),
        vue({
            template: {
                transformAssetUrls: {
                    // for Vuetify image support
                    img: ['src'],
                    image: ['xlink:href', 'href'],
                },
            },
        }),
    ],
    ssr: {
        noExternal: ['vuetify'],
    },

    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        coverage: {
            enabled: true,
            provider: 'v8',
            thresholds: {
                statements: 50,
                branches: 40,
                functions: 50,
                lines: 50,
            },
        },
        envDir: __dirname,
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        silent: true,
        sourcemapIgnoreList: (path) => path.includes('node_modules'),
        transformMode: {
            web: [/\.vue$/],
        },
        maxWorkers: 12,
    },
    server: {
        sourcemapIgnoreList: (path) => path.includes('node_modules'),
        proxy: {
            '/api': {
                target: 'http://localhost:5010',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
