/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Configuration Vitest (P15.6).
//
// Vit séparé de `vite.config.ts` pour ne pas mélanger les types Vite et
// Vitest (le bloc `test` n'est pas dans le type de `defineConfig` de
// Vite). On évite aussi d'importer Tailwind ici puisque les tests ne
// rendent pas de styles.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // node suffit pour les tests des wrappers `lib/api.ts` (qui ne
    // touchent pas au DOM). Si un jour on teste des composants React,
    // ajouter `jsdom` aux deps et basculer environment.
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Mock du module @tauri-apps/api/core : tous les `invoke()` retournent
    // un proxy contrôlé par les tests (cf. tests/setup.ts).
    setupFiles: ["./tests/setup.ts"],
  },
});
