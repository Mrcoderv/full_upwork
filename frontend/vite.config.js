import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
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
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
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

