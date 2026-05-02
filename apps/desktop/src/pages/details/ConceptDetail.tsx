/**
 * Détail d'une fiche `Concept` (système de magie, religion, technologie,
 * philosophie, langue…) — Phase 5. Mode View ↔ Edit minimal : un seul
 * champ spécifique (`domain`) en plus du type, parce que ces fiches
 * vivent surtout par leur description riche en Tiptap.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Sparkles } from "lucide-react";

import { conceptUpdate } from "@/lib/api";
import {
  type Entity,
  CONCEPT_KINDS,
  type ConceptKind,
  conceptContent,
  conceptKindLabel,
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

export function ConceptDetail({ entity, universeId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<ConceptKind>("other");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState<TiptapDoc | string | null>(null);

  const updateMutation = useMutation({
    mutationFn: conceptUpdate,
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ["entity", e.id] });
      qc.invalidateQueries({ queryKey: ["entities", universeId, "Concept"] });
    },
  });

  const prevEditing = useRef(editing);
  useEffect(() => {
    if (editing && !prevEditing.current) {
      const c = conceptContent(entity);
      setName(entity.name);
      setSummary(entity.summary ?? "");
      setKind(c.kind);
      setDomain(c.domain ?? "");
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
        domain: domain.trim() || undefined,
        description: description ?? undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <article className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Édition du concept</h1>
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
            <Label htmlFor="edit-cpt-name">Nom *</Label>
            <Input
              id="edit-cpt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-cpt-kind">Type</Label>
            <select
              id="edit-cpt-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ConceptKind)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {CONCEPT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {conceptKindLabel(k)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-cpt-summary">Résumé court</Label>
          <Input
            id="edit-cpt-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Une phrase pour situer le concept."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-cpt-domain">Domaine / portée</Label>
          <Input
            id="edit-cpt-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="élémentaire, pan-galactique, monastique…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Description</Label>
          <TiptapEditor
            value={description}
            onChange={(json) => setDescription(json)}
            placeholder="Règles, dogmes, principes, exemples…"
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

  const c = conceptContent(entity);
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <Sparkles className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground">
              Concept · {conceptKindLabel(c.kind)} · créé le{" "}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Domaine / portée</CardTitle>
        </CardHeader>
        <CardContent>
          {c.domain ? (
            <p className="text-sm">{c.domain}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Non renseigné</p>
          )}
        </CardContent>
      </Card>

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
