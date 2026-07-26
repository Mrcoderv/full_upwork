import pluginVue from "eslint-plugin-vue";

export default [
    ...pluginVue.configs["flat/recommended"],
    {
        rules: {
            "vue/multi-word-component-names": "off",
            "vue/no-unused-components": "warn",
            "vue/no-dupe-keys": "warn",
            "vue/valid-v-slot": "warn",
            "vue/no-mutating-props": "warn",
            "vue/no-parsing-error": "warn",
            "vue/singleline-html-element-content-newline": "off",
            "vue/html-self-closing": "off",
            "vue/html-indent": "off",
            "vue/max-attributes-per-line": "off",
            "vue/first-attribute-linebreak": "off",
            "vue/no-v-html": "off",
            "vue/require-default-prop": "off",
            "no-unused-vars": "off",
            "vue/no-unused-vars": "warn",
            "no-console": "warn",
            "eqeqeq": "warn",
        },
    },
    {
        ignores: ["dist/", "coverage/", "node_modules/"],
    },
];
