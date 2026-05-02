import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarRange, Clock, Pencil, Plus, Trash2 } from "lucide-react";

import {
  eraCreate,
  eraDelete,
  eraListInUniverse,
  eraUpdate,
  eventCreate,
  eventDelete,
  eventListInUniverse,
  eventUpdate,
} from "@/lib/api";
import {
  type Era,
  type Event as TimelineEvent,
  eraYearsLabel,
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

interface Props {
  universeId: string;
}

/**
 * Section Timeline d'un univers : époques + événements.
 *
 * Phase 2.1 + 2.2 : forms inline, listes triées chronologiquement,
 * navigation vers la frise complète. Édition d'une era / event :
 * prévue P2.5+ (pour l'instant, suppression + recréation).
 */
export function TimelineSection({ universeId }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Timeline
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Époques et événements narratifs.
          </p>
        </div>
        <Link to={`/u/${universeId}/timeline`}>
          <Button variant="outline" size="sm">
            <Clock className="size-3.5" aria-hidden /> Voir la frise
          </Button>
        </Link>
      </div>

      <ErasCard universeId={universeId} />
      <EventsCard universeId={universeId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

function ErasCard({ universeId }: { universeId: string }) {
  const qc = useQueryClient();

  const erasQuery = useQuery({
    queryKey: ["eras", universeId],
    queryFn: () => eraListInUniverse(universeId),
  });

  const createMutation = useMutation({
    mutationFn: eraCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eras", universeId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: eraDelete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eras", universeId] });
      qc.invalidateQueries({ queryKey: ["events", universeId] });
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startYearRaw, setStartYearRaw] = useState("");
  const [endYearRaw, setEndYearRaw] = useState("");
  const [color, setColor] = useState("#a78bfa");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setStartYearRaw("");
    setEndYearRaw("");
    setColor("#a78bfa");
    setDescription("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const startYear = startYearRaw.trim() ? Number(startYearRaw) : undefined;
    const endYear = endYearRaw.trim() ? Number(endYearRaw) : undefined;
    if (startYear !== undefined && Number.isNaN(startYear)) return;
    if (endYear !== undefined && Number.isNaN(endYear)) return;
    createMutation.mutate(
      {
        universeId,
        name: name.trim(),
        startYear,
        endYear,
        description: description.trim() || undefined,
        color: color.trim() || undefined,
        sortOrder: erasQuery.data?.length ?? 0,
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
              <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
              Époques
            </CardTitle>
            <CardDescription>
              Périodes du calendrier de l'univers.
            </CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="size-3.5" aria-hidden /> Époque
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="era-name">Nom *</Label>
                <Input
                  id="era-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Âge des dragons, Ère post-apo…"
                  autoFocus
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="era-color">Couleur</Label>
                <Input
                  id="era-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-full p-1"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="era-start">Année de début</Label>
                <Input
                  id="era-start"
                  type="number"
                  value={startYearRaw}
                  onChange={(e) => setStartYearRaw(e.target.value)}
                  placeholder="ex. -200, 0, 1850…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="era-end">Année de fin</Label>
                <Input
                  id="era-end"
                  type="number"
                  value={endYearRaw}
                  onChange={(e) => setEndYearRaw(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="era-desc">Description (optionnelle)</Label>
              <Textarea
                id="era-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Quelques lignes pour situer l'époque…"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim()}>
                {createMutation.isPending ? "Création…" : "Créer"}
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

        {erasQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
        {erasQuery.data && erasQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucune époque définie. Crée la première ↑
          </p>
        )}
        {erasQuery.data && erasQuery.data.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {erasQuery.data.map((era) => (
              <EraRow
                key={era.id}
                era={era}
                onDelete={() => {
                  if (window.confirm(`Supprimer l'époque « ${era.name} » ?`)) {
                    deleteMutation.mutate(era.id);
                  }
                }}
                deleting={deleteMutation.isPending}
                onUpdated={() =>
                  qc.invalidateQueries({ queryKey: ["eras", universeId] })
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EraRow({
  era,
  onDelete,
  deleting,
  onUpdated,
}: {
  era: Era;
  onDelete: () => void;
  deleting: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(era.name);
  const [startYearRaw, setStartYearRaw] = useState(
    era.start_year != null ? String(era.start_year) : "",
  );
  const [endYearRaw, setEndYearRaw] = useState(
    era.end_year != null ? String(era.end_year) : "",
  );
  const [color, setColor] = useState(era.color ?? "#a78bfa");
  const [description, setDescription] = useState(era.description ?? "");

  const updateMutation = useMutation({
    mutationFn: eraUpdate,
    onSuccess: () => {
      onUpdated();
      setEditing(false);
    },
  });

  const onEdit = () => {
    setName(era.name);
    setStartYearRaw(era.start_year != null ? String(era.start_year) : "");
    setEndYearRaw(era.end_year != null ? String(era.end_year) : "");
    setColor(era.color ?? "#a78bfa");
    setDescription(era.description ?? "");
    setEditing(true);
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const startYear = startYearRaw.trim() ? Number(startYearRaw) : undefined;
    const endYear = endYearRaw.trim() ? Number(endYearRaw) : undefined;
    if (startYear !== undefined && Number.isNaN(startYear)) return;
    if (endYear !== undefined && Number.isNaN(endYear)) return;
    updateMutation.mutate({
      id: era.id,
      name: name.trim(),
      startYear,
      endYear,
      description: description.trim() || undefined,
      color: color.trim() || undefined,
      sortOrder: era.sort_order,
    });
  };

  if (editing) {
    return (
      <li className="rounded-md border border-border bg-background/60 p-3">
        <form onSubmit={onSave} className="flex flex-col gap-2.5">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              required
              autoFocus
              aria-label="Nom de l'époque"
            />
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-12 p-1"
              aria-label="Couleur"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="number"
              value={startYearRaw}
              onChange={(e) => setStartYearRaw(e.target.value)}
              placeholder="début"
              className="h-8 text-sm"
            />
            <Input
              type="number"
              value={endYearRaw}
              onChange={(e) => setEndYearRaw(e.target.value)}
              placeholder="fin"
              className="h-8 text-sm"
            />
          </div>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnelle)"
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
          {updateMutation.isError && (
            <p className="text-xs text-destructive" role="alert">
              {String(updateMutation.error)}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block size-3 rounded-full shrink-0"
          style={{ background: era.color ?? "#94a3b8" }}
          aria-hidden
        />
        <span className="font-medium truncate">{era.name}</span>
        <span className="text-xs text-muted-foreground">
          {eraYearsLabel(era)}
        </span>
        {era.description && (
          <span className="text-xs text-muted-foreground truncate">
            · {era.description}
          </span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`Modifier ${era.name}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Supprimer ${era.name}`}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function EventsCard({ universeId }: { universeId: string }) {
  const qc = useQueryClient();

  const erasQuery = useQuery({
    queryKey: ["eras", universeId],
    queryFn: () => eraListInUniverse(universeId),
  });

  const eventsQuery = useQuery({
    queryKey: ["events", universeId],
    queryFn: () => eventListInUniverse(universeId),
  });

  const createMutation = useMutation({
    mutationFn: eventCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", universeId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: eventDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", universeId] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [yearRaw, setYearRaw] = useState("");
  const [eraId, setEraId] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setYearRaw("");
    setEraId("");
    setDescription("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const year = yearRaw.trim() ? Number(yearRaw) : undefined;
    if (year !== undefined && Number.isNaN(year)) return;
    createMutation.mutate(
      {
        universeId,
        eraId: eraId || undefined,
        name: name.trim(),
        year,
        description: description.trim() || undefined,
      },
      { onSuccess: reset },
    );
  };

  const erasById = new Map((erasQuery.data ?? []).map((e) => [e.id, e]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              Événements
            </CardTitle>
            <CardDescription>
              Moments narratifs datés (batailles, fondations, ruptures…).
            </CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="size-3.5" aria-hidden /> Événement
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-name">Nom *</Label>
                <Input
                  id="event-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bataille de Bren, Couronnement de Lyra…"
                  autoFocus
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-year">Année</Label>
                <Input
                  id="event-year"
                  type="number"
                  value={yearRaw}
                  onChange={(e) => setYearRaw(e.target.value)}
                  placeholder="ex. -150, 0, 2042…"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-era">Époque (optionnelle)</Label>
              <select
                id="event-era"
                value={eraId}
                onChange={(e) => setEraId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Hors époque —</option>
                {(erasQuery.data ?? []).map((era) => (
                  <option key={era.id} value={era.id}>
                    {era.name} ({eraYearsLabel(era)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event-desc">Description</Label>
              <Textarea
                id="event-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim()}>
                {createMutation.isPending ? "Création…" : "Créer"}
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

        {eventsQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
        {eventsQuery.data && eventsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucun événement encore. Crée le premier ↑
          </p>
        )}
        {eventsQuery.data && eventsQuery.data.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {eventsQuery.data.map((ev) => (
              <EventRow
                key={ev.id}
                event={ev}
                era={ev.era_id ? erasById.get(ev.era_id) ?? null : null}
                allEras={erasQuery.data ?? []}
                onDelete={() => {
                  if (window.confirm(`Supprimer l'événement « ${ev.name} » ?`)) {
                    deleteMutation.mutate(ev.id);
                  }
                }}
                deleting={deleteMutation.isPending}
                onUpdated={() =>
                  qc.invalidateQueries({ queryKey: ["events", universeId] })
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({
  event,
  era,
  allEras,
  onDelete,
  deleting,
  onUpdated,
}: {
  event: TimelineEvent;
  era: Era | null;
  allEras: Era[];
  onDelete: () => void;
  deleting: boolean;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(event.name);
  const [yearRaw, setYearRaw] = useState(event.year != null ? String(event.year) : "");
  const [eraId, setEraId] = useState(event.era_id ?? "");
  const [description, setDescription] = useState(event.description ?? "");

  const updateMutation = useMutation({
    mutationFn: eventUpdate,
    onSuccess: () => {
      onUpdated();
      setEditing(false);
    },
  });

  const onEdit = () => {
    setName(event.name);
    setYearRaw(event.year != null ? String(event.year) : "");
    setEraId(event.era_id ?? "");
    setDescription(event.description ?? "");
    setEditing(true);
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const year = yearRaw.trim() ? Number(yearRaw) : undefined;
    if (year !== undefined && Number.isNaN(year)) return;
    updateMutation.mutate({
      id: event.id,
      name: name.trim(),
      year,
      eraId: eraId || undefined,
      description: description.trim() || undefined,
    });
  };

  if (editing) {
    return (
      <li className="rounded-md border border-border bg-background/60 p-3">
        <form onSubmit={onSave} className="flex flex-col gap-2.5">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              required
              autoFocus
              aria-label="Nom de l'événement"
            />
            <Input
              type="number"
              value={yearRaw}
              onChange={(e) => setYearRaw(e.target.value)}
              placeholder="année"
              className="h-8 w-24 text-sm"
            />
          </div>
          <select
            value={eraId}
            onChange={(e) => setEraId(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Hors époque —</option>
            {allEras.map((era) => (
              <option key={era.id} value={era.id}>
                {era.name}
              </option>
            ))}
          </select>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnelle)"
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
          {updateMutation.isError && (
            <p className="text-xs text-destructive" role="alert">
              {String(updateMutation.error)}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground font-mono shrink-0 min-w-12">
          {event.year != null
            ? event.year < 0
              ? `${-event.year} av.`
              : String(event.year)
            : "—"}
        </span>
        <span className="font-medium truncate">{event.name}</span>
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
        {event.description && (
          <span className="text-xs text-muted-foreground truncate">
            · {event.description}
          </span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`Modifier ${event.name}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Supprimer ${event.name}`}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
