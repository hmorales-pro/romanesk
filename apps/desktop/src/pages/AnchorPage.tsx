import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Anchor, ArrowLeft, Plus, Trash2 } from "lucide-react";

import {
  aiComplete,
  anchorGetForUniverse,
  anchorUpsert,
  briefCreate,
  briefDelete,
  briefList,
  divergenceCreate,
  divergenceDelete,
  divergenceList,
  universeGet,
} from "@/lib/api";
import {
  DIVERGENCE_AXES,
  type DivergenceAxis,
  type RealityMode,
  divergenceAxisLabel,
  realityModeLabel,
} from "@/lib/types";
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

export default function AnchorPage() {
  const { universeId } = useParams<{ universeId: string }>();
  const qc = useQueryClient();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const anchorQuery = useQuery({
    queryKey: ["anchor", universeId],
    queryFn: () => anchorGetForUniverse(universeId!),
    enabled: !!universeId,
  });

  const upsertMutation = useMutation({
    mutationFn: anchorUpsert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anchor", universeId] }),
  });

  const [mode, setMode] = useState<RealityMode>("none");
  const [pivotDate, setPivotDate] = useState("");
  const [baseWorld, setBaseWorld] = useState("earth_real");
  const [notes, setNotes] = useState("");

  // Hydrate le form quand l'anchor est chargé.
  useEffect(() => {
    if (anchorQuery.data) {
      setMode(anchorQuery.data.mode);
      setPivotDate(anchorQuery.data.pivot_date ?? "");
      setBaseWorld(anchorQuery.data.base_world);
      setNotes(anchorQuery.data.notes ?? "");
    }
  }, [anchorQuery.data]);

  const onSave = () => {
    if (!universeId) return;
    upsertMutation.mutate({
      universeId,
      mode,
      pivotDate: pivotDate.trim() || undefined,
      baseWorld: baseWorld.trim() || "earth_real",
      notes: notes.trim() || undefined,
    });
  };

  if (!universeId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <p className="text-destructive" role="alert">
          Univers introuvable.
        </p>
      </div>
    );
  }

  const anchor = anchorQuery.data;

  return (
    <div className="container mx-auto px-6 py-8 max-w-3xl flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to={`/u/${universeId}`}
          className="hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> {universeQuery.data?.name ?? "Univers"}
        </Link>
        <span>·</span>
        <span>Ancrage réel</span>
      </nav>

      <header className="flex items-start gap-4">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <Anchor className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Ancrage à la réalité</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comment ton univers se positionne par rapport au monde réel.
            Sert de référence cohérente pour l'IA.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paramètres</CardTitle>
          <CardDescription>
            Configure le mode et la date pivot. L'IA respectera ce cadre quand
            elle générera du contenu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="anchor-mode">Mode</Label>
            <select
              id="anchor-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as RealityMode)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="none">{realityModeLabel("none")}</option>
              <option value="historical">{realityModeLabel("historical")}</option>
              <option value="divergent">{realityModeLabel("divergent")}</option>
            </select>
          </div>

          {mode !== "none" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anchor-date">Date pivot (ISO)</Label>
                  <Input
                    id="anchor-date"
                    value={pivotDate}
                    onChange={(e) => setPivotDate(e.target.value)}
                    placeholder="1850-06-15, -50-03-15…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="anchor-base">Base world</Label>
                  <Input
                    id="anchor-base"
                    value={baseWorld}
                    onChange={(e) => setBaseWorld(e.target.value)}
                    placeholder="earth_real"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="anchor-notes">Notes</Label>
                <Textarea
                  id="anchor-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Précisions sur l'ancrage : focus régional, période exacte, sources…"
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button onClick={onSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
          {upsertMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {String(upsertMutation.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {anchor && anchor.mode === "divergent" && (
        <DivergencePointsCard anchorId={anchor.id} />
      )}

      {anchor && anchor.mode !== "none" && (
        <WorldBriefsCard
          anchorId={anchor.id}
          universeName={universeQuery.data?.name ?? "univers"}
          pivotDate={anchor.pivot_date}
          mode={anchor.mode}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DivergencePoints
// ---------------------------------------------------------------------------

function DivergencePointsCard({ anchorId }: { anchorId: string }) {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["divergences", anchorId],
    queryFn: () => divergenceList(anchorId),
  });

  const createMutation = useMutation({
    mutationFn: divergenceCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["divergences", anchorId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: divergenceDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["divergences", anchorId] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [whenIso, setWhenIso] = useState("");
  const [axis, setAxis] = useState<DivergenceAxis>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setWhenIso("");
    setAxis("event");
    setTitle("");
    setDescription("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whenIso.trim() || !title.trim()) return;
    createMutation.mutate(
      {
        anchorId,
        whenIso: whenIso.trim(),
        axis,
        title: title.trim(),
        description: description.trim() || undefined,
      },
      { onSuccess: reset },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Points de divergence</CardTitle>
            <CardDescription>
              Chaque rupture explicite par rapport au monde réel.
            </CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="size-3.5" aria-hidden /> Divergence
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showForm && (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-3 rounded-md border border-border p-3"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="div-when">Date (ISO)</Label>
                <Input
                  id="div-when"
                  value={whenIso}
                  onChange={(e) => setWhenIso(e.target.value)}
                  placeholder="1789-07-14"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="div-title">Titre *</Label>
                <Input
                  id="div-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Pas de Révolution française"
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-axis">Axe</Label>
              <select
                id="div-axis"
                value={axis}
                onChange={(e) => setAxis(e.target.value as DivergenceAxis)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DIVERGENCE_AXES.map((a) => (
                  <option key={a} value={a}>
                    {divergenceAxisLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description et conséquences (optionnel)…"
              rows={2}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Ajout…" : "Ajouter"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        {listQuery.data && listQuery.data.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground italic">
            Aucune divergence. Ajoute la première ↑
          </p>
        )}
        {listQuery.data && listQuery.data.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {listQuery.data.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      {d.when_iso}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded border border-border bg-secondary">
                      {divergenceAxisLabel(d.axis)}
                    </span>
                    <span className="font-medium">{d.title}</span>
                  </div>
                  {d.description && (
                    <p className="text-xs text-muted-foreground">{d.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteMutation.mutate(d.id)}
                  disabled={deleteMutation.isPending}
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorldBriefs (avec génération IA)
// ---------------------------------------------------------------------------

function WorldBriefsCard({
  anchorId,
  universeName,
  pivotDate,
  mode,
}: {
  anchorId: string;
  universeName: string;
  pivotDate: string | null;
  mode: RealityMode;
}) {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["briefs", anchorId],
    queryFn: () => briefList(anchorId),
  });

  const createMutation = useMutation({
    mutationFn: briefCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefs", anchorId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: briefDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefs", anchorId] }),
  });

  const [snapshotDate, setSnapshotDate] = useState(pivotDate ?? "");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const onGenerate = async () => {
    if (!snapshotDate.trim()) {
      setGenError("Indique une date pour le brief.");
      return;
    }
    setGenError(null);
    setGenerating(true);
    try {
      const system = `Tu es un assistant d'historien fictionnel. Tu produis un World Brief : un état du monde à une date donnée pour servir de cadre cohérent à un auteur. Réponds STRICTEMENT en JSON valide avec ces clés : { "politics": "...", "tech": "...", "culture": "...", "daily_life": "...", "geopolitics": "..." }. Chaque valeur est un paragraphe court (3-5 phrases) en français.`;
      const user = `Univers : « ${universeName} » (mode ${mode}).
Date du brief : ${snapshotDate.trim()}.
Décris l'état du monde à cette date.`;
      const res = await aiComplete({ system, user, temperature: 0.4, maxTokens: 1500 });
      // Parse JSON best-effort
      const trimmed = extractJson(res.content);
      let contentJson: Record<string, unknown>;
      try {
        contentJson = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        contentJson = { raw: res.content };
      }
      await createMutation.mutateAsync({
        anchorId,
        snapshotDate: snapshotDate.trim(),
        contentJson,
        source: "ai_generated",
        pinned: true,
      });
    } catch (err) {
      setGenError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">World Briefs</CardTitle>
        <CardDescription>
          État du monde à une date précise. Sert de référence pour la cohérence
          de tes fiches et des réponses IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
          <Label htmlFor="brief-date">Générer un brief pour la date</Label>
          <div className="flex gap-2">
            <Input
              id="brief-date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              placeholder="1850-06-15"
              className="flex-1"
            />
            <Button onClick={onGenerate} disabled={generating || !snapshotDate.trim()}>
              {generating ? "Génération…" : "Générer via IA"}
            </Button>
          </div>
          {genError && (
            <p className="text-xs text-destructive" role="alert">
              {genError}
            </p>
          )}
        </div>

        {listQuery.data && listQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucun brief encore. Génère le premier ↑
          </p>
        )}
        {listQuery.data && listQuery.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {listQuery.data.map((b) => (
              <li
                key={b.id}
                className="rounded-md border border-border bg-background/40 p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.snapshot_date}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded border border-border bg-secondary">
                      {b.source}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(b.id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Voir le contenu
                  </summary>
                  <pre className="mt-2 p-2 bg-background rounded border border-border whitespace-pre-wrap font-mono text-[11px] overflow-x-auto">
                    {JSON.stringify(b.content_json, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  return start >= 0 && end > start ? s.slice(start, end + 1) : s;
}
