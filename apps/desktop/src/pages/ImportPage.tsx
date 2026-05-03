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
  FileUp,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  aiAnalyzeImport,
  importApply,
  universeList,
  type ImportAnalysis,
  type ImportTarget,
} from "@/lib/api";
import type { Universe } from "@/lib/types";
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
  const [existingUniverseId, setExistingUniverseId] = useState("");
  const [forceDuplicates, setForceDuplicates] = useState(false);

  const universesQuery = useQuery({
    queryKey: ["universes"],
    queryFn: universeList,
  });

  const analyzeMutation = useMutation({
    mutationFn: () =>
      aiAnalyzeImport({
        text,
        targetUniverseName:
          targetMode === "existing"
            ? universesQuery.data?.find((u) => u.id === existingUniverseId)?.name
            : undefined,
      }),
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
              kind: "NewUniverse",
              name: newUniverseName.trim() || analysis.universe.name,
              description: newUniverseDesc.trim() || undefined,
            }
          : { kind: "ExistingUniverse", id: existingUniverseId };
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
          storyTitle: analysis.storyTitle,
          isNarrative: analysis.isNarrative,
        },
        target,
        forceDuplicates,
      });
    },
    onSuccess: (res) => {
      // Navigation directe vers l'univers (story si dispo, sinon univers).
      if (res.storyId) {
        navigate(`/u/${res.universeId}/s/${res.storyId}`);
      } else {
        navigate(`/u/${res.universeId}`);
      }
    },
  });

  // P7.4 preview : upload .md/.txt simple via input file natif.
  const onFileChange = (file: File | null) => {
    if (!file) return;
    if (
      !/\.(md|txt|markdown)$/i.test(file.name) &&
      file.type !== "text/plain"
    ) {
      window.alert(
        "Pour l'instant : .md / .txt uniquement. .docx et .pdf en P7.4.",
      );
      return;
    }
    void file.text().then((content) => {
      setText(content);
      setAnalysis(null);
    });
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
  const overLimit = charCount > 24_000;
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
              accept=".md,.txt,.markdown,text/plain,text/markdown"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="inline-flex items-center justify-center gap-1 h-9 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:bg-accent"
            >
              <Upload className="size-3.5" aria-hidden /> Charger .md / .txt
            </label>
            <span className="text-xs text-muted-foreground">
              .docx et .pdf en P7.4
            </span>
          </div>
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
                overLimit
                  ? "text-xs text-amber-700"
                  : "text-xs text-muted-foreground"
              }
            >
              {charCount.toLocaleString("fr-FR")} caractères
              {overLimit && ` · sera tronqué à 24 000`}
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3) Sélections + bouton Importer */}
      {analysis && (
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
