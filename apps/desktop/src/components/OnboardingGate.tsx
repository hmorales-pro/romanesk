/**
 * OnboardingGate — premier lancement (P9.3).
 *
 * Au montage, détecte l'état d'Ollama. Si Romanesk peut tourner *sans*
 * IA, on ne dérange pas l'utilisateur — l'app reste utilisable, juste
 * dégradée. Mais on affiche une modale guidée si :
 *
 *   - Ollama est hors ligne (pas installé, ou daemon non démarré)
 *   - Ollama tourne mais aucun modèle n'est installé
 *
 * La modale se ferme tant qu'elle reste visible (le user peut écrire
 * sans IA, c'est OK). Pour ne pas réafficher à chaque démarrage, on
 * mémorise dans localStorage le timestamp de dismissal — jeté quand
 * l'utilisateur installe enfin un modèle.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open as openUrl } from "@tauri-apps/plugin-shell";

import { aiListModels, aiPing, aiPullModel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useSettings } from "@/lib/use-settings";

const DISMISSED_KEY = "romanesk:onboarding:dismissedAt";
const DEFAULT_CHAT_MODEL = "gemma3:4b";
const DEFAULT_EMBED_MODEL = "nomic-embed-text:latest";

type GateState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "ollama-offline" }
  | { kind: "no-models" }
  | { kind: "pulling"; model: string; pct: number | null; status: string }
  | { kind: "pull-error"; message: string };

export function OnboardingGate() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const baseUrl = settings?.ollamaBaseUrl ?? "http://localhost:11434";
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const dismissedRef = useRef<boolean>(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(DISMISSED_KEY) != null,
  );

  // Sondage initial : Ollama joignable ? Au moins un modèle installé ?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await aiPing();
        if (!status.reachable) {
          if (cancelled) return;
          setState({ kind: "ollama-offline" });
          return;
        }
        const list = await aiListModels(baseUrl);
        if (cancelled) return;
        if (list.length === 0) {
          setState({ kind: "no-models" });
        } else {
          // Tout va bien — on lève le voile.
          setState({ kind: "ok" });
        }
      } catch {
        if (!cancelled) setState({ kind: "ollama-offline" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  // Stream de progrès pendant un pull lancé depuis la gate.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen<{
      model: string;
      status: string;
      completed: number | null;
      total: number | null;
      done: boolean;
    }>("model-pull-progress", (e) => {
      setState((prev) => {
        if (prev.kind !== "pulling") return prev;
        const pct =
          e.payload.completed != null &&
          e.payload.total != null &&
          e.payload.total > 0
            ? Math.round((e.payload.completed / e.payload.total) * 100)
            : null;
        return {
          kind: "pulling",
          model: e.payload.model,
          pct,
          status: e.payload.status,
        };
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    } catch {
      // localStorage indispo (rare) — pas grave, la modale s'affichera
      // juste à nouveau au prochain démarrage.
    }
    dismissedRef.current = true;
    setState({ kind: "ok" });
  };

  const startQuickInstall = (model: string) => {
    setState({ kind: "pulling", model, pct: null, status: "starting…" });
    aiPullModel(baseUrl, model)
      .then(() => {
        // On efface le flag dismiss : maintenant que tout marche, on
        // veut que la prochaine ouverture passe sans modale.
        try {
          localStorage.removeItem(DISMISSED_KEY);
        } catch {
          // ignore
        }
        void qc.invalidateQueries({ queryKey: ["models", baseUrl] });
        void qc.invalidateQueries({ queryKey: ["ai-status"] });
        setState({ kind: "ok" });
      })
      .catch((err) => {
        setState({ kind: "pull-error", message: String(err) });
      });
  };

  const retry = async () => {
    setState({ kind: "loading" });
    try {
      const status = await aiPing();
      if (!status.reachable) {
        setState({ kind: "ollama-offline" });
        return;
      }
      const list = await aiListModels(baseUrl);
      setState(list.length === 0 ? { kind: "no-models" } : { kind: "ok" });
    } catch {
      setState({ kind: "ollama-offline" });
    }
  };

  // Affichage : on ne montre rien si state.kind === "ok" ou "loading"
  // (loading est court — pas la peine de flasher), et on respecte le
  // dismiss si le user a explicitement choisi "continuer sans IA".
  if (state.kind === "ok" || state.kind === "loading") return null;
  if (dismissedRef.current && state.kind !== "pulling") return null;

  return (
    <ModalShell title={titleFor(state)} onClose={dismiss}>
      {state.kind === "ollama-offline" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Romanesk fonctionne sans IA — tu peux écrire, créer des fiches,
            exporter en Markdown. Mais l'<em>atelier sparring partner</em>{" "}
            (continuation, brainstorm, cohérence, RAG) demande{" "}
            <em>Ollama</em>, un petit serveur local qui tourne en
            arrière-plan. Une seule installation, pas de cloud.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => {
                void openUrl("https://ollama.com/download");
              }}
            >
              Installer Ollama
            </Button>
            <Button size="sm" variant="outline" onClick={retry}>
              J'ai installé · vérifier
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Continuer sans IA
            </Button>
          </div>
          <p className="border-t border-dotted border-rule pt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
            Une fois installé, lance « ollama serve » dans un terminal —
            ou ouvre l'app Ollama qui le fait pour toi.
          </p>
        </>
      )}

      {state.kind === "no-models" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Ollama tourne, mais aucun modèle n'est encore téléchargé. Pour
            que l'IA travaille, il faut au moins un modèle de chat ; pour
            le RAG (questions sur ton lore), il faut aussi un modèle
            d'embedding.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => startQuickInstall(DEFAULT_CHAT_MODEL)}
            >
              Télécharger {DEFAULT_CHAT_MODEL} · ~3 GB
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => startQuickInstall(DEFAULT_EMBED_MODEL)}
            >
              + {DEFAULT_EMBED_MODEL} · ~270 MB (RAG)
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Plus tard · continuer sans IA
            </Button>
          </div>
        </>
      )}

      {state.kind === "pulling" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Téléchargement de <em>{state.model}</em> en cours.
          </p>
          <div className="flex flex-col gap-1.5 rounded-[3px] border border-dashed border-rule bg-paper p-3">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              <span>{state.model}</span>
              <span>{state.pct != null ? `${state.pct} %` : state.status}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-shade">
              <div
                className="h-full bg-bordeaux transition-[width] duration-200"
                style={{ width: state.pct != null ? `${state.pct}%` : "12%" }}
              />
            </div>
            <p className="font-body text-[12px] italic text-ink-faint">
              {state.status} — patience, le téléchargement peut prendre
              quelques minutes selon ta connexion.
            </p>
          </div>
        </>
      )}

      {state.kind === "pull-error" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-bordeaux">
            Le téléchargement a échoué : {state.message}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={retry}>
              Réessayer
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Plus tard
            </Button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function titleFor(state: GateState): string {
  switch (state.kind) {
    case "ollama-offline":
      return "Pour profiter de l'IA, installe Ollama";
    case "no-models":
      return "Un modèle, et tu pourras commencer";
    case "pulling":
      return "Téléchargement en cours";
    case "pull-error":
      return "Téléchargement interrompu";
    default:
      return "Romanesk";
  }
}

/**
 * Coquille de modale Romanesk — équivalent visuel de RomaneskDialog
 * (cf. lib/dialog.tsx) mais en composant React stateful (la gate ne peut
 * pas utiliser l'API impérative de dialog parce qu'elle se ré-affiche
 * et change d'état pendant qu'elle est ouverte).
 *
 * On utilise un <dialog> natif pour bénéficier du focus trap + ESC + le
 * backdrop intégré.
 */
function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    return () => {
      if (dlg && dlg.open) dlg.close();
    };
  }, []);

  // Cancel (ESC) → close
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener("cancel", handler);
    return () => dlg.removeEventListener("cancel", handler);
  }, [onClose]);

  // Click backdrop → close
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClick={handleClick}
      className={[
        "min-w-[400px] max-w-[520px] rounded-[4px] border border-rule bg-paper p-0 text-ink",
        "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]",
        "backdrop:bg-[color-mix(in_oklab,var(--ink)_35%,transparent)]",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 p-6">
        <Eyebrow>Premier lancement</Eyebrow>
        <h2 className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
