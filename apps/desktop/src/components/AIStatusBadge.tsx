import { useQuery } from "@tanstack/react-query";
import { Brain, BrainCog } from "lucide-react";

import { aiPing } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Badge minimal qui affiche l'état du provider IA configuré.
 * Ping périodique (30 s). Affiché en haut à droite de LibraryPage.
 *
 * Phase 3.1 : Ollama uniquement (hardcoded). Phase 3.2+ : settings configurables.
 */
export function AIStatusBadge() {
  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: aiPing,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (statusQuery.isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Brain className="size-3.5" aria-hidden /> IA…
      </span>
    );
  }

  const data = statusQuery.data;
  if (!data) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Brain className="size-3.5" aria-hidden /> IA indisponible
      </span>
    );
  }

  const ok = data.reachable;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border",
        ok
          ? "border-emerald-300 text-emerald-700 bg-emerald-50"
          : "border-amber-300 text-amber-700 bg-amber-50",
      )}
      title={
        ok
          ? `Provider ${data.providerId} accessible.`
          : `Provider ${data.providerId} hors ligne. Lance « ollama serve » et vérifie le port 11434.\n${data.error ?? ""}`
      }
    >
      <BrainCog className="size-3.5" aria-hidden />
      {ok ? `IA · ${data.providerId}` : `IA · hors ligne`}
    </span>
  );
}
