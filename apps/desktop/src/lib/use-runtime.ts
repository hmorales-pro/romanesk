/**
 * Hook react-query partagé pour l'état du runtime IA (P17).
 *
 * Source de vérité : la commande `runtime_status` côté Rust, qui résout
 * l'URL *effective* du serveur Ollama (système ou runtime managé). Tous
 * les composants qui parlent à Ollama (liste de modèles, pull…) doivent
 * utiliser `effectiveBaseUrl` plutôt que `settings.ollamaBaseUrl`.
 *
 * Le backend émet "runtime-changed" à chaque bascule (démarrage du
 * runtime managé, changement de mode dans les Settings) — on invalide
 * alors la query pour re-résoudre.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { runtimeStatus, type RuntimeStatus } from "./api";

export const RUNTIME_STATUS_KEY = ["runtime-status"] as const;

export interface RuntimeHelpers {
  runtime: RuntimeStatus | null;
  /** URL à utiliser pour parler à Ollama. Fallback localhost standard
   * tant que le status n'est pas chargé. */
  effectiveBaseUrl: string;
  refetch: () => void;
}

export function useRuntime(): RuntimeHelpers {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: RUNTIME_STATUS_KEY,
    queryFn: runtimeStatus,
    // Le status implique deux probes HTTP (2 s de timeout chacun au
    // pire) — on ne le refetch pas à chaque focus.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen("runtime-changed", () => {
      void qc.invalidateQueries({ queryKey: RUNTIME_STATUS_KEY });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [qc]);

  return {
    runtime: q.data ?? null,
    effectiveBaseUrl: q.data?.effectiveBaseUrl ?? "http://localhost:11434",
    refetch: () => void qc.invalidateQueries({ queryKey: RUNTIME_STATUS_KEY }),
  };
}
