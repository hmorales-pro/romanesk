import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, User } from "lucide-react";

import { characterUpdate } from "@/lib/api";
import { type Entity, characterContent } from "@/lib/types";
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

interface Props {
  entity: Entity;
  universeId: string;
}

export function CharacterDetail({ entity, universeId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [archetype, setArchetype] = useState("");
  const [traitsRaw, setTraitsRaw] = useState("");
  const [biography, setBiography] = useState<TiptapDoc | string | null>(null);

  const updateMutation = useMutation({
    mutationFn: characterUpdate,
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: ["entity", e.id] });
      qc.invalidateQueries({ queryKey: ["entities", universeId, "Character"] });
    },
  });

  // Hydrate UNIQUEMENT à la transition false → true (cf. J8 : éviter
  // l'écrasement de la saisie après invalidation de query).
  const prevEditing = useRef(editing);
  useEffect(() => {
    if (editing && !prevEditing.current) {
      const c = characterContent(entity);
      setName(entity.name);
      setSummary(entity.summary ?? "");
      setArchetype(c.archetype ?? "");
      setTraitsRaw(c.traits.join(", "));
      setBiography(c.biography as TiptapDoc | string | null);
    }
    prevEditing.current = editing;
  }, [editing, entity]);

  const onSave = () => {
    if (!name.trim()) return;
    const traits = traitsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    updateMutation.mutate(
      {
        id: entity.id,
        name: name.trim(),
        summary: summary.trim() || undefined,
        archetype: archetype.trim() || undefined,
        traits,
        biography: biography ?? undefined,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <article className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Édition du personnage</h1>
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
            <Label htmlFor="edit-name">Nom *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-archetype">Archétype</Label>
            <Input
              id="edit-archetype"
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              placeholder="mentor, exilé, héritière…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-summary">Résumé court</Label>
          <Input
            id="edit-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Une phrase qui présente le personnage."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-traits">Traits (séparés par virgule)</Label>
          <Input
            id="edit-traits"
            value={traitsRaw}
            onChange={(e) => setTraitsRaw(e.target.value)}
            placeholder="calme, rancunier, érudit"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Biographie</Label>
          <TiptapEditor
            value={biography}
            onChange={(json) => setBiography(json)}
            placeholder="Histoire, motivations, secret… (mise en forme : **gras**, *italique*, listes, etc.)"
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

  const c = characterContent(entity);
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
            <User className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground">
              Personnage · créé le{" "}
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
            <CardTitle className="text-sm">Archétype</CardTitle>
          </CardHeader>
          <CardContent>
            {c.archetype ? (
              <p className="text-sm">{c.archetype}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Non renseigné</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Traits</CardTitle>
          </CardHeader>
          <CardContent>
            {c.traits.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {c.traits.map((t) => (
                  <li
                    key={t}
                    className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aucun trait</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Biographie</CardTitle>
        </CardHeader>
        <CardContent>
          {hasContent(c.biography) ? (
            <TiptapEditor
              value={c.biography as TiptapDoc | string | null}
              onChange={() => {
                /* read-only mode */
              }}
              editable={false}
              className="border-0 px-0"
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Pas encore de biographie. Clique « Modifier » pour en ajouter.
            </p>
          )}
        </CardContent>
      </Card>

      <RelationsSection entity={entity} />
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
