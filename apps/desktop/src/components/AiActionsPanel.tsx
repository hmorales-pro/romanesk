/**
 * Palette d'actions IA sur le chapitre courant (Phase 4.5).
 *
 * Trois actions, toutes prompt-templated, toutes via `ai_complete` :
 * - **Résumer** : produit un résumé court (3-5 phrases) du chapitre.
 * - **Réécrire** : prend une instruction libre (« plus court », « plus
 *   tendu », « plus contemplatif »…) et propose une version réécrite.
 *   L'utilisateur peut « Remplacer le chapitre » (avec confirm) si le
 *   résultat lui plaît, ou juste copier.
 * - **Brainstorm** : propose 3 directions narratives pour la suite,
 *   numérotées et concises.
 *
 * Toutes les sorties sont affichées en panel grisé non-destructif —
 * l'IA n'écrit jamais directement dans le doc Tiptap, sauf via le bouton
 * « Remplacer le chapitre » de la réécriture (avec confirmation).
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ClipboardCopy,
  Lightbulb,
  Loader2,
  Pencil,
  Replace,
  ScrollText,
  Sparkles,
  X,
} from "lucide-react";

import { aiComplete } from "@/lib/api";
import type { Story } from "@/lib/types";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TiptapDoc } from "@/components/TiptapEditor";

type ActionKind = "summarize" | "rewrite" | "brainstorm";

interface AiActionsPanelProps {
  story: Story;
  chapterTitle: string | null;
  body: TiptapDoc;
  onReplaceBody: (paragraphs: string[]) => void;
}

interface RunArgs {
  kind: ActionKind;
  instruction?: string;
}

interface RunResult {
  kind: ActionKind;
  text: string;
  /** Vrai pour rewrite — autorise « Remplacer le chapitre ». */
  replaceable: boolean;
}

