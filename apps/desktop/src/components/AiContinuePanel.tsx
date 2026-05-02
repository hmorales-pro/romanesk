/**
 * Continuation IA in-editor pour un chapitre (Phase 4.4).
 *
 * Donne à l'utilisateur un bouton « Continuer avec l'IA » qui :
 * 1. Extrait le texte courant du chapitre (avec un fallback sur les ~600
 *    derniers mots pour rester sous une fenêtre de contexte raisonnable).
 * 2. Construit un prompt incluant story + chapter context.
 * 3. Appelle `ai_complete` (Ollama via Tauri).
 * 4. Affiche la suggestion en gris/italique sous l'éditeur.
 * 5. Accepter → ajoute la suggestion comme nouveaux paragraphes au doc Tiptap
 *    via `onAccept`. Rejeter → clear.
 *
 * Note : le RAG sur le lore (passer les entités pertinentes au modèle) est
 * réservé à P4.6 — ici on garde le contexte au chapitre + story pour rester
 * réactif et déterministe.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { aiComplete } from "@/lib/api";
import type { Story } from "@/lib/types";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import type { TiptapDoc } from "@/components/TiptapEditor";

const MAX_CONTEXT_WORDS = 600;
const SYSTEM_PROMPT = `Tu es un romancier francophone expérimenté. On te donne le contexte d'un récit en cours d'écriture (titre, synopsis, dernier passage du chapitre courant). Ta mission : poursuivre le chapitre en restant fidèle au ton, au rythme et au point de vue de l'auteur.

Règles strictes :
- Écris uniquement la suite, en français, en 1 à 3 paragraphes.
- N'introduis pas de meta-commentaire, pas de balise, pas d'explication.
- Ne reprends pas la dernière phrase, enchaîne directement.
- Respecte la temporalité, les personnages et les lieux déjà mentionnés.
- Si le chapitre est vide, ouvre-le par une scène cohérente avec le synopsis.`;

interface AiContinuePanelProps {
  story: Story;
  chapterTitle: string | null;
  body: TiptapDoc;
  onAccept: (paragraphs: string[]) => void;
}

export function AiContinuePanel({
  story,
  chapterTitle,
  body,
  onAccept,
}: AiContinuePanelProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const { pickModel } = useSettings();

  const mutation = useMutation({
    mutationFn: () => {
      const text = collectText(body).trim();
      const tail = lastNWords(text, MAX_CONTEXT_WORDS);
      const userPrompt = buildPrompt({
        storyTitle: story.title,
        storySynopsis: story.synopsis,
        chapterTitle,
        chapterTail: tail,
      });
      return aiComplete({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.8,
        model: pickModel("creative"),
      });
    },
    onSuccess: (res) => {
      setSuggestion(stripBoilerplate(res.content));
    },
  });

  const accept = () => {
    if (!suggestion) return;
    const paragraphs = suggestion
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    onAccept(paragraphs);
    setSuggestion(null);
  };

  const reject = () => {
    setSuggestion(null);
  };

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="size-4 text-amber-600" aria-hidden />
        <span className="text-sm font-medium">Continuation IA</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSuggestion(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Génération…
            </>
          ) : suggestion ? (
            "Régénérer"
          ) : (
            "Continuer avec l'IA"
          )}
        </Button>
        {suggestion && (
          <>
            <Button size="sm" onClick={accept}>
              <Check className="size-4" aria-hidden /> Accepter
            </Button>
            <Button size="sm" variant="ghost" onClick={reject}>
              <X className="size-4" aria-hidden /> Rejeter
            </Button>
          </>
        )}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {suggestion && (
        <div className="rounded-md border bg-background/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Suggestion (non sauvegardée)
          </p>
          <div className="text-sm text-muted-foreground italic whitespace-pre-wrap leading-relaxed">
            {suggestion}
          </div>
        </div>
      )}

      {!suggestion && !mutation.isPending && !mutation.isError && (
        <p className="text-xs text-muted-foreground">
          Le modèle voit le synopsis et les ~{MAX_CONTEXT_WORDS} derniers mots du
          chapitre courant. Il propose 1 à 3 paragraphes que tu peux accepter,
          rejeter, ou régénérer.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (purs — exportés pour les tests unitaires éventuels)
// ---------------------------------------------------------------------------

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  let out = "";
  if (typeof obj.text === "string") out += obj.text;
  if (Array.isArray(obj.content)) {
    // Sépare les nodes block par double-newline pour préserver les paragraphes.
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

function lastNWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= n) return text;
  return "…" + words.slice(words.length - n).join(" ");
}

function buildPrompt(args: {
  storyTitle: string;
  storySynopsis: string | null;
  chapterTitle: string | null;
  chapterTail: string;
}): string {
  const lines: string[] = [];
  lines.push(`HISTOIRE : « ${args.storyTitle} »`);
  if (args.storySynopsis) {
    lines.push(`SYNOPSIS : ${args.storySynopsis}`);
  }
  lines.push("");
  lines.push(
    `CHAPITRE EN COURS : « ${args.chapterTitle ?? "(sans titre)"} »`,
  );
  lines.push("");
  if (args.chapterTail) {
    lines.push("DERNIER PASSAGE :");
    lines.push(args.chapterTail);
    lines.push("");
    lines.push("Continue le chapitre, sans répéter, en 1 à 3 paragraphes.");
  } else {
    lines.push(
      "Le chapitre est vide. Écris un premier passage cohérent avec le synopsis (1 à 3 paragraphes).",
    );
  }
  return lines.join("\n");
}

/**
 * Nettoie quelques boilerplates fréquents que le modèle insère parfois en
 * début de réponse malgré le system prompt (« Voici la suite : », etc.).
 */
function stripBoilerplate(content: string): string {
  let out = content.trim();
  const patterns = [
    /^voici la suite\s*:?\s*/i,
    /^suite du chapitre\s*:?\s*/i,
    /^continuation\s*:?\s*/i,
    /^bien s[uû]r[, ]+/i,
  ];
  for (const re of patterns) {
    out = out.replace(re, "");
  }
  return out.trim();
}
