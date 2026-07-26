module.exports = {
    env: { node: true, es2022: true },
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
        "no-console": "warn",
        "eqeqeq": ["error", "always"],
        "no-throw-literal": "error",
    },
    ignorePatterns: ["node_modules/", "dist/", "coverage/"],
};
