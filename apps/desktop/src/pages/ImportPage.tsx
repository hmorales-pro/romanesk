/**
 * Import d'un écrit existant dans Romanesk (P7.1).
 *
 * Étape 1 (ce sprint) : page minimale avec textarea, bouton « Analyser »
 * qui appelle ai_analyze_import, et preview du JSON brut + récapitulatif
 * par catégorie. Pas encore de checkbox ni de création — viendra en P7.2/P7.3.
 *
 * Le but ici est de valider que l'analyse IA marche correctement avant
 * d'investir dans l'UX cochable.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, FileUp, Loader2, Sparkles } from "lucide-react";

import { aiAnalyzeImport, type ImportAnalysis } from "@/lib/api";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ImportPage() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const { pickModel } = useSettings();

  const mutation = useMutation({
    mutationFn: () => aiAnalyzeImport({ text }),
    onSuccess: setAnalysis,
  });

  const charCount = text.length;
  const overLimit = charCount > 24_000;

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl flex flex-col gap-6">
      <nav>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Bibliothèque
        </Link>
      </nav>

      <header className="flex items-start gap-4">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <FileUp className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Importer un écrit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Colle ici un texte existant (récit, brouillon, notes…). L'IA
            l'analyse, identifie les personnages / lieux / factions /
            objets / concepts / époques / événements / chapitres, et te
            propose de créer un nouvel univers ou d'intégrer à un existant
            (Phase 7.2+).
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Texte à analyser</CardTitle>
          <CardDescription>
            Pour l'instant : copier-coller depuis n'importe quelle source
            (Word, Pages, Notion, PDF…). L'upload .md/.txt/.docx/.pdf
            arrive en P7.4.{" "}
            {pickModel("literal") &&
              `Modèle utilisé : ${pickModel("literal")} (literal).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label htmlFor="import-text" className="sr-only">
            Texte à analyser
          </Label>
          <Textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Colle ton texte ici…"
            className="min-h-[300px] font-mono text-xs"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={
                overLimit ? "text-xs text-amber-700" : "text-xs text-muted-foreground"
              }
            >
              {charCount.toLocaleString("fr-FR")} caractères
              {overLimit && ` · sera tronqué à 24 000`}
            </span>
            <Button
              onClick={() => {
                setAnalysis(null);
                mutation.mutate();
              }}
              disabled={mutation.isPending || text.trim().length === 0}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                  Analyse…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden /> Analyser avec
                  l'IA
                </>
              )}
            </Button>
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {String(mutation.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {analysis && <AnalysisPreview analysis={analysis} />}
    </div>
  );
}

interface PreviewProps {
  analysis: ImportAnalysis;
}

function AnalysisPreview({ analysis }: PreviewProps) {
  const counts = {
    Personnages: analysis.characters.length,
    Lieux: analysis.locations.length,
    Factions: analysis.factions.length,
    Objets: analysis.objects.length,
    Concepts: analysis.concepts.length,
    Époques: analysis.eras.length,
    Événements: analysis.events.length,
    Chapitres: analysis.chapters.length,
  };
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Analyse · {analysis.universe.name}
        </CardTitle>
        <CardDescription>
          {analysis.universe.description ?? "Pas de description."}
          {analysis.isNarrative && analysis.storyTitle && (
            <> · Récit identifié : « {analysis.storyTitle} ».</>
          )}
          {" · "}
          {totalCount} élément(s) extrait(s).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {analysis.truncationWarning && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            ⚠ {analysis.truncationWarning}
          </div>
        )}
        {analysis.parseWarning && (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
            ✗ {analysis.parseWarning}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(counts).map(([label, count]) => (
            <div
              key={label}
              className="rounded-md border p-2 text-center"
            >
              <div className="text-2xl font-semibold">{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent">
            Détail des entités extraites
          </summary>
          <div className="p-3 flex flex-col gap-3 text-sm">
            <Section
              label="Personnages"
              items={analysis.characters.map((c) => ({
                title: c.name,
                subtitle: c.archetype ?? null,
                desc: c.summary ?? null,
              }))}
            />
            <Section
              label="Lieux"
              items={analysis.locations.map((l) => ({
                title: l.name,
                subtitle: l.kind ?? null,
                desc: l.summary ?? null,
              }))}
            />
            <Section
              label="Factions"
              items={analysis.factions.map((f) => ({
                title: f.name,
                subtitle: f.kind ?? null,
                desc: f.summary ?? null,
              }))}
            />
            <Section
              label="Objets"
              items={analysis.objects.map((o) => ({
                title: o.name,
                subtitle: o.kind ?? null,
                desc: o.summary ?? null,
              }))}
            />
            <Section
              label="Concepts"
              items={analysis.concepts.map((c) => ({
                title: c.name,
                subtitle: c.kind ?? null,
                desc: c.summary ?? null,
              }))}
            />
            <Section
              label="Époques"
              items={analysis.eras.map((e) => ({
                title: e.name,
                subtitle:
                  e.startYear != null && e.endYear != null
                    ? `${e.startYear} → ${e.endYear}`
                    : null,
                desc: e.description ?? null,
              }))}
            />
            <Section
              label="Événements"
              items={analysis.events.map((e) => ({
                title: e.name,
                subtitle:
                  e.year != null
                    ? `${e.year}${e.eraName ? ` · ${e.eraName}` : ""}`
                    : (e.eraName ?? null),
                desc: e.description ?? null,
              }))}
            />
            <Section
              label="Chapitres"
              items={analysis.chapters.map((c) => ({
                title: c.title,
                subtitle: `${c.bodyText.split(/\s+/).filter(Boolean).length} mots`,
                desc: c.bodyText.slice(0, 160) + (c.bodyText.length > 160 ? "…" : ""),
              }))}
            />
          </div>
        </details>

        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent">
            JSON brut renvoyé par le modèle
          </summary>
          <pre className="p-3 text-xs whitespace-pre-wrap break-all bg-muted/30 rounded-b-md max-h-[400px] overflow-auto">
            {analysis.rawResponse}
          </pre>
        </details>

        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm">
          <strong>Prochaine étape (P7.2)</strong> : checkboxes par
          entité, sélecteur de cible (nouvel univers / univers existant),
          bouton Importer. Pour l'instant, valide juste que l'analyse
          colle à ton texte.
        </div>
      </CardContent>
    </Card>
  );
}

interface SectionItem {
  title: string;
  subtitle: string | null;
  desc: string | null;
}

function Section({ label, items }: { label: string; items: SectionItem[] }) {
  if (items.length === 0) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </p>
        <p className="text-xs text-muted-foreground italic">— aucun</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label} · {items.length}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="rounded border p-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{it.title}</span>
              {it.subtitle && (
                <span className="text-xs rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                  {it.subtitle}
                </span>
              )}
            </div>
            {it.desc && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {it.desc}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
