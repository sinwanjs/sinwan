import tsParser from "@typescript-eslint/parser";
import sinwan from "../packages/eslint-plugin-sinwan/lib/index.js";
console.log(sinwan);
export default [
  {
    files: ["**/*.{ts,tsx}", "!node_modules/**"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: false,
      },
    },
    plugins: { sinwan },
    rules: {
      "sinwan/state-getter-must-be-called": "error",
      "sinwan/no-state-getter-call-in-jsx": "error",
    },
  },
];
