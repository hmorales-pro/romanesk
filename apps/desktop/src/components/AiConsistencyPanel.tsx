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
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, ShieldAlert, X } from "lucide-react";

import { aiRagQuery, anchorGetForUniverse, type RagSource } from "@/lib/api";
import {
  type RealityAnchor,
  type Story,
  entityTypeLabel,
  realityModeLabel,
} from "@/lib/types";
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

interface ConsistencyResult {
  /** Texte brut de la réponse. Affichage de fallback si le JSON parse fail. */
  answer: string;
  sources: RagSource[];
  /** Si le modèle a joué le jeu du JSON, version typée. */
  parsed: ParsedReport | null;
}

interface ParsedReport {
  verdict: "ok" | "warn" | "error";
  issues: ParsedIssue[];
}

interface ParsedIssue {
  kind: "lore" | "anachronism" | "other";
  severity: "minor" | "major" | "blocker";
  source: string | null;
  evidence: string;
  suggestion: string | null;
}

export function AiConsistencyPanel({
  universeId,
  story,
  chapterTitle,
  body,
}: AiConsistencyPanelProps) {
  const [result, setResult] = useState<ConsistencyResult | null>(null);

  // P5.5 : si l'univers a un RealityAnchor (historical / divergent),
  // on étend la question RAG pour demander aussi les anachronismes.
  // L'anchor est partagé avec la page /u/:id/anchor via la même queryKey.
  const anchorQuery = useQuery({
    queryKey: ["anchor", universeId],
    queryFn: () => anchorGetForUniverse(universeId),
  });
  const anchor = anchorQuery.data ?? null;
  const anachronismMode =
    !!anchor && anchor.mode !== "none" && !!anchor.pivot_date;

  const mutation = useMutation({
    mutationFn: () => {
      const text = collectText(body).trim();
      const tail = lastNWords(text, MAX_CONTEXT_WORDS);
      const question = buildQuestion({
        storyTitle: story.title,
        chapterTitle,
        chapterTail: tail,
        anchor: anachronismMode ? anchor : null,
      });
      return aiRagQuery({ universeId, question, topK: TOP_K });
    },
    onSuccess: (res) => {
      const answer = res.answer.trim();
      setResult({
        answer,
        sources: res.sources,
        parsed: tryParseReport(answer),
      });
    },
  });

  const isEmpty = collectText(body).trim().length === 0;

  // P6.3 : si le modèle a renvoyé un JSON parsable, on prend son verdict
  // typé. Sinon, fallback sur l'heuristique textuelle de P4.6.
  const verdictKind: "ok" | "warn" | "error" | null = result
    ? result.parsed?.verdict ?? classifyVerdict(result.answer)
    : null;

  return (
    // P8.2 — pattern ai-card "you" pour le panneau Cohérence.
    <div className="flex flex-col gap-3 rounded-[3px] border border-dashed border-rule bg-transparent p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          Cohérence
        </span>
        <ShieldAlert className="size-3.5 text-bordeaux" aria-hidden />
        {anachronismMode && anchor && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--ocre)_50%,var(--rule))] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ocre">
            <Clock className="size-3" aria-hidden />
            anachronismes · {realityModeLabel(anchor.mode)} ·{" "}
            {anchor.pivot_date}
          </span>
        )}
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
        <div className="flex flex-col gap-3 rounded-[3px] border border-rule bg-paper p-3">
          <div className="flex items-center gap-2">
            {verdictKind === "ok" ? (
              <CheckCircle2 className="size-4 text-ivy" aria-hidden />
            ) : verdictKind === "error" ? (
              <ShieldAlert className="size-4 text-bordeaux" aria-hidden />
            ) : (
              <ShieldAlert className="size-4 text-ocre" aria-hidden />
            )}
            <span
              className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${
                verdictKind === "ok"
                  ? "text-ivy"
                  : verdictKind === "error"
                    ? "text-bordeaux"
                    : "text-ocre"
              }`}
            >
              {verdictKind === "ok"
                ? "Cohérent"
                : verdictKind === "error"
                  ? "Incohérences majeures"
                  : "À vérifier"}
            </span>
            {result.parsed && (
              <span className="text-xs text-muted-foreground">
                · {result.parsed.issues.length} point(s)
              </span>
            )}
          </div>

          {result.parsed ? (
            <IssueList issues={result.parsed.issues} />
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {result.answer}
            </div>
          )}

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
  anchor: RealityAnchor | null;
}): string {
  const lines: string[] = [];
  lines.push(
    `Vérifie la cohérence du passage suivant avec les fiches de lore de l'univers (histoire « ${args.storyTitle} », chapitre « ${args.chapterTitle ?? "(sans titre)"} »).`,
  );
  lines.push("");
  lines.push(
    "Réponds STRICTEMENT en JSON valide, avec ce schéma exact :",
  );
  lines.push("");
  lines.push(
    '{ "verdict": "ok" | "warn" | "error", "issues": [{ "kind": "lore" | "anachronism" | "other", "severity": "minor" | "major" | "blocker", "source": "<fiche concernée ou élément>", "evidence": "<ce qui pose problème, en une phrase>", "suggestion": "<correction proposée ou null>" }] }',
  );
  lines.push("");
  lines.push(
    "- `verdict` : `ok` si rien à signaler, `warn` si points mineurs, `error` si contradictions majeures.",
  );
  lines.push(
    "- `issues` : tableau vide [] si tout est cohérent. Sinon, un objet par point. Cite chaque fiche par son nom.",
  );
  lines.push(
    "- `kind` : `lore` (incohérence avec une fiche), `anachronism` (objet/concept/expression hors période), `other` (logique narrative).",
  );
  if (args.anchor) {
    const modeLabel =
      args.anchor.mode === "historical"
        ? "respect strict de la réalité historique"
        : "uchronie / divergence assumée";
    lines.push("");
    lines.push(
      `L'univers est ancré au monde réel à la date pivot ${args.anchor.pivot_date} (${modeLabel}, base : ${args.anchor.base_world}). Signale aussi les anachronismes (kind="anachronism").`,
    );
  }
  lines.push("");
  lines.push("Aucun texte autour du JSON. Pas d'explication. Juste l'objet JSON.");
  lines.push("");
  lines.push("PASSAGE :");
  lines.push(args.chapterTail);
  return lines.join("\n");
}

