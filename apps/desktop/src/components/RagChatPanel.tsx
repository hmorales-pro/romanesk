import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpenCheck, RefreshCw, Send, Sparkles } from "lucide-react";

import { aiRagQuery, aiUniverseReindex, type RagAnswer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  universeId: string;
}

interface QAEntry {
  question: string;
  answer: RagAnswer | null;
  error: string | null;
  pending: boolean;
}

/**
 * Panel Q&A RAG sur la page univers.
 *
 * Phase 3.3 minimaliste : input + bouton Réindexer + historique en
 * mémoire (pas persisté). Pose une question → embed → search_topk →
 * complete avec contexte. Affiche réponse + sources cliquables.
 */
export function RagChatPanel({ universeId }: Props) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAEntry[]>([]);

  const queryMutation = useMutation({
    mutationFn: aiRagQuery,
  });

  const reindexMutation = useMutation({
    mutationFn: aiUniverseReindex,
  });

  const onAsk = () => {
    const q = question.trim();
    if (!q) return;
    const entry: QAEntry = { question: q, answer: null, error: null, pending: true };
    setHistory((h) => [entry, ...h]);
    setQuestion("");
    queryMutation.mutate(
      { universeId, question: q },
      {
        onSuccess: (answer) => {
          setHistory((h) =>
            h.map((e) =>
              e === entry ? { ...e, answer, pending: false } : e,
            ),
          );
        },
        onError: (err) => {
          setHistory((h) =>
            h.map((e) =>
              e === entry
                ? { ...e, error: String(err), pending: false }
                : e,
            ),
          );
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              Demande à l'IA
            </CardTitle>
            <CardDescription>
              Pose une question sur ton univers. L'IA répond en se basant
              sur tes fiches indexées.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reindexMutation.mutate(universeId)}
            disabled={reindexMutation.isPending}
            title="Recalcule les embeddings de toutes les fiches. À refaire après ajout/modif de fiches."
          >
            <RefreshCw
              className={`size-3.5 ${reindexMutation.isPending ? "animate-spin" : ""}`}
              aria-hidden
            />
            {reindexMutation.isPending ? "Indexation…" : "Réindexer"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {reindexMutation.data && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            ✓ {reindexMutation.data.indexedCount} fiche(s) indexée(s) avec{" "}
            <span className="font-mono">{reindexMutation.data.model}</span>
            {reindexMutation.data.dimension > 0 &&
              ` (dim ${reindexMutation.data.dimension})`}
          </p>
        )}
        {reindexMutation.isError && (
          <p className="text-xs text-destructive" role="alert">
            Erreur indexation : {String(reindexMutation.error)}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAsk();
          }}
          className="flex gap-2"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="ex. Qui sont les ennemis d'Aldric ? Décris-moi Bren."
            className="flex-1"
            disabled={queryMutation.isPending}
          />
          <Button
            type="submit"
            size="default"
            disabled={queryMutation.isPending || !question.trim()}
          >
            <Send className="size-4" aria-hidden />
            {queryMutation.isPending ? "…" : "Envoyer"}
          </Button>
        </form>

        {history.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Pas encore de question. Astuce : commence par cliquer
            « Réindexer » pour que l'IA voie tes fiches.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {history.map((entry, i) => (
            <QABlock key={i} entry={entry} universeId={universeId} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QABlock({ entry, universeId }: { entry: QAEntry; universeId: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3 flex flex-col gap-2">
      <p className="text-sm font-medium">{entry.question}</p>
      {entry.pending && (
        <p className="text-sm text-muted-foreground italic">L'IA réfléchit…</p>
      )}
      {entry.error && (
        <p className="text-sm text-destructive" role="alert">
          {entry.error}
        </p>
      )}
      {entry.answer && (
        <>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {entry.answer.answer}
          </p>
          {entry.answer.sources.length > 0 && (
            <div className="flex flex-col gap-1 pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <BookOpenCheck className="size-3" aria-hidden /> Sources
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {entry.answer.sources.map((s) => (
                  <li key={s.entityId}>
                    <Link
                      to={`/u/${universeId}/e/${s.entityId}`}
                      className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground hover:border-primary"
                      title={`Score ${s.score.toFixed(3)} · ${s.snippet}`}
                    >
                      {s.entityName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground font-mono pt-1">
            chat: {entry.answer.usedModelChat} · embed: {entry.answer.usedModelEmbed}
          </p>
        </>
      )}
    </div>
  );
}
