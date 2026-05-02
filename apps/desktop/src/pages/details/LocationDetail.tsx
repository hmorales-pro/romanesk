import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil } from "lucide-react";

import { locationUpdate } from "@/lib/api";
import {
  type Entity,
  type LocationKind,
  locationContent,
  locationKindLabel,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TiptapEditor, type TiptapDoc } from "@/components/TiptapEditor";

const LOCATION_KINDS: LocationKind[] = [
  "city",
  "region",
  "building",
  "naturalFeature",
  "celestial",
  "other",
];

interface Props {
  entity: Entity;
  universeId: string;
}

export function LocationDetail({ entity, universeId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<LocationKind>("other");
  const [climate, setClimate] = useState("");
  const [population, setPopulation] = useState("");
  const [description, setDescription] = useState<TiptapDoc | string | null>(null);

  const updateMutation = useMutation({
    mutationFn: locationUpdate,
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ["entity", e.id] });
      qc.invalidateQueries({ queryKey: ["entities", universeId, "Location"] });
    },
  });

  const prevEditing = useRef(editing);
  useEffect(() => {
    if (editing && !prevEditing.current) {
      const c = locationContent(entity);
      setName(entity.name);
      setSummary(entity.summary ?? "");
      setKind(c.kind);
      setClimate(c.climate ?? "");
      setPopulation(c.population ?? "");
      setDescription(c.description as TiptapDoc | string | null);
    }
    prevEditing.current = editing;
  }, [editing, entity]);

  const onSave = () => {
    if (!name.trim()) return;
    updateMutation.mutate(
      {
        id: entity.id,
        name: name.trim(),
        summary: summary.trim() || undefined,
        kind,
        climate: climate.trim() || undefined,
        population: population.trim() || undefined,
        description: description ?? undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <article className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Édition du lieu</h1>
          <div className="flex gap-2">
            <Button onClick={onSave} disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
            >
              Annuler
            </Button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-loc-name">Nom *</Label>
            <Input
              id="edit-loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-loc-kind">Type</Label>
            <select
              id="edit-loc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as LocationKind)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {LOCATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {locationKindLabel(k)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-loc-summary">Résumé court</Label>
          <Input
            id="edit-loc-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Une phrase pour situer le lieu."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-loc-climate">Climat</Label>
            <Input
              id="edit-loc-climate"
              value={climate}
              onChange={(e) => setClimate(e.target.value)}
              placeholder="tempéré, polaire, brumeux…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-loc-population">Population / peuples</Label>
            <Input
              id="edit-loc-population"
              value={population}
              onChange={(e) => setPopulation(e.target.value)}
              placeholder="humains, elfes, ~30 000 hab.…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Description</Label>
          <TiptapEditor
            value={description}
            onChange={(json) => setDescription(json)}
            placeholder="Géographie, atmosphère, histoire du lieu…"
          />
        </div>

        {updateMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            Erreur : {String(updateMutation.error)}
          </p>
        )}
      </article>
    );
  }

  const c = locationContent(entity);
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <MapPin className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground">
              Lieu · {locationKindLabel(c.kind)} · créé le{" "}
              {new Date(entity.created_at).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden /> Modifier
        </Button>
      </header>

      {entity.summary && <p className="text-base text-foreground/90">{entity.summary}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Climat</CardTitle>
          </CardHeader>
          <CardContent>
            {c.climate ? (
              <p className="text-sm">{c.climate}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Non renseigné</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Population / peuples</CardTitle>
          </CardHeader>
          <CardContent>
            {c.population ? (
              <p className="text-sm">{c.population}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Non renseigné</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Description</CardTitle>
        </CardHeader>
        <CardContent>
          {hasContent(c.description) ? (
            <TiptapEditor
              value={c.description as TiptapDoc | string | null}
              onChange={() => {
                /* read-only */
              }}
              editable={false}
              className="border-0 px-0"
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Pas encore de description. Clique « Modifier » pour en ajouter.
            </p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}

function hasContent(bio: unknown): boolean {
  if (!bio) return false;
  if (typeof bio === "string") return bio.trim().length > 0;
  if (typeof bio === "object") return !isEmptyNode(bio);
  return false;
}

function isEmptyNode(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return true;
  const n = node as { text?: unknown; content?: unknown[] };
  if (typeof n.text === "string") return n.text.trim().length === 0;
  if (Array.isArray(n.content)) {
    return n.content.length === 0 || n.content.every(isEmptyNode);
  }
  return true;
}