export function AiActionsPanel({
  story,
  chapterTitle,
  body,
  onReplaceBody,
}: AiActionsPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const { pickModel } = useSettings();

  const mutation = useMutation({
    mutationFn: async ({ kind, instruction: instr }: RunArgs) => {
      const text = collectText(body).trim();
      const userPrompt = buildPrompt({
        kind,
        storyTitle: story.title,
        storySynopsis: story.synopsis,
        chapterTitle,
        chapterText: text,
        instruction: instr,
      });
      // brainstorm = créatif (divergence), rewrite/summarize = littéral.
      const modelKind: "creative" | "literal" =
        kind === "brainstorm" ? "creative" : "literal";
      const res = await aiComplete({
        system: SYSTEM_PROMPTS[kind],
        user: userPrompt,
        temperature: kind === "brainstorm" ? 0.9 : 0.7,
        model: pickModel(modelKind),
      });
      return { kind, text: res.content.trim(), replaceable: kind === "rewrite" } as RunResult;
    },
    onSuccess: setResult,
  });

  const run = (kind: ActionKind) => {
    setResult(null);
    if (kind === "rewrite" && !instruction.trim()) {
      // Bloque la réécriture sans instruction (sinon le modèle invente).
      return;
    }
    mutation.mutate({ kind, instruction: instruction.trim() || undefined });
  };

  const copy = () => {
    if (result) void navigator.clipboard.writeText(result.text);
  };

  const replace = () => {
    if (!result) return;
    if (
      !window.confirm(
        "Remplacer le contenu du chapitre par cette réécriture ? (annulable via Annuler tant que tu n'as pas sauvé)",
      )
    ) {
      return;
    }
    const paragraphs = result.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    onReplaceBody(paragraphs);
    setResult(null);
  };

  const isEmpty = collectText(body).trim().length === 0;
  const rewriteDisabled = mutation.isPending || isEmpty || !instruction.trim();
  const otherDisabled = mutation.isPending || isEmpty;

  return (
    // P8.2 — pattern ai-card "you" charte § 05.
    <div className="flex flex-col gap-3 rounded-[3px] border border-dashed border-rule bg-transparent p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          IA · Actions
        </span>
        <Sparkles className="size-3.5 text-bordeaux" aria-hidden />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Instruction de réécriture (ex. « plus court », « plus tendu », « au passé simple »)"
          disabled={mutation.isPending}
        />
        <Button
          size="sm"
          onClick={() => run("rewrite")}
          disabled={rewriteDisabled}
          title={
            isEmpty
              ? "Écris d'abord quelques lignes"
              : !instruction.trim()
                ? "Donne une instruction"
                : "Réécrire le chapitre"
          }
        >
          <Pencil className="size-4" aria-hidden /> Réécrire
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => run("summarize")}
          disabled={otherDisabled}
        >
          <ScrollText className="size-4" aria-hidden /> Résumer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run("brainstorm")}
          disabled={otherDisabled}
        >
          <Lightbulb className="size-4" aria-hidden /> 3 directions narratives
        </Button>
        {mutation.isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Génération…
          </span>
        )}
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          Le chapitre est vide. Écris quelques lignes pour activer ces actions.
        </p>
      )}

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {result && (
        <div className="rounded-[3px] border border-rule bg-paper p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
              {ACTION_LABELS[result.kind]}
            </p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={copy}
                title="Copier dans le presse-papier"
              >
                <ClipboardCopy className="size-3.5" aria-hidden /> Copier
              </Button>
              {result.replaceable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={replace}
                  title="Remplacer le contenu du chapitre"
                >
                  <Replace className="size-3.5" aria-hidden /> Remplacer le chapitre
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResult(null)}
                title="Fermer"
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground italic whitespace-pre-wrap leading-relaxed">
            {result.text}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<ActionKind, string> = {
  summarize: "Résumé",
  rewrite: "Réécriture",
  brainstorm: "Pistes pour la suite",
};

const SYSTEM_PROMPTS: Record<ActionKind, string> = {
  summarize: `Tu es un éditeur littéraire francophone. Tu reçois un chapitre en cours d'écriture, tu produis un résumé court (3 à 5 phrases) qui capture l'intrigue, le point de vue et le ton. Pas de meta-commentaire, juste le résumé.`,
  rewrite: `Tu es un romancier francophone expérimenté. Tu reçois un chapitre et une instruction de réécriture. Tu produis une nouvelle version du chapitre qui applique l'instruction sans dénaturer l'intrigue ni les personnages. Réponds uniquement avec le texte réécrit, structuré en paragraphes (séparés par des doubles retours à la ligne). Pas d'introduction, pas de commentaire.`,
  brainstorm: `Tu es un romancier francophone et un sparring partner créatif. Tu reçois un chapitre. Tu proposes 3 directions narratives possibles pour la suite, numérotées de 1 à 3. Chaque direction tient en 2-3 phrases : ce qui se passe, l'enjeu pour les personnages, l'effet recherché. Sois concis et concret.`,
};

function buildPrompt(args: {
  kind: ActionKind;
  storyTitle: string;
  storySynopsis: string | null;
  chapterTitle: string | null;
  chapterText: string;
  instruction?: string;
}): string {
  const lines: string[] = [];
  lines.push(`HISTOIRE : « ${args.storyTitle} »`);
  if (args.storySynopsis) lines.push(`SYNOPSIS : ${args.storySynopsis}`);
  lines.push(`CHAPITRE : « ${args.chapterTitle ?? "(sans titre)"} »`);
  lines.push("");
  lines.push("TEXTE DU CHAPITRE :");
  lines.push(args.chapterText || "(vide)");
  lines.push("");
  switch (args.kind) {
    case "summarize":
      lines.push("Produis un résumé court (3 à 5 phrases) de ce chapitre.");
      break;
    case "rewrite":
      lines.push(
        `Réécris ce chapitre en appliquant l'instruction suivante : « ${args.instruction ?? ""} ».`,
      );
      lines.push("Réponds uniquement avec le texte réécrit (paragraphes).");
      break;
    case "brainstorm":
      lines.push(
        "Propose 3 directions narratives possibles pour la suite, numérotées de 1 à 3.",
      );
      break;
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers (dupliqué de AiContinuePanel pour éviter le couplage — petit
// helper pur, pas la peine de factoriser un module à part avant qu'il
// n'apparaisse une 3e fois).
// ---------------------------------------------------------------------------

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  let out = "";
  if (typeof obj.text === "string") out += obj.text;
  if (Array.isArray(obj.content)) {
    const isBlockNode =
      typeof obj.type === "string" &&
      ["paragraph", "heading", "blockquote", "listItem"].includes(obj.type);
    for (const child of obj.content) {
      out += collectText(child);
    }
    if (isBlockNode) out += "\n\n";
  }
  return out;
}
