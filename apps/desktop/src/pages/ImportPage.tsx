/**
 * Import d'un écrit existant dans Romanesk (P7.1 / P7.2 / P7.3).
 *
 * Flow :
 * 1. Coller du texte (ou upload .md/.txt — P7.4 ajoutera .docx/.pdf).
 * 2. Cliquer « Analyser » → ai_analyze_import.
 * 3. Choisir cible (nouvel univers / univers existant).
 * 4. Cocher les entités à importer (par défaut tout coché).
 * 5. Cliquer « Importer » → import_apply, redirection vers /u/:id.
 *
 * Le merge dans un univers existant skippe les entités dont le nom existe
 * déjà (case-insensitive). Toggle « Forcer la création des doublons »
 * pour outrepasser.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Loader2,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";

import { ImportProgressOverlay } from "@/components/ImportProgressOverlay";
import {
  aiAnalyzeImport,
  aiAnalyzeImportStream,
  aiRagQuery,
  importApply,
  universeList,
  type ImportAnalysis,
  type ImportResult,
  type ImportTarget,
  type RagAnswer,
} from "@/lib/api";
import { extractText, detectFormat } from "@/lib/import-extract";
import type { Universe } from "@/lib/types";
import { entityTypeLabel } from "@/lib/types";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SelectionMap = Record<string, boolean>;
const CATEGORIES = [
  "characters",
  "locations",
  "factions",
  "objects",
  "concepts",
  "eras",
  "events",
  "chapters",
] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * Seuil au-delà duquel on bascule sur le pipeline map-reduce streaming
 * (P13.1). En dessous, single-shot direct — c'est plus rapide et plus
 * fiable parce que tout le contexte tient dans le modèle.
 */
const IMPORT_LONG_THRESHOLD = 8_000;

const CATEGORY_LABELS: Record<Category, string> = {
  characters: "Personnages",
  locations: "Lieux",
  factions: "Factions",
  objects: "Objets",
  concepts: "Concepts",
  eras: "Époques",
  events: "Événements",
  chapters: "Chapitres",
};

