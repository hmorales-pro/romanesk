import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, History, Trash2 } from "lucide-react";

import {
  eraListInUniverse,
  snapshotCreate,
  snapshotDelete,
  snapshotListForEntity,
} from "@/lib/api";
import { type Entity, type Era, type Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  entity: Entity;
}

/**
 * Section Snapshots d'une fiche : capture l'état actuel à un moment du
 * temps narratif (era, year), liste les versions historiques, permet
 * d'en supprimer.
 *
 * Phase 2 : snapshot = dump complet du `content + name + summary`.
 * Phase 3+ : vrais deltas pour réduire la taille (cf. domain.rs Snapshot).
 * Restauration d'un snapshot vers l'état canonique = à venir.
 */
export function SnapshotsSection({ entity }: Props) {
  const qc = useQueryClient();

  const snapshotsQuery = useQuery({
    queryKey: ["snapshots", entity.id],
    queryFn: () => snapshotListForEntity(entity.id),
  });

  const erasQuery = useQuery({
    queryKey: ["eras", entity.universe_id],
    queryFn: () => eraListInUniverse(entity.universe_id),
  });
  const erasById = useMemo(() => {
    const m = new Map<string, Era>();
    (erasQuery.data ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [erasQuery.data]);

  const createMutation = useMutation({
    mutationFn: snapshotCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshots", entity.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: snapshotDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshots", entity.id] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [eraId, setEraId] = useState("");
  const [yearRaw, setYearRaw] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setEraId("");
    setYearRaw("");
    setNote("");
    setShowForm(false);
  };

  const onCapture = (e: React.FormEvent) => {
    e.preventDefault();
    const year = yearRaw.trim() ? Number(yearRaw) : undefined;
    if (year !== undefined && Number.isNaN(year)) return;

    // Snapshot complet : on capture name + summary + content tels quels.
    const snapshotJson: Record<string, unknown> = {
      name: entity.name,
      summary: entity.summary,
      content: entity.content,
      cover_image: entity.cover_image,
    };

    createMutation.mutate(
      {
        entityId: entity.id,
        eraId: eraId || undefined,
        yearInUniverse: year,
        snapshotJson,
        note: note.trim() || undefined,
      },
      { onSuccess: reset },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="size-4 text-muted-foreground" aria-hidden />
              Versions temporelles
            </CardTitle>
            <CardDescription>
              Captures de l'état de la fiche à un moment précis du temps narratif.
            </CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Camera className="size-3.5" aria-hidden /> Capturer
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showForm && (
          <form
            onSubmit={onCapture}
            className="flex flex-col gap-3 rounded-md border border-border p-3"
          >
            <p className="text-xs text-muted-foreground">
              Crée un instantané de cette fiche (nom, résumé, contenu, image)
              à l'époque sélectionnée. La fiche canonique reste inchangée.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="snap-era">Époque (optionnelle)</Label>
                <select
                  id="snap-era"
                  value={eraId}
                  onChange={(e) => setEraId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— pas d'époque —</option>
                  {(erasQuery.data ?? []).map((era) => (
                    <option key={era.id} value={era.id}>
                      {era.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="snap-year">Année (optionnelle)</Label>
                <Input
                  id="snap-year"
                  type="number"
                  value={yearRaw}
                  onChange={(e) => setYearRaw(e.target.value)}
                  placeholder="ex. -150, 0, 1850…"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="snap-note">Note</Label>
              <Input
                id="snap-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ex. Avant l'exil, Au crépuscule de sa vie…"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Capture…" : "Capturer"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Annuler
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                Erreur : {String(createMutation.error)}
              </p>
            )}
          </form>
        )}

        {snapshotsQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
        {snapshotsQuery.data && snapshotsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucune version capturée. La fiche actuelle est l'unique état connu.
          </p>
        )}
        {snapshotsQuery.data && snapshotsQuery.data.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {snapshotsQuery.data.map((s) => (
              <SnapshotRow
                key={s.id}
                snapshot={s}
                era={s.era_id ? erasById.get(s.era_id) ?? null : null}
                onDelete={() => deleteMutation.mutate(s.id)}
                deleting={deleteMutation.isPending}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotRow({
  snapshot,
  era,
  onDelete,
  deleting,
}: {
  snapshot: Snapshot;
  era: Era | null;
  onDelete: () => void;
  deleting: boolean;
}) {
  const snapshotName =
    typeof snapshot.snapshot_json.name === "string"
      ? (snapshot.snapshot_json.name as string)
      : "(sans nom)";

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono shrink-0 min-w-12">
            {snapshot.year_in_universe != null
              ? snapshot.year_in_universe < 0
                ? `${-snapshot.year_in_universe} av.`
                : String(snapshot.year_in_universe)
              : "—"}
          </span>
          <span className="font-medium truncate">{snapshotName}</span>
          {era && (
            <span
              className="text-xs px-1.5 py-0.5 rounded border"
              style={{
                borderColor: era.color ?? "#94a3b8",
                color: era.color ?? "#475569",
              }}
            >
              {era.name}
            </span>
          )}
        </div>
        {snapshot.note && (
          <p className="text-xs text-muted-foreground italic">{snapshot.note}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Supprimer le snapshot"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}
