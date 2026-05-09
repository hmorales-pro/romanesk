/**
 * ModelPullPanel — UI de téléchargement de modèles Ollama (P9.2).
 *
 * Charte § 05 : panel filet 1px paper-deep, Eyebrow mono en haut, suggestions
 * en chips bordeaux, progress bar en filet bordeaux qui se remplit, pas
 * d'animation grossière.
 *
 * Côté UX, on s'abonne à l'event tauri `model-pull-progress` pour afficher
 * une vraie barre proportionnelle (completed/total). Statuts Ollama courants :
 *   - "pulling manifest"
 *   - "downloading <hash>" (avec completed/total — c'est là qu'on a la barre)
 *   - "verifying sha256 digest"
 *   - "writing manifest"
 *   - "removing any unused layers"
 *   - "success"
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";

import {
  aiDeleteModel,
  aiListModels,
  aiPullModel,
  type AiModel,
  type ModelPullProgress,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill } from "@/components/ui/pill";
import { confirmDialog } from "@/lib/dialog";

interface ModelPullPanelProps {
  baseUrl: string;
}

/**
 * Recommandations Romanesk (P13.3) — modèles testés sur l'écriture
 * fictionnelle française et les pipelines map-reduce. Le badge `tag`
 * sert à étiqueter le rôle (chat / RAG / vision / analyse longue).
 *
 * Hugo : « Gemma 4 sorti en 2026 par exemple ». Quand le modèle officiel
 * sortira chez Ollama, il suffira d'ajouter une entrée ici. En attendant
 * Gemma 3 reste un excellent choix — 4 GB, multilingue, instruction-tuned.
 */
interface Suggestion {
  name: string;
  usage: string;
  /** Étiquette courte qui colore le rôle. */
  tag: "chat" | "rag" | "vision" | "long";
}

const SUGGESTIONS: Suggestion[] = [
  {
    name: "gemma3:4b",
    usage: "chat polyvalent · 3 GB · rapide",
    tag: "chat",
  },
  {
    name: "qwen2.5:7b",
    usage: "analyse longue · 4.5 GB · idéal pour l'import map-reduce",
    tag: "long",
  },
  {
    name: "llama3.2:3b",
    usage: "chat équilibré · 2 GB",
    tag: "chat",
  },
  {
    name: "nomic-embed-text:latest",
    usage: "embedding RAG · 270 MB · indispensable",
    tag: "rag",
  },
  {
    name: "llava:7b",
    usage: "vision · atelier description · 4.5 GB",
    tag: "vision",
  },
];

const TAG_LABEL: Record<Suggestion["tag"], string> = {
  chat: "chat",
  rag: "RAG",
  vision: "vision",
  long: "analyse longue",
};

