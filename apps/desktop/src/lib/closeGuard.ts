/**
 * Garde de fermeture (P16.3).
 *
 * L'éditeur de chapitre enregistre en différé. Sans garde, fermer la
 * fenêtre pendant ce délai perdait la frappe.
 *
 * Le backend intercepte `CloseRequested`, bloque la fermeture et émet
 * `app-close-requested`. Ce module écoute cet event, vide toutes les
 * sauvegardes enregistrées ici, puis rappelle `close_confirmed` pour
 * laisser la fenêtre partir.
 *
 * Le backend force la fermeture au bout de 3 s si personne ne confirme :
 * une sauvegarde qui traîne ne doit pas rendre l'app incapturable. On
 * confirme donc même si un flush échoue — l'erreur remonte par le
 * `MutationCache` global, et bloquer la fermeture ne sauverait rien.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Sauvegarde en attente à vider avant fermeture. */
export type Flush = () => Promise<void> | void;

const flushers = new Set<Flush>();

/**
 * Enregistre une sauvegarde à vider avant fermeture.
 * Renvoie la fonction de désinscription — à appeler au démontage.
 */
export function registerFlush(fn: Flush): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** Nombre de sauvegardes en attente. Exposé pour les tests. */
export function pendingFlushCount(): number {
  return flushers.size;
}

/**
 * Vide toutes les sauvegardes en attente. `allSettled` et pas `all` :
 * un chapitre qui échoue ne doit pas empêcher les autres d'être écrits.
 */
export async function flushAll(): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(flushers, (fn) => Promise.resolve().then(fn)),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[Romanesk] flush avant fermeture échoué:", r.reason);
    }
  }
}

/**
 * Branche le garde. À appeler une seule fois au démarrage de l'app.
 */
export function installCloseGuard(): void {
  void listen("app-close-requested", async () => {
    try {
      await flushAll();
    } finally {
      await invoke("close_confirmed").catch((err: unknown) => {
        console.error("[Romanesk] close_confirmed a échoué:", err);
      });
    }
  });
}
