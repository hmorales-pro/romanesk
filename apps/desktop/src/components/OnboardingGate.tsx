/**
 * OnboardingGate — premier lancement (P9.3, refondu en P17).
 *
 * Au montage, détecte l'état de la couche IA via `runtime_status` (Rust),
 * qui résout l'URL effective : Ollama système ou runtime managé. Si
 * Romanesk peut tourner *sans* IA, on ne dérange pas l'utilisateur —
 * l'app reste utilisable, juste dégradée. La modale guidée s'affiche si :
 *
 *   - aucun moteur IA n'est disponible (ni Ollama système, ni runtime
 *     managé installé) → installation un-clic : Romanesk télécharge le
 *     moteur (binaire Ollama officiel) puis le modèle recommandé pour la
 *     machine, sans terminal ni site externe (modèle « Jan »)
 *   - le runtime managé est installé mais arrêté → bouton relancer
 *   - un moteur tourne mais aucun modèle n'est téléchargé → pull direct
 *
 * La modale se ferme tant qu'elle reste visible (le user peut écrire
 * sans IA, c'est OK). Pour ne pas réafficher à chaque démarrage, on
 * mémorise dans localStorage le timestamp de dismissal — jeté quand
 * l'installation aboutit enfin.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open as openUrl } from "@tauri-apps/plugin-shell";

import {
  aiListModels,
  aiPullModel,
  runtimeDownload,
  runtimeStart,
  runtimeStatus,
  type RuntimeDownloadProgress,
  type RuntimeStatus,
} from "@/lib/api";
import { RUNTIME_STATUS_KEY } from "@/lib/use-runtime";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

const DISMISSED_KEY = "romanesk:onboarding:dismissedAt";
const FALLBACK_CHAT_MODEL = "gemma3:4b";
const DEFAULT_EMBED_MODEL = "nomic-embed-text:latest";

type GateState =
  | { kind: "loading" }
  | { kind: "ok" }
  /** Ni Ollama système, ni runtime managé installé. */
  | { kind: "runtime-missing"; runtime: RuntimeStatus }
  /** Runtime managé installé mais aucun moteur ne répond. */
  | { kind: "engine-stopped" }
  | { kind: "no-models"; runtime: RuntimeStatus }
  | {
      kind: "installing-runtime";
      phase: string;
      completed: number | null;
      total: number | null;
      message: string;
    }
  | { kind: "pulling"; model: string; pct: number | null; status: string }
  | { kind: "error"; message: string };

/** Sonde l'état complet : runtime résolu, puis modèles installés. */
async function probeGate(): Promise<GateState> {
  const st = await runtimeStatus();
  if (st.systemReachable || st.managedRunning) {
    const list = await aiListModels(st.effectiveBaseUrl);
    return list.length === 0 ? { kind: "no-models", runtime: st } : { kind: "ok" };
  }
  if (st.managedInstalled) return { kind: "engine-stopped" };
  return { kind: "runtime-missing", runtime: st };
}

