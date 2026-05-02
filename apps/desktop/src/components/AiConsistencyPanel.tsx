/**
 * Détection d'incohérences entre un chapitre et le lore de l'univers
 * (Phase 4.6).
 *
 * Réutilise `ai_rag_query` (déjà branché à l'index embeddings du lore en
 * P3.3) en envoyant le passage du chapitre comme contexte de question.
 * Pas besoin de nouveau backend : on demande au modèle de croiser le
 * passage avec les fiches retrouvées par similarité, et de lister les
 * incohérences (ou de confirmer la cohérence).
 *
 * UX
 * - Bouton « Vérifier la cohérence avec le lore ».
 * - Spinner pendant la requête (RAG = embedding + retrieval + génération,
 *   peut prendre 5-10s sur Ollama local).
 * - Résultat : verdict du modèle + liste des fiches de lore consultées
 *   (chacune cliquable, navigue vers la fiche dans un nouvel onglet logique).
 * - Si l'index n'est pas construit, le backend renvoie une erreur
 *   compréhensible — relayée telle quelle dans l'UI.
 *
 * Limite assumée : les chapitres très longs sont tronqués aux ~600 derniers
 * mots côté front (cohérent avec AiContinuePanel) pour rester sous une
 * fenêtre de contexte raisonnable. La détection complète d'un chapitre
 * de roman peut nécessiter un découpage en passes — réservé à P4.x.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldAlert, X } from "lucide-react";

import { aiRagQuery, type RagSource } from "@/lib/api";
import { type Story, entityTypeLabel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import type { TiptapDoc } from "@/components/TiptapEditor";

const MAX_CONTEXT_WORDS = 600;
const TOP_K = 6;

interface AiConsistencyPanelProps {
  universeId: string;
  story: Story;
  chapterTitle: string | null;
  body: TiptapDoc;
}

export function AiConsistencyPanel({
  universeId,
  story,
  chapterTitle,
  body,
}: AiConsistencyPanelProps) {
  const [result, setResult] = useState<{
    answer: string;
    sources: RagSource[];
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const text = collectText(body).trim();
      const tail = lastNWords(text, MAX_CONTEXT_WORDS);
      const question = buildQuestion({
        storyTitle: story.title,
        chapterTitle,
        chapterTail: tail,
      });
      return aiRagQuery({ universeId, question, topK: TOP_K });
    },
    onSuccess: (res) => {
      setResult({ answer: res.answer.trim(), sources: res.sources });
    },
  });

  const isEmpty = collectText(body).trim().length === 0;

  // Heuristique d'affichage : si la réponse contient « cohérent »,
  // « aucune incohérence », « pas de contradiction » et pas « mais »,
  // on affiche un badge vert. Sinon, badge orange.
  const verdictKind = result ? classifyVerdict(result.answer) : null;

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldAlert className="size-4 text-blue-600" aria-hidden />
        <span className="text-sm font-medium">Cohérence avec le lore</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setResult(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending || isEmpty}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Analyse…
            </>
          ) : result ? (
            "Re-vérifier"
          ) : (
            "Vérifier la cohérence"
          )}
        </Button>
        {result && (
          <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          Le chapitre est vide — rien à vérifier.
        </p>
      )}

      {!isEmpty && !result && !mutation.isPending && !mutation.isError && (
        <p className="text-xs text-muted-foreground">
          Croise le passage avec les {TOP_K} fiches de lore les plus
          similaires (embeddings) et demande au modèle de signaler
          d'éventuelles incohérences (âge, lieu, relations, événements).
          Pense à indexer ton univers depuis l'onglet RAG si ce n'est pas
          encore fait.
        </p>
      )}

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {result && (
        <div className="rounded-md border bg-background/60 p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {verdictKind === "ok" ? (
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            ) : (
              <ShieldAlert className="size-4 text-amber-600" aria-hidden />
            )}
            <span
              className={`text-xs font-medium uppercase tracking-wide ${
                verdictKind === "ok" ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {verdictKind === "ok" ? "Cohérent" : "À vérifier"}
            </span>
          </div>

          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {result.answer}
          </div>

          {result.sources.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Fiches consultées
              </p>
              <ul className="flex flex-col gap-1">
                {result.sources.map((s) => (
                  <li key={`${s.entityId}-${s.score}`} className="text-xs">
                    <Link
                      to={`/u/${universeId}/e/${s.entityId}`}
                      className="text-foreground hover:underline font-medium"
                      target="_blank"
                      rel="noopener"
                    >
                      {s.entityName}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      · {entityTypeLabel(s.entityType)} · score{" "}
                      {s.score.toFixed(2)}
                    </span>
                    {s.snippet && (
                      <p className="text-muted-foreground italic line-clamp-2">
                        {s.snippet}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers (purs)
// ---------------------------------------------------------------------------

function buildQuestion(args: {
  storyTitle: string;
  chapterTitle: string | null;
  chapterTail: string;
}): string {
  return [
    `Vérifie la cohérence du passage suivant avec les fiches de lore de l'univers (histoire « ${args.storyTitle} », chapitre « ${args.chapterTitle ?? "(sans titre)"} »).`,
    "",
    "Liste les éventuelles incohérences (âges, lieux, relations, événements, traits, dates). Cite la fiche concernée pour chaque point.",
    "Si tout est cohérent, écris clairement : « Aucune incohérence détectée. »",
    "",
    "PASSAGE :",
    args.chapterTail,
  ].join("\n");
}

function classifyVerdict(answer: string): "ok" | "warn" {
  const a = answer.toLowerCase();
  const positiveSignals = [
    "aucune incohérence",
    "pas d'incohérence",
    "pas de contradiction",
    "tout est cohérent",
    "le passage est cohérent",
    "rien à signaler",
  ];
  const hasPositive = positiveSignals.some((s) => a.includes(s));
  // « Mais »/« cependant » → on suppose qu'il y a une nuance.
  const hasButCaveat = /\b(mais|cependant|toutefois|néanmoins)\b/.test(a);
  return hasPositive && !hasButCaveat ? "ok" : "warn";
}

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

function lastNWords(text: string, n: number): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= n) return text;
  return "…" + words.slice(words.length - n).join(" ");
}
