import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import { fixupConfigRules } from "@eslint/compat";
import tsEslint from "typescript-eslint";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";
import eslintPluginJsxA11y from "eslint-plugin-jsx-a11y";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,tsx}"] },
  { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tsEslint.configs.recommended,
  ...fixupConfigRules({
    ...pluginReactConfig,
    settings: {
      react: {
        version: 'detect',
      },
    },
  }),
  {
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
      "jsx-a11y": eslintPluginJsxA11y,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Add other rules as needed
      "react/react-in-jsx-scope": "off", // For React 17+ JSX transform
      "react/prop-types": "off", // Disable prop-types for TypeScript projects
    },
  },
  {
    // Ignore patterns for ESLint itself
    ignores: ["dist", "node_modules", "coverage"],
  },
];
