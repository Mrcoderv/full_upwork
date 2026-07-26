import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";

webcrypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);

export default defineConfig({
    test: {
        coverage: {
            enabled: true,
            provider: 'v8',
            thresholds: {
                statements: 78.5,
                branches: 65,
                functions: 83,
                lines: 78.5,
            },
        },
        envDir: __dirname,
        environment: 'node',
        setupFiles: ["./tests/setup.js"],
        exclude: ["node_modules/**", "dist/**"],
        include: ["tests/**/*.test.js"],
        maxWorkers: 12,
        silent: true
    },
});
