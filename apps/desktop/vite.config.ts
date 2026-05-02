import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite + Tauri + React + Tailwind 4.
// Le port 1420 est figé pour matcher tauri.conf.json (devUrl).
// HMR dédié sur 1421 pour ne pas conflicter avec Tauri.
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite recommande clearScreen=false avec Tauri pour conserver les logs Rust.
  clearScreen: false,
  server: {
    // Port décalé du défaut Tauri (1420) pour ne pas conflicter avec un
    // autre projet Tauri qui tournerait déjà localement chez Hugo.
    port: 1430,
    strictPort: true,
    host: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 1431,
    },
    watch: {
      // src-tauri ne doit pas déclencher de reload Vite — Tauri a son propre watcher.
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
}));
