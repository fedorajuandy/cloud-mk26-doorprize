import js from "@eslint/js";
import globals from "globals";
import solid from "eslint-plugin-solid";
export default [
  {
    ignores: [
      "node_modules/**",
      ".output/**",
      "test-results/**",
      "playwright-report/**",
      "utils/**",
    ],
  },
  {
    files: ["**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { solid },
    rules: {
      "solid/jsx-uses-vars": "error",
      "solid/no-react-deps": "error",
      "solid/reactivity": "warn",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
];