/**
 * Tente de parser un report JSON renvoyé par le modèle. Retourne null si
 * le parse échoue (ou si la structure ne match pas) — le caller bascule
 * alors sur l'affichage texte de fallback.
 */
function tryParseReport(raw: string): ParsedReport | null {
  // Le modèle peut entourer le JSON de boilerplate ; on isole le premier {
  // et le dernier } pour rendre le parse robuste.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  let v: unknown;
  try {
    v = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const verdict = parseVerdict(obj.verdict);
  if (!verdict) return null;
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: ParsedIssue[] = [];
  for (const item of rawIssues) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const evidence =
      typeof it.evidence === "string" ? it.evidence.trim() : "";
    if (!evidence) continue;
    issues.push({
      kind: parseIssueKind(it.kind) ?? "other",
      severity: parseSeverity(it.severity) ?? "minor",
      source: typeof it.source === "string" ? it.source : null,
      evidence,
      suggestion:
        typeof it.suggestion === "string" && it.suggestion.trim().length > 0
          ? it.suggestion.trim()
          : null,
    });
  }
  return { verdict, issues };
}

function parseVerdict(v: unknown): ParsedReport["verdict"] | null {
  if (v === "ok" || v === "warn" || v === "error") return v;
  return null;
}
function parseIssueKind(v: unknown): ParsedIssue["kind"] | null {
  if (v === "lore" || v === "anachronism" || v === "other") return v;
  return null;
}
function parseSeverity(v: unknown): ParsedIssue["severity"] | null {
  if (v === "minor" || v === "major" || v === "blocker") return v;
  return null;
}

function IssueList({ issues }: { issues: ParsedIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="text-sm text-emerald-700 italic">
        Aucune incohérence détectée.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {issues.map((i, idx) => (
        <li
          key={idx}
          className={`rounded-md border p-2 flex flex-col gap-1 ${SEVERITY_BG[i.severity]}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${SEVERITY_BADGE[i.severity]}`}
            >
              {SEVERITY_LABELS[i.severity]}
            </span>
            <span className="text-xs text-muted-foreground">
              {KIND_LABELS[i.kind]}
              {i.source ? ` · ${i.source}` : ""}
            </span>
          </div>
          <p className="text-sm">{i.evidence}</p>
          {i.suggestion && (
            <p className="text-xs italic text-muted-foreground">
              Suggestion : {i.suggestion}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const SEVERITY_LABELS: Record<ParsedIssue["severity"], string> = {
  minor: "Mineur",
  major: "Majeur",
  blocker: "Bloquant",
};
const SEVERITY_BG: Record<ParsedIssue["severity"], string> = {
  minor: "bg-amber-50/40 border-amber-200",
  major: "bg-orange-50/40 border-orange-300",
  blocker: "bg-red-50/40 border-red-300",
};
const SEVERITY_BADGE: Record<ParsedIssue["severity"], string> = {
  minor: "bg-amber-100 text-amber-800",
  major: "bg-orange-100 text-orange-800",
  blocker: "bg-red-100 text-red-800",
};
const KIND_LABELS: Record<ParsedIssue["kind"], string> = {
  lore: "Lore",
  anachronism: "Anachronisme",
  other: "Logique narrative",
};

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
