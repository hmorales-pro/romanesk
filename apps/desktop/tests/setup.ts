/**
 * Setup Vitest — mock global de `@tauri-apps/api/core` (P15.6).
 *
 * Tous les wrappers de `lib/api.ts` finissent par appeler `invoke()` du
 * SDK Tauri. En environnement de test (Node + jsdom), `invoke` n'existe
 * pas. On le mock pour capturer les arguments et renvoyer une valeur
 * contrôlée — ce qui permet de tester les **builders** typés sans avoir
 * besoin d'un backend Rust.
 *
 * Usage dans un test :
 *
 *   import { vi } from "vitest";
 *   import { invoke } from "@tauri-apps/api/core";
 *
 *   it("foo", async () => {
 *     vi.mocked(invoke).mockResolvedValueOnce({ id: "abc" });
 *     await myWrapper(...);
 *     expect(invoke).toHaveBeenCalledWith("entity_create", { payload: ... });
 *   });
 */

import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));
