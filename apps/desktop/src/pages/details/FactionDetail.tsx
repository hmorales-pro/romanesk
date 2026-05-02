/**
 * Détail d'une fiche `Faction` (Phase 5). Mode View ↔ Edit comme les
 * autres types d'entité. Calque structurel sur LocationDetail.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Users } from "lucide-react";

import { factionUpdate } from "@/lib/api";
import {
  type Entity,
  FACTION_KINDS,
  type FactionKind,
  factionContent,
  factionKindLabel,
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
import { RelationsSection } from "@/components/RelationsSection";
import { TagsSection } from "@/components/TagsSection";
import { CoverImage } from "@/components/CoverImage";
import { SnapshotsSection } from "@/components/SnapshotsSection";

interface Props {
  entity: Entity;
  universeId: string;
}

export function FactionDetail({ entity, universeId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<FactionKind>("other");
  const [ideology, setIdeology] = useState("");
  const [founded, setFounded] = useState("");
  const [leader, setLeader] = useState("");
  const [description, setDescription] = useState<TiptapDoc | string | null>(null);

  const updateMutation = useMutation({
    mutationFn: factionUpdate,
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ["entity", e.id] });
      qc.invalidateQueries({ queryKey: ["entities", universeId, "Faction"] });
    },
  });

  const prevEditing = useRef(editing);
  useEffect(() => {
    if (editing && !prevEditing.current) {
      const c = factionContent(entity);
      setName(entity.name);
      setSummary(entity.summary ?? "");
      setKind(c.kind);
      setIdeology(c.ideology ?? "");
      setFounded(c.founded ?? "");
      setLeader(c.leader ?? "");
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
        ideology: ideology.trim() || undefined,
        founded: founded.trim() || undefined,
        leader: leader.trim() || undefined,
        description: description ?? undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <article className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Édition de la faction</h1>
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
            <Label htmlFor="edit-fac-name">Nom *</Label>
            <Input
              id="edit-fac-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-fac-kind">Type</Label>
            <select
              id="edit-fac-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as FactionKind)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {FACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {factionKindLabel(k)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-fac-summary">Résumé court</Label>
          <Input
            id="edit-fac-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Une phrase pour situer la faction."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-fac-ideology">Idéologie</Label>
            <Input
              id="edit-fac-ideology"
              value={ideology}
              onChange={(e) => setIdeology(e.target.value)}
              placeholder="liberté, ordre, savoir…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-fac-founded">Fondation</Label>
            <Input
              id="edit-fac-founded"
              value={founded}
              onChange={(e) => setFounded(e.target.value)}
              placeholder="an 312, ère pré-glaciaire…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-fac-leader">Dirigeant</Label>
            <Input
              id="edit-fac-leader"
              value={leader}
              onChange={(e) => setLeader(e.target.value)}
              placeholder="Reine Lyra, Conseil des Sept…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Description</Label>
          <TiptapEditor
            value={description}
            onChange={(json) => setDescription(json)}
            placeholder="Histoire, structure, alliances, ennemis…"
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

  const c = factionContent(entity);
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <Users className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground">
              Faction · {factionKindLabel(c.kind)} · créée le{" "}
              {new Date(entity.created_at).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden /> Modifier
        </Button>
      </header>

      {entity.summary && <p className="text-base text-foreground/90">{entity.summary}</p>}

      <CoverImage entity={entity} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Idéologie</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldOrEmpty value={c.ideology} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fondation</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldOrEmpty value={c.founded} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dirigeant</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldOrEmpty value={c.leader} />
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

      <TagsSection entity={entity} />
      <RelationsSection entity={entity} />
      <SnapshotsSection entity={entity} />
    </article>
  );
}

function FieldOrEmpty({ value }: { value: string | null }) {
  if (value) return <p className="text-sm">{value}</p>;
  return <p className="text-sm text-muted-foreground italic">Non renseigné</p>;
}

function hasContent(d: unknown): boolean {
  if (!d) return false;
  if (typeof d === "string") return d.trim().length > 0;
  if (typeof d === "object") return !isEmptyNode(d);
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
