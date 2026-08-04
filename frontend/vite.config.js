import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import removeMissingSourceMapPlugin from './removeMissingSourceMapPlugin.js';

const API_PROXY_TARGET = 'http://localhost:5010';

export default defineConfig({
    define: {
        __DEV_API_PROXY_TARGET__: JSON.stringify(API_PROXY_TARGET),
    },
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
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        sourcemapIgnoreList: (path) => path.includes('node_modules'),
        proxy: {
            '/api': {
                target: API_PROXY_TARGET,
                changeOrigin: true,
                secure: false,
            },
        },
    },
});

