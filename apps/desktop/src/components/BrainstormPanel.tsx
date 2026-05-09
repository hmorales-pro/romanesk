/**
 * Panel de brainstorm transversal pour un univers (Phase 5.4).
 *
 * Trois modes :
 * - **Scènes** : 5 idées de scènes potentielles, rattachées à l'univers
 *   et (si sélectionnée) à une story.
 * - **Dilemmes** : 3 dilemmes moraux pour les personnages, qui obligent
 *   à choisir entre deux valeurs incompatibles.
 * - **Twists** : 3 retournements narratifs surprenants mais cohérents
 *   avec les fiches de lore existantes.
 *
 * Le contexte envoyé au modèle inclut : nom + description de l'univers,
 * (optionnel) titre + synopsis d'une story sélectionnée. Pas de RAG ici
 * volontairement — c'est de la divergence créative, on cherche à éviter
 * que le modèle se rattache aux fiches existantes.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ClipboardCopy,
  Lightbulb,
  Loader2,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";

import { aiComplete, storyListInUniverse, universeGet } from "@/lib/api";
import { writeToClipboard } from "@/lib/clipboard";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";

type Mode = "scenes" | "dilemmas" | "twists";

interface BrainstormPanelProps {
  universeId: string;
}

export function BrainstormPanel({ universeId }: BrainstormPanelProps) {
  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId),
  });
  const storiesQuery = useQuery({
    queryKey: ["stories", universeId],
    queryFn: () => storyListInUniverse(universeId),
  });

  const [storyId, setStoryId] = useState<string>("");
  const [result, setResult] = useState<{ mode: Mode; text: string } | null>(
    null,
  );
  const { pickModel } = useSettings();

  const mutation = useMutation({
    mutationFn: async (mode: Mode) => {
      const universe = universeQuery.data;
      const stories = storiesQuery.data ?? [];
      const story = storyId ? stories.find((s) => s.id === storyId) : null;

      const userPrompt = buildPrompt({
        mode,
        universeName: universe?.name ?? "Univers",
        universeDescription: universe?.description ?? null,
        storyTitle: story?.title ?? null,
        storySynopsis: story?.synopsis ?? null,
      });

      const res = await aiComplete({
        system: SYSTEM_PROMPTS[mode],
        user: userPrompt,
        temperature: 0.95,
        maxTokens: 1200,
        model: pickModel("creative"),
      });
      return { mode, text: res.content.trim() };
    },
    onSuccess: setResult,
  });

  const copy = () => {
    if (result) void writeToClipboard(result.text);
  };

  return (
    <section className="rounded-md border border-dashed bg-muted/30 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Wand2 className="size-5 text-fuchsia-600" aria-hidden />
        <h2 className="text-base font-semibold">Brainstorm</h2>
        <span className="text-xs text-muted-foreground">
          IA en sparring partner — divergence créative, pas de RAG
        </span>
      </div>

      {(storiesQuery.data ?? []).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label
            htmlFor="bs-story"
            className="text-sm text-muted-foreground"
          >
            Cibler une histoire :
          </label>
          <select
            id="bs-story"
            value={storyId}
            onChange={(e) => setStoryId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Univers entier —</option>
            {(storiesQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setResult(null);
            mutation.mutate("scenes");
          }}
          disabled={mutation.isPending}
        >
          <Sparkles className="size-4" aria-hidden /> 5 scènes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setResult(null);
            mutation.mutate("dilemmas");
          }}
          disabled={mutation.isPending}
        >
          <Zap className="size-4" aria-hidden /> 3 dilemmes
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setResult(null);
            mutation.mutate("twists");
          }}
          disabled={mutation.isPending}
        >
          <Lightbulb className="size-4" aria-hidden /> 3 twists
        </Button>
        {mutation.isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Génération…
          </span>
        )}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {result && (
        <div className="rounded-md border bg-background/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {MODE_LABELS[result.mode]}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={copy}>
                <ClipboardCopy className="size-3.5" aria-hidden /> Copier
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResult(null)}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {result.text}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<Mode, string> = {
  scenes: "5 idées de scènes",
  dilemmas: "3 dilemmes moraux",
  twists: "3 twists narratifs",
};

const SYSTEM_PROMPTS: Record<Mode, string> = {
  scenes: `Tu es un sparring partner créatif francophone pour un romancier. On te donne le contexte d'un univers fictionnel (et éventuellement d'une histoire). Tu proposes 5 idées de scènes potentielles, numérotées de 1 à 5, chacune en 2-3 phrases : situation, personnages impliqués, enjeu, ambiance. Sois concret, varié (registre intime / d'action / révélation / suspense / contemplation), et évite les clichés.`,
  dilemmas: `Tu es un sparring partner créatif francophone pour un romancier. On te donne le contexte d'un univers fictionnel. Tu proposes 3 dilemmes moraux qui obligent un personnage à choisir entre deux valeurs incompatibles, sans bonne réponse évidente. Pour chaque dilemme : la situation, les deux options, le coût de chacune. 2-3 phrases par dilemme, numérotés.`,
  twists: `Tu es un sparring partner créatif francophone pour un romancier. On te donne le contexte d'un univers fictionnel. Tu proposes 3 retournements narratifs surprenants mais cohérents avec le ton et les enjeux décrits. Pour chaque twist : ce qui était cru, ce qu'il en est vraiment, l'effet sur l'intrigue. 2-3 phrases par twist, numérotés.`,
};

function buildPrompt(args: {
  mode: Mode;
  universeName: string;
  universeDescription: string | null;
  storyTitle: string | null;
  storySynopsis: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`UNIVERS : « ${args.universeName} »`);
  if (args.universeDescription) {
    lines.push(`DESCRIPTION : ${args.universeDescription}`);
  }
  if (args.storyTitle) {
    lines.push("");
    lines.push(`HISTOIRE CIBLÉE : « ${args.storyTitle} »`);
    if (args.storySynopsis) {
      lines.push(`SYNOPSIS : ${args.storySynopsis}`);
    }
  }
  lines.push("");
  switch (args.mode) {
    case "scenes":
      lines.push("Propose 5 idées de scènes potentielles.");
      break;
    case "dilemmas":
      lines.push("Propose 3 dilemmes moraux pour les personnages.");
      break;
    case "twists":
      lines.push("Propose 3 retournements narratifs.");
      break;
  }
  return lines.join("\n");
}