export function OnboardingGate() {
  const qc = useQueryClient();
  const [state, setState] = useState<GateState>({ kind: "loading" });
  // Pendant l'installation un-clic, on ignore les re-probes déclenchés
  // par les events runtime-changed (le backend en émet en démarrant).
  const busyRef = useRef(false);
  const dismissedRef = useRef<boolean>(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(DISMISSED_KEY) != null,
  );

  const probe = async () => {
    if (busyRef.current) return;
    try {
      const next = await probeGate();
      if (!busyRef.current) setState(next);
    } catch {
      if (!busyRef.current) setState({ kind: "engine-stopped" });
    }
  };

  // Sondage initial + re-sondage quand le backend signale un changement
  // (démarrage auto du runtime managé au boot, changement de mode…).
  useEffect(() => {
    void probe();
    let unlisten: (() => void) | null = null;
    void listen("runtime-changed", () => {
      void probe();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Stream de progrès du téléchargement du moteur.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen<RuntimeDownloadProgress>("runtime-download-progress", (e) => {
      setState((prev) => {
        if (prev.kind !== "installing-runtime") return prev;
        return {
          kind: "installing-runtime",
          phase: e.payload.phase,
          completed: e.payload.completed,
          total: e.payload.total,
          message: e.payload.message,
        };
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Stream de progrès pendant un pull de modèle.
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

  const finishInstall = (baseUrl: string) => {
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch {
      // ignore
    }
    void qc.invalidateQueries({ queryKey: ["models", baseUrl] });
    void qc.invalidateQueries({ queryKey: ["ai-status"] });
    void qc.invalidateQueries({ queryKey: RUNTIME_STATUS_KEY });
    setState({ kind: "ok" });
  };

  /** Pull séquentiel : modèle de chat recommandé puis embedding RAG. */
  const pullDefaults = async (rt: RuntimeStatus) => {
    const chat = rt.recommendedChatModel || FALLBACK_CHAT_MODEL;
    for (const model of [chat, DEFAULT_EMBED_MODEL]) {
      setState({ kind: "pulling", model, pct: null, status: "starting…" });
      await aiPullModel(rt.effectiveBaseUrl, model);
    }
    finishInstall(rt.effectiveBaseUrl);
  };

  /** Un-clic : télécharge le moteur, le démarre, puis les modèles. */
  const installEverything = async () => {
    busyRef.current = true;
    try {
      setState({
        kind: "installing-runtime",
        phase: "download",
        completed: null,
        total: null,
        message: "préparation du téléchargement",
      });
      await runtimeDownload();
      const rt = await runtimeStart();
      await pullDefaults(rt);
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    } finally {
      busyRef.current = false;
    }
  };

  /** Le runtime managé est installé mais éteint : relance + re-sonde. */
  const restartEngine = async () => {
    busyRef.current = true;
    try {
      const rt = await runtimeStart();
      const list = await aiListModels(rt.effectiveBaseUrl);
      void qc.invalidateQueries({ queryKey: RUNTIME_STATUS_KEY });
      if (list.length === 0) {
        setState({ kind: "no-models", runtime: rt });
      } else {
        setState({ kind: "ok" });
      }
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    } finally {
      busyRef.current = false;
    }
  };

  const quickPull = (rt: RuntimeStatus) => {
    busyRef.current = true;
    pullDefaults(rt)
      .catch((err) => setState({ kind: "error", message: String(err) }))
      .finally(() => {
        busyRef.current = false;
      });
  };

  const retry = () => {
    setState({ kind: "loading" });
    void probe();
  };

  // Affichage : rien si tout va bien, et on respecte le dismiss sauf
  // pendant une installation en cours (l'utilisateur l'a déclenchée).
  const activeKinds = ["installing-runtime", "pulling"];
  if (state.kind === "ok" || state.kind === "loading") return null;
  if (dismissedRef.current && !activeKinds.includes(state.kind)) return null;

  return (
    <ModalShell title={titleFor(state)} onClose={dismiss}>
      {state.kind === "runtime-missing" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Romanesk fonctionne sans IA — tu peux écrire, créer des fiches,
            exporter en Markdown. Pour activer l'<em>atelier sparring
            partner</em> (continuation, brainstorm, cohérence, RAG),
            Romanesk peut tout installer lui-même : le moteur IA (Ollama)
            et un modèle adapté à ta machine
            {state.runtime.totalMemGb != null && (
              <> ({state.runtime.totalMemGb} Go de RAM détectés</>
            )}
            {state.runtime.totalMemGb != null && <>)</>}. Tout reste en
            local, dans le dossier de Romanesk — aucun cloud, aucun
            terminal.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => void installEverything()}>
              Installer l'IA locale · moteur +{" "}
              {state.runtime.recommendedChatModel || FALLBACK_CHAT_MODEL}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Continuer sans IA
            </Button>
          </div>
          <p className="border-t border-dotted border-rule pt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
            Tu préfères gérer Ollama toi-même ?{" "}
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-ink"
              onClick={() => {
                void openUrl("https://ollama.com/download");
              }}
            >
              ollama.com
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="underline decoration-dotted underline-offset-2 hover:text-ink"
              onClick={retry}
            >
              j'ai installé, vérifier
            </button>
          </p>
        </>
      )}

      {state.kind === "engine-stopped" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Le moteur IA de Romanesk est installé mais ne tourne pas.
            Relance-le pour retrouver l'atelier IA — ou continue sans, tout
            le reste fonctionne.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => void restartEngine()}>
              Relancer le moteur IA
            </Button>
            <Button size="sm" variant="outline" onClick={retry}>
              Re-vérifier
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Continuer sans IA
            </Button>
          </div>
        </>
      )}

      {state.kind === "no-models" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Le moteur IA tourne, mais aucun modèle n'est encore téléchargé.
            Romanesk peut installer le duo recommandé pour ta machine : un
            modèle de chat pour écrire, un modèle d'embedding pour le RAG
            (questions sur ton lore).
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button size="sm" onClick={() => quickPull(state.runtime)}>
              Télécharger{" "}
              {state.runtime.recommendedChatModel || FALLBACK_CHAT_MODEL} +{" "}
              {DEFAULT_EMBED_MODEL}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Plus tard · continuer sans IA
            </Button>
          </div>
        </>
      )}

      {state.kind === "installing-runtime" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Installation du moteur IA local ({phaseLabel(state.phase)}).
            Ensuite, Romanesk téléchargera les modèles — tout se fait tout
            seul, tu peux continuer à écrire pendant ce temps.
          </p>
          <ProgressBlock
            label="moteur IA"
            pct={
              state.completed != null && state.total != null && state.total > 0
                ? Math.round((state.completed / state.total) * 100)
                : null
            }
            status={state.message}
            completed={state.completed}
            total={state.total}
          />
        </>
      )}

      {state.kind === "pulling" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-ink-soft">
            Téléchargement de <em>{state.model}</em> en cours.
          </p>
          <ProgressBlock
            label={state.model}
            pct={state.pct}
            status={state.status}
            completed={null}
            total={null}
          />
        </>
      )}

      {state.kind === "error" && (
        <>
          <p className="font-body text-[15px] leading-[1.55] text-bordeaux">
            L'installation a échoué : {state.message}
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

function phaseLabel(phase: string): string {
  switch (phase) {
    case "download":
      return "téléchargement";
    case "verify":
      return "vérification";
    case "unpack":
      return "décompression";
    case "done":
      return "terminé";
    default:
      return phase;
  }
}

function ProgressBlock({
  label,
  pct,
  status,
  completed,
  total,
}: {
  label: string;
  pct: number | null;
  status: string;
  completed: number | null;
  total: number | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[3px] border border-dashed border-rule bg-paper p-3">
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        <span>{label}</span>
        <span>{pct != null ? `${pct} %` : status}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-shade">
        <div
          className="h-full bg-bordeaux transition-[width] duration-200"
          style={{ width: pct != null ? `${pct}%` : "12%" }}
        />
      </div>
      <p className="font-body text-[12px] italic text-ink-faint">
        {status}
        {completed != null && total != null && (
          <>
            {" "}
            · {formatMB(completed)} / {formatMB(total)}
          </>
        )}{" "}
        — patience, le téléchargement peut prendre quelques minutes selon
        ta connexion.
      </p>
    </div>
  );
}

function formatMB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function titleFor(state: GateState): string {
  switch (state.kind) {
    case "runtime-missing":
      return "L'IA locale, en un clic";
    case "engine-stopped":
      return "Le moteur IA est en pause";
    case "no-models":
      return "Un modèle, et tu pourras commencer";
    case "installing-runtime":
      return "Installation du moteur IA";
    case "pulling":
      return "Téléchargement en cours";
    case "error":
      return "Installation interrompue";
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
        // Centrage natif du <dialog> — Tailwind preflight écrase margin:auto
        "m-auto",
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