export function ModelPullPanel({ baseUrl }: ModelPullPanelProps) {
  const qc = useQueryClient();
  const [modelName, setModelName] = useState("");
  const [progress, setProgress] = useState<ModelPullProgress | null>(null);

  const modelsQuery = useQuery({
    queryKey: ["models", baseUrl],
    queryFn: () => aiListModels(baseUrl),
    enabled: !!baseUrl.trim(),
  });

  const pullMutation = useMutation({
    mutationFn: (name: string) => aiPullModel(baseUrl, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["models", baseUrl] });
      setProgress(null);
    },
    onError: () => {
      // On garde le dernier event pour montrer où ça a échoué.
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => aiDeleteModel(baseUrl, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["models", baseUrl] });
    },
  });

  // Écoute le stream de progress pendant un pull.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listen<ModelPullProgress>("model-pull-progress", (e) => {
      setProgress(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const startPull = (name: string) => {
    if (!name.trim() || pullMutation.isPending) return;
    setProgress({
      model: name,
      status: "starting…",
      completed: null,
      total: null,
      done: false,
    });
    pullMutation.mutate(name);
  };

  const onDelete = async (name: string) => {
    const ok = await confirmDialog({
      title: `Supprimer le modèle « ${name} » ?`,
      body: "Le modèle sera retiré du disque. Tu pourras toujours le re-télécharger.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(name);
  };

  const installed = modelsQuery.data ?? [];
  const installedNames = new Set(installed.map((m) => m.name));

  // Pourcentage de progression — quand on est en plein download d'une
  // couche, completed/total sont fournis. Sinon on affiche juste le
  // statut texte (manifest, verifying, etc.).
  const pct =
    progress?.completed != null && progress.total != null && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-[3px] border border-rule bg-paper-deep p-5">
      <div className="flex flex-col gap-1">
        <Eyebrow>Modèles · télécharger ou supprimer</Eyebrow>
        <p className="font-body text-[13px] italic leading-snug text-ink-faint">
          Téléchargement direct via Ollama — aucun terminal requis.
        </p>
      </div>

      {/* Saisie + bouton */}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="ex. gemma3:4b, llama3.2:3b, mistral:latest"
          disabled={pullMutation.isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              startPull(modelName);
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => startPull(modelName)}
          disabled={pullMutation.isPending || !modelName.trim()}
        >
          <Download className="size-3.5" aria-hidden />
          {pullMutation.isPending ? "Téléchargement…" : "Télécharger"}
        </Button>
      </div>

      {/* P13.3 — Recommandations Romanesk : on liste les modèles testés
       * (chat / RAG / vision / analyse longue) avec un descriptif court.
       * Cliquer pré-remplit le champ + déclenche le pull si pas installé. */}
      <div className="flex flex-col gap-2">
        <Eyebrow bullet={false}>Recommandés pour Romanesk</Eyebrow>
        <ul className="flex flex-col gap-1">
          {SUGGESTIONS.map((s) => {
            const isInstalled = installedNames.has(s.name);
            return (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => {
                    setModelName(s.name);
                    if (!isInstalled) startPull(s.name);
                  }}
                  disabled={pullMutation.isPending || isInstalled}
                  title={
                    isInstalled
                      ? `${s.name} — déjà installé`
                      : `${s.name} — clic pour télécharger`
                  }
                  className={[
                    "group flex w-full items-center gap-3 rounded-[3px] border px-3 py-2 text-left transition",
                    isInstalled
                      ? "border-ivy/40 bg-paper opacity-70"
                      : "border-rule bg-paper hover:border-bordeaux/40",
                    pullMutation.isPending ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <span className="font-mono text-[12px] text-ink">
                    {s.name}
                  </span>
                  <span className="font-body text-[12px] italic text-ink-faint">
                    {s.usage}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
                        s.tag === "chat"
                          ? "border-bordeaux/50 text-bordeaux"
                          : s.tag === "rag"
                            ? "border-ivy/50 text-ivy"
                            : s.tag === "vision"
                              ? "border-ocre/50 text-ocre"
                              : "border-bordeaux/50 text-bordeaux",
                      ].join(" ")}
                    >
                      {TAG_LABEL[s.tag]}
                    </span>
                    {isInstalled && (
                      <span
                        aria-hidden
                        className="font-mono text-[11px] text-ivy"
                      >
                        ✓
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="font-body text-[12px] italic text-ink-faint">
          Note : Gemma 4 (annoncé par Google pour 2026) sera ajouté ici
          dès qu'il sera disponible sur Ollama. C'est le candidat naturel
          pour remplacer gemma3:4b en chat polyvalent.
        </p>
      </div>

      {/* Barre de progression */}
      {progress && !progress.done && (
        <div className="flex flex-col gap-1.5 rounded-[3px] border border-dashed border-rule bg-paper p-3">
          <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            <span>{progress.model}</span>
            <span>{pct != null ? `${pct} %` : progress.status}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-shade">
            <div
              className="h-full bg-bordeaux transition-[width] duration-200"
              style={{ width: pct != null ? `${pct}%` : "12%" }}
            />
          </div>
          <div className="font-body text-[12px] italic text-ink-faint">
            {progress.status}
            {progress.completed != null && progress.total != null && (
              <>
                {" "}· {formatMB(progress.completed)} / {formatMB(progress.total)}
              </>
            )}
          </div>
        </div>
      )}

      {pullMutation.isError && (
        <p className="font-body text-[13px] italic text-bordeaux">
          {String(pullMutation.error)}
        </p>
      )}

      {/* Liste des modèles installés */}
      {installed.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-dotted border-rule pt-4">
          <Eyebrow bullet={false}>Installés · {installed.length}</Eyebrow>
          <ul className="flex flex-col gap-1">
            {installed.map((m) => (
              <ModelRow
                key={m.name}
                model={m}
                onDelete={() => onDelete(m.name)}
                deleting={deleteMutation.isPending}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  onDelete,
  deleting,
}: {
  model: AiModel;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-[3px] px-2 py-1.5 transition hover:bg-paper-shade/40">
      <span className="font-body text-[14px] text-ink">{model.name}</span>
      <Pill tone="ivy">installé</Pill>
      <span className="ml-auto font-mono text-[10.5px] tracking-[0.06em] text-ink-faint">
        {formatSize(model.sizeBytes)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-ink-faint opacity-0 transition hover:text-bordeaux group-hover:opacity-100 disabled:opacity-30"
        title={`Supprimer ${model.name}`}
        aria-label="Supprimer"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatMB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
