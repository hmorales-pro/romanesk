import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";

import { aiPing } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Badge minimal qui affiche l'état du provider IA configuré.
 * Ping périodique (30 s). Maintenant affiché dans le footer barre d'état
 * (P8.3-I) — point coloré façon "voyant" + label mono petit.
 *
 * P6.2 : écoute l'event Tauri "settings-changed" pour rafraîchir
 * immédiatement après un save Settings (au lieu d'attendre les 30s).
 */
export function AIStatusBadge() {
  const qc = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: aiPing,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen("settings-changed", () => {
      void qc.invalidateQueries({ queryKey: ["ai-status"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [qc]);

  // Trois états → trois points colorés (charte).
  //   ivy    = ok
  //   ocre   = chargement / connecting
  //   bordeaux = hors ligne / erreur
  const ok = statusQuery.data?.reachable ?? false;
  const pending = statusQuery.isPending;
  const dotClass = pending
    ? "bg-ocre"
    : ok
      ? "bg-ivy"
      : "bg-bordeaux";

  const label = pending
    ? "IA · contact…"
    : ok
      ? `IA · ${statusQuery.data?.providerId ?? "ollama"}`
      : "IA · hors ligne";

  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.04em]"
      title={
        statusQuery.data
          ? statusQuery.data.reachable
            ? `Provider ${statusQuery.data.providerId} accessible.`
            : `Provider ${statusQuery.data.providerId} hors ligne. Lance « ollama serve » et vérifie le port 11434.\n${statusQuery.data.error ?? ""}`
          : "Provider IA — état inconnu"
      }
    >
      <i
        aria-hidden
        className={cn("inline-block size-2 rounded-full", dotClass)}
      />
      {label}
    </span>
  );
}