export default function ImportPage() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importedTargetMode, setImportedTargetMode] = useState<
    "new" | "existing" | null
  >(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const { pickModel } = useSettings();

  // Sélections par catégorie : Map<index → bool>. Par défaut tout coché.
  const [selections, setSelections] = useState<Record<Category, SelectionMap>>(
    () =>
      CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: {} }),
        {} as Record<Category, SelectionMap>,
      ),
  );

  // Cible : nouvel univers (default) ou existant.
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [newUniverseName, setNewUniverseName] = useState("");
  const [newUniverseDesc, setNewUniverseDesc] = useState("");
  // P13.4 — titre de l'histoire à créer (si analysis.isNarrative). Pré-rempli
  // depuis analysis.storyTitle au succès de l'analyse, l'utilisateur peut
  // l'éditer avant l'import.
  const [storyTitleOverride, setStoryTitleOverride] = useState("");
  const [existingUniverseId, setExistingUniverseId] = useState("");
  const [forceDuplicates, setForceDuplicates] = useState(false);

  const universesQuery = useQuery({
    queryKey: ["universes"],
    queryFn: universeList,
  });

  const analyzeMutation = useMutation({
    // P13.1 — au-delà de IMPORT_LONG_THRESHOLD on bascule sur le pipeline
    // map-reduce streaming. En dessous (textes courts), single-shot — moins
    // d'overhead, résultat plus fiable parce que tout le contexte tient.
    mutationFn: () => {
      const args = {
        text,
        targetUniverseName:
          targetMode === "existing"
            ? universesQuery.data?.find((u) => u.id === existingUniverseId)?.name
            : undefined,
      };
      return text.length > IMPORT_LONG_THRESHOLD
        ? aiAnalyzeImportStream(args)
        : aiAnalyzeImport(args);
    },
    onSuccess: (a) => {
      setAnalysis(a);
      // Re-init les sélections : tout coché par défaut.
      const init: Record<Category, SelectionMap> = CATEGORIES.reduce(
        (acc, c) => ({ ...acc, [c]: {} }),
        {} as Record<Category, SelectionMap>,
      );
      for (const c of CATEGORIES) {
        const items = (a as unknown as Record<string, unknown[]>)[c] ?? [];
        for (let i = 0; i < items.length; i++) init[c][String(i)] = true;
      }
      setSelections(init);
      // Pré-remplit le nom du nouvel univers.
      if (a.universe.name && !newUniverseName) {
        setNewUniverseName(a.universe.name);
      }
      // P13.4 — pré-remplit le titre proposé par l'IA pour l'histoire.
      if (a.storyTitle && !storyTitleOverride) {
        setStoryTitleOverride(a.storyTitle);
      }
      if (a.universe.description && !newUniverseDesc) {
        setNewUniverseDesc(a.universe.description);
      }
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!analysis) throw new Error("Analyse manquante");
      const target: ImportTarget =
        targetMode === "new"
          ? {
              kind: "newUniverse",
              name: newUniverseName.trim() || analysis.universe.name,
              description: newUniverseDesc.trim() || undefined,
            }
          : { kind: "existingUniverse", id: existingUniverseId };
      return importApply({
        analysis: {
          characters: filterByIdx(analysis.characters, selections.characters),
          locations: filterByIdx(analysis.locations, selections.locations),
          factions: filterByIdx(analysis.factions, selections.factions),
          objects: filterByIdx(analysis.objects, selections.objects),
          concepts: filterByIdx(analysis.concepts, selections.concepts),
          eras: filterByIdx(analysis.eras, selections.eras),
          events: filterByIdx(analysis.events, selections.events),
          chapters: filterByIdx(analysis.chapters, selections.chapters),
          // P13.4 — l'utilisateur peut surcharger le titre proposé par l'IA.
          storyTitle:
            storyTitleOverride.trim() || analysis.storyTitle,
          isNarrative: analysis.isNarrative,
        },
        target,
        forceDuplicates,
      });
    },
    onSuccess: (res) => {
      // P7.5 : on reste sur ImportPage avec un récap pour permettre la
      // vérification de cohérence + éviter la navigation hors flow.
      setImportResult(res);
      setImportedTargetMode(targetMode);
    },
  });

  // P7.4 : extraction texte pour .md / .txt / .docx / .pdf via lazy imports.
  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setExtractError(null);
    if (!detectFormat(file)) {
      setExtractError(
        `Format non supporté : ${file.name}. Accepte .md, .txt, .docx, .pdf.`,
      );
      return;
    }
    setExtracting(true);
    try {
      const content = await extractText(file);
      setText(content);
      setAnalysis(null);
      setImportResult(null);
    } catch (err) {
      setExtractError(`Échec de l'extraction : ${String(err)}`);
    } finally {
      setExtracting(false);
    }
  };

  // Selection helpers.
  const toggle = (cat: Category, idx: number) =>
    setSelections((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [String(idx)]: !prev[cat][String(idx)] },
    }));
  const toggleAllCat = (cat: Category, value: boolean) => {
    if (!analysis) return;
    const items = (analysis as unknown as Record<string, unknown[]>)[cat] ?? [];
    const next: SelectionMap = {};
    for (let i = 0; i < items.length; i++) next[String(i)] = value;
    setSelections((prev) => ({ ...prev, [cat]: next }));
  };

  const charCount = text.length;
  // P13.1 — au-delà de IMPORT_LONG_THRESHOLD chars, on bascule sur le
  // pipeline streaming (map-reduce avec chunks de 10K). Plus de truncate
  // à 24K — on couvre tout le texte par fragments.
  const willStream = charCount > IMPORT_LONG_THRESHOLD;
  const canImport =
    !!analysis &&
    !applyMutation.isPending &&
    (targetMode === "new"
      ? !!(newUniverseName.trim() || analysis.universe.name)
      : !!existingUniverseId);

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
            Colle un texte (récit, brouillon, notes…). L'IA l'analyse et te
            propose de créer un nouvel univers ou d'intégrer à un existant.
          </p>
        </div>
      </header>

      {/* 1) Saisie du texte */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Texte source</CardTitle>
          <CardDescription>
            Copier-coller depuis n'importe quelle source (Word, Pages,
            Notion, PDF…) ou upload .md/.txt.{" "}
            {pickModel("literal") &&
              `Modèle : ${pickModel("literal")} (literal).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".md,.txt,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                void onFileChange(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="inline-flex items-center justify-center gap-1 h-9 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:bg-accent"
            >
              {extracting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                  Extraction…
                </>
              ) : (
                <>
                  <Upload className="size-3.5" aria-hidden /> Charger un
                  fichier (.md / .txt / .docx / .pdf)
                </>
              )}
            </label>
          </div>
          {extractError && (
            <p className="text-sm text-destructive" role="alert">
              {extractError}
            </p>
          )}
          <Label htmlFor="import-text" className="sr-only">
            Texte à analyser
          </Label>
          <Textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Colle ton texte ici…"
            className="min-h-[240px] font-mono text-xs"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={
                willStream
                  ? "text-xs text-bordeaux"
                  : "text-xs text-muted-foreground"
              }
            >
              {charCount.toLocaleString("fr-FR")} caractères
              {willStream &&
                ` · texte long → analyse fragmentée (5–10 min selon le modèle)`}
            </span>
            <Button
              onClick={() => {
                setAnalysis(null);
                analyzeMutation.mutate();
              }}
              disabled={
                analyzeMutation.isPending || text.trim().length === 0
              }
            >
              {analyzeMutation.isPending ? (
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
          {analyzeMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {String(analyzeMutation.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2) Cible */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Destination</CardTitle>
            <CardDescription>
              Crée un nouvel univers à partir du texte, ou ajoute les
              fiches détectées à un univers existant.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="target"
                  value="new"
                  checked={targetMode === "new"}
                  onChange={() => setTargetMode("new")}
                />
                Nouvel univers
              </label>
              {targetMode === "new" && (
                <div className="ml-6 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-uni-name">Nom *</Label>
                    <Input
                      id="new-uni-name"
                      value={newUniverseName}
                      onChange={(e) => setNewUniverseName(e.target.value)}
                      placeholder={analysis.universe.name}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-uni-desc">Description</Label>
                    <Input
                      id="new-uni-desc"
                      value={newUniverseDesc}
                      onChange={(e) => setNewUniverseDesc(e.target.value)}
                      placeholder={analysis.universe.description ?? ""}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="target"
                  value="existing"
                  checked={targetMode === "existing"}
                  onChange={() => setTargetMode("existing")}
                  disabled={(universesQuery.data ?? []).length === 0}
                />
                Univers existant
                {(universesQuery.data ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    (aucun univers pour l'instant)
                  </span>
                )}
              </label>
              {targetMode === "existing" && (
                <div className="ml-6 flex flex-col gap-2">
                  <select
                    value={existingUniverseId}
                    onChange={(e) => setExistingUniverseId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— Sélectionne un univers —</option>
                    {(universesQuery.data ?? []).map((u: Universe) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={forceDuplicates}
                      onChange={(e) => setForceDuplicates(e.target.checked)}
                    />
                    Forcer la création même si un nom existe déjà
                  </label>
                  {!forceDuplicates && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Par défaut, les fiches dont le nom existe déjà sont
                      skippées.
                    </p>
                  )}
                </div>
              )}

              {/* P13.4 — titre de l'histoire (commun aux deux modes,
               * conditionné à isNarrative). Pré-rempli depuis
               * analysis.storyTitle, librement éditable. */}
              {analysis?.isNarrative && analysis.chapters.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t pt-4">
                  <Label htmlFor="import-story-title">
                    Titre de l'histoire
                  </Label>
                  <Input
                    id="import-story-title"
                    value={storyTitleOverride}
                    onChange={(e) => setStoryTitleOverride(e.target.value)}
                    placeholder={analysis.storyTitle ?? "Sans titre"}
                    maxLength={120}
                  />
                  <p className="text-xs text-muted-foreground">
                    {analysis.chapters.length} chapitre
                    {analysis.chapters.length > 1 ? "s" : ""} extrait
                    {analysis.chapters.length > 1 ? "s" : ""} — ils
                    seront regroupés sous ce titre.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Résultat post-import (P7.5) */}
      {importResult && (
        <ImportResultCard
          result={importResult}
          fromExistingUniverse={importedTargetMode === "existing"}
          analyzedText={text}
          onGoToUniverse={() => {
            if (importResult.storyId) {
              navigate(
                `/u/${importResult.universeId}/s/${importResult.storyId}`,
              );
            } else {
              navigate(`/u/${importResult.universeId}`);
            }
          }}
        />
      )}

      {/* 3) Sélections + bouton Importer */}
      {analysis && !importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              3. Que veux-tu importer ?
            </CardTitle>
            <CardDescription>
              Décoche ce que tu ne veux pas créer. Tout est coché par
              défaut.
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

            <div className="flex flex-col gap-3">
              {CATEGORIES.map((cat) => (
                <CategorySection
                  key={cat}
                  category={cat}
                  analysis={analysis}
                  selection={selections[cat]}
                  onToggle={(i) => toggle(cat, i)}
                  onToggleAll={(v) => toggleAllCat(cat, v)}
                />
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              {applyMutation.isError && (
                <p className="text-sm text-destructive flex-1" role="alert">
                  {String(applyMutation.error)}
                </p>
              )}
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={!canImport}
              >
                {applyMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                    Import…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" aria-hidden /> Importer
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* P13.2 — overlay live pendant l'analyse streaming d'un long texte.
       * S'auto-monte quand willStream && analyzeMutation.isPending. */}
      <ImportProgressOverlay
        active={willStream && analyzeMutation.isPending}
      />
    </div>
  );
}

interface CategorySectionProps {
  category: Category;
  analysis: ImportAnalysis;
  selection: SelectionMap;
  onToggle: (idx: number) => void;
  onToggleAll: (value: boolean) => void;
}

function CategorySection({
  category,
  analysis,
  selection,
  onToggle,
  onToggleAll,
}: CategorySectionProps) {
  const items = useMemo(
    () =>
      ((analysis as unknown as Record<string, unknown[]>)[category] ??
        []) as ImportItem[],
    [analysis, category],
  );
  const allSelected = items.length > 0 && items.every((_, i) => selection[String(i)]);
  const noneSelected = items.every((_, i) => !selection[String(i)]);
  const checkedCount = items.filter((_, i) => selection[String(i)]).length;

  // Toggle group : si aucun coché, default à tout coché. (Effet pour
  // garder selection en sync si analyse change — fait dans onSuccess.)
  useEffect(() => {
    /* no-op : sync est faite dans onSuccess de analyzeMutation */
  }, [items]);

  if (items.length === 0) return null;

  return (
    <details open className="rounded-md border bg-card">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2 hover:bg-accent/40">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = !allSelected && !noneSelected;
          }}
          onChange={(e) => onToggleAll(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
        {CATEGORY_LABELS[category]}
        <span className="text-xs text-muted-foreground">
          {checkedCount} / {items.length}
        </span>
      </summary>
      <ul className="px-3 py-2 flex flex-col gap-1 text-sm">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded p-1.5 hover:bg-accent/30"
          >
            <input
              type="checkbox"
              checked={!!selection[String(i)]}
              onChange={() => onToggle(i)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">
                  {item.name ?? item.title ?? "(sans nom)"}
                </span>
                {renderItemSubtitle(category, item)}
              </div>
              {(item.summary || item.description || item.bodyText) && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {item.bodyText
                    ? item.bodyText.slice(0, 200) +
                      (item.bodyText.length > 200 ? "…" : "")
                    : (item.summary ?? item.description)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface ImportItem {
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  bodyText?: string;
  kind?: string;
  archetype?: string;
  startYear?: number;
  endYear?: number;
  year?: number;
  eraName?: string;
}

function renderItemSubtitle(category: Category, item: ImportItem) {
  let sub: string | null = null;
  switch (category) {
    case "characters":
      sub = item.archetype ?? null;
      break;
    case "locations":
    case "factions":
    case "objects":
    case "concepts":
      sub = item.kind ?? null;
      break;
    case "eras":
      if (item.startYear != null && item.endYear != null)
        sub = `${item.startYear} → ${item.endYear}`;
      break;
    case "events":
      if (item.year != null) {
        sub = item.eraName ? `${item.year} · ${item.eraName}` : `${item.year}`;
      } else if (item.eraName) {
        sub = item.eraName;
      }
      break;
    case "chapters":
      if (item.bodyText) {
        const words = item.bodyText.split(/\s+/).filter(Boolean).length;
        sub = `${words.toLocaleString("fr-FR")} mots`;
      }
      break;
  }
  if (!sub) return null;
  return (
    <span className="text-xs rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
      {sub}
    </span>
  );
}

function filterByIdx<T>(items: T[], selection: SelectionMap): T[] {
  return items.filter((_, i) => selection[String(i)]);
}

// ---------------------------------------------------------------------------
// Résultat post-import (P7.5) — récap + bouton vérification cohérence RAG
// ---------------------------------------------------------------------------

interface ImportResultCardProps {
  result: ImportResult;
  fromExistingUniverse: boolean;
  /** Texte d'origine (pour relancer le RAG sur conflits potentiels). */
  analyzedText: string;
  onGoToUniverse: () => void;
}

function ImportResultCard({
  result,
  fromExistingUniverse,
  analyzedText,
  onGoToUniverse,
}: ImportResultCardProps) {
  const [conflicts, setConflicts] = useState<RagAnswer | null>(null);

  const counts = [
    { label: "Personnages", count: result.createdCharacters },
    { label: "Lieux", count: result.createdLocations },
    { label: "Factions", count: result.createdFactions },
    { label: "Objets", count: result.createdObjects },
    { label: "Concepts", count: result.createdConcepts },
    { label: "Époques", count: result.createdEras },
    { label: "Événements", count: result.createdEvents },
    { label: "Chapitres", count: result.createdChapters },
  ];
  const totalCreated = counts.reduce((a, b) => a + b.count, 0);

  const ragMutation = useMutation({
    mutationFn: () => {
      const tail = analyzedText.split(/\s+/).slice(-600).join(" ");
      return aiRagQuery({
        universeId: result.universeId,
        question: [
          "Voici un texte qui vient d'être importé dans cet univers. Identifie les fiches existantes du lore qui sont impactées (personnages mentionnés, lieux décrits, événements évoqués), et signale tout point qui contredit le lore existant.",
          "",
          "PASSAGE :",
          tail,
        ].join("\n"),
        topK: 8,
      });
    },
    onSuccess: setConflicts,
  });

  return (
    <Card className="border-emerald-300">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
          Import réussi · {totalCreated} élément(s) créé(s)
        </CardTitle>
        <CardDescription>
          {fromExistingUniverse
            ? "Les fiches ont été ajoutées à l'univers existant."
            : "Un nouvel univers a été créé."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {counts.map((c) => (
            <div
              key={c.label}
              className="rounded-md border p-2 text-center"
            >
              <div className="text-2xl font-semibold">{c.count}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          ))}
        </div>

        {result.skipped.length > 0 && (
          <details className="rounded-md border bg-amber-50/30 border-amber-300">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-amber-100/40">
              {result.skipped.length} fiche(s) skippée(s) (déjà présente(s))
            </summary>
            <ul className="px-3 py-2 flex flex-col gap-1 text-xs text-amber-900">
              {result.skipped.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </details>
        )}

        {fromExistingUniverse && (
          <div className="rounded-md border border-dashed bg-muted/30 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="size-4 text-blue-600" aria-hidden />
              <span className="text-sm font-medium">
                Vérifier les conflits avec le lore existant
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConflicts(null);
                  ragMutation.mutate();
                }}
                disabled={ragMutation.isPending}
              >
                {ragMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                    Analyse RAG…
                  </>
                ) : conflicts ? (
                  "Re-vérifier"
                ) : (
                  "Lancer la vérification"
                )}
              </Button>
            </div>
            {ragMutation.isError && (
              <p className="text-xs text-destructive" role="alert">
                {String(ragMutation.error)}
              </p>
            )}
            {!conflicts && !ragMutation.isPending && (
              <p className="text-xs text-muted-foreground">
                Croise le texte importé avec les fiches existantes (via le
                RAG du lore) pour signaler des contradictions ou des fiches
                à mettre à jour.
              </p>
            )}
            {conflicts && (
              <div className="rounded-md border bg-background/60 p-3 flex flex-col gap-2">
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {conflicts.answer}
                </div>
                {conflicts.sources.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Fiches consultées
                    </p>
                    <ul className="flex flex-col gap-1">
                      {conflicts.sources.map((s) => (
                        <li
                          key={`${s.entityId}-${s.score}`}
                          className="text-xs"
                        >
                          <Link
                            to={`/u/${result.universeId}/e/${s.entityId}`}
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
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button onClick={onGoToUniverse}>
            <ExternalLink className="size-4" aria-hidden /> Aller à
            l'univers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
