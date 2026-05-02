/**
 * Détail d'une fiche `Object` (artefact, arme, livre, relique…) — Phase 5.
 * Mode View ↔ Edit, calque structurel sur LocationDetail.
 *
 * Spécificité : `properties` est un tableau de strings (séparé par
 * virgules dans le form, comme `traits` côté Character).
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Package } from "lucide-react";

import { objectUpdate } from "@/lib/api";
import {
  type Entity,
  OBJECT_KINDS,
  type ObjectKind,
  objectContent,
  objectKindLabel,
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
import { AiDescriptionPanel } from "@/components/AiDescriptionPanel";
import { paragraphsToDoc, appendParagraphsToDoc } from "@/lib/tiptap-utils";

interface Props {
  entity: Entity;
  universeId: string;
}

export function ObjectDetail({ entity, universeId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<ObjectKind>("other");
  const [origin, setOrigin] = useState("");
  const [owner, setOwner] = useState("");
  const [propertiesRaw, setPropertiesRaw] = useState("");
  const [description, setDescription] = useState<TiptapDoc | string | null>(null);

  const updateMutation = useMutation({
    mutationFn: objectUpdate,
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ["entity", e.id] });
      qc.invalidateQueries({ queryKey: ["entities", universeId, "Object"] });
    },
  });

  const prevEditing = useRef(editing);
  useEffect(() => {
    if (editing && !prevEditing.current) {
      const c = objectContent(entity);
      setName(entity.name);
      setSummary(entity.summary ?? "");
      setKind(c.kind);
      setOrigin(c.origin ?? "");
      setOwner(c.owner ?? "");
      setPropertiesRaw(c.properties.join(", "));
      setDescription(c.description as TiptapDoc | string | null);
    }
    prevEditing.current = editing;
  }, [editing, entity]);

  const onSave = () => {
    if (!name.trim()) return;
    const properties = propertiesRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    updateMutation.mutate(
      {
        id: entity.id,
        name: name.trim(),
        summary: summary.trim() || undefined,
        kind,
        origin: origin.trim() || undefined,
        owner: owner.trim() || undefined,
        properties,
        description: description ?? undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <article className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Édition de l'objet</h1>
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
            <Label htmlFor="edit-obj-name">Nom *</Label>
            <Input
              id="edit-obj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-obj-kind">Type</Label>
            <select
              id="edit-obj-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ObjectKind)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {OBJECT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {objectKindLabel(k)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-obj-summary">Résumé court</Label>
          <Input
            id="edit-obj-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Une phrase pour situer l'objet."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-obj-origin">Origine</Label>
            <Input
              id="edit-obj-origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="forgé par les Nains, ramené d'Aëlis…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-obj-owner">Propriétaire actuel</Label>
            <Input
              id="edit-obj-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Lyra, le Conseil, perdu…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-obj-properties">
            Propriétés (séparées par des virgules)
          </Label>
          <Input
            id="edit-obj-properties"
            value={propertiesRaw}
            onChange={(e) => setPropertiesRaw(e.target.value)}
            placeholder="incassable, vibre près de la Faille, brûle au contact des morts"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Description</Label>
          <TiptapEditor
            value={description}
            onChange={(json) => setDescription(json)}
            placeholder="Apparence, histoire, légendes liées…"
          />
        </div>

        <AiDescriptionPanel
          targetKind="object"
          name={name}
          summary={summary || null}
          structuredFields={{
            "Type d'objet": kind,
            Origine: origin,
            "Propriétaire actuel": owner,
            Propriétés: propertiesRaw,
          }}
          onReplace={(paragraphs) => setDescription(paragraphsToDoc(paragraphs))}
          onAppend={(paragraphs) =>
            setDescription(
              appendParagraphsToDoc(
                description as TiptapDoc | null | undefined,
                paragraphs,
              ),
            )
          }
        />

        {updateMutation.isError && (
          <p className="text-sm text-destructive" role="alert">
            Erreur : {String(updateMutation.error)}
          </p>
        )}
      </article>
    );
  }

  const c = objectContent(entity);
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <Package className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground">
              Objet · {objectKindLabel(c.kind)} · créé le{" "}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Origine</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldOrEmpty value={c.origin} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Propriétaire actuel</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldOrEmpty value={c.owner} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Propriétés</CardTitle>
        </CardHeader>
        <CardContent>
          {c.properties.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {c.properties.map((p) => (
                <li
                  key={p}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {p}
                </li>
              ))}
            </ul>
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
