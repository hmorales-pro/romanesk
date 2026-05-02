// ESLint 9 flat config minimal pour Phase 0.
// Sera durci en Phase 1 (react-hooks, jsx-a11y).

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        HTMLElement: "readonly",
        console: "readonly",
      },
    },
  },
);
