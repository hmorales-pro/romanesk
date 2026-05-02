/**
 * Section « Histoires » d'un univers (Phase 4).
 *
 * Liste, crée, édite et supprime des `Story` rattachées à l'univers courant.
 * L'ouverture d'une histoire (page d'écriture multi-chapitres) viendra en
 * P4.3 : pour l'instant on affiche juste un placeholder désactivé.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  storyCreate,
  storyDelete,
  storyListInUniverse,
  storyUpdate,
} from "@/lib/api";
import {
  STORY_STATUSES,
  STORY_TYPES,
  type Story,
  type StoryType,
  storyStatusLabel,
  storyTypeLabel,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface StoriesSectionProps {
  universeId: string;
}

export function StoriesSection({ universeId }: StoriesSectionProps) {
  const qc = useQueryClient();
  const storiesQuery = useQuery({
    queryKey: ["stories", universeId],
    queryFn: () => storyListInUniverse(universeId),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["stories", universeId] });

  const createMutation = useMutation({
    mutationFn: storyCreate,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: storyUpdate,
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: storyDelete,
    onSuccess: invalidate,
  });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<StoryType>("novel");
  const [synopsis, setSynopsis] = useState("");
  const [target, setTarget] = useState("");

  const resetForm = () => {
    setTitle("");
    setType("novel");
    setSynopsis("");
    setTarget("");
  };

  const onCreate = () => {
    if (!title.trim()) return;
    const targetNum = target.trim() ? Number.parseInt(target, 10) : undefined;
    createMutation.mutate(
      {
        universeId,
        title: title.trim(),
        type,
        synopsis: synopsis.trim() || undefined,
        targetWordCount:
          targetNum !== undefined && Number.isFinite(targetNum) && targetNum >= 0
            ? targetNum
            : undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          setShowForm(false);
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="size-4" aria-hidden /> Histoires
        </h2>
        {!showForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
            disabled={createMutation.isPending}
          >
            <Plus className="size-4" aria-hidden /> Nouvelle histoire
          </Button>
        )}
      </header>

      {showForm && (
        <div className="rounded-md border bg-card p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-title">Titre</Label>
            <Input
              id="story-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="La Chute des Quatre"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-type">Type</Label>
              <select
                id="story-type"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as StoryType)}
              >
                {STORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {storyTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-target">Objectif (mots)</Label>
              <Input
                id="story-target"
                type="number"
                min={0}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="90 000"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="story-synopsis">Synopsis (optionnel)</Label>
            <Textarea
              id="story-synopsis"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Quatre rois, un trône, zéro héritier."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              <X className="size-4" aria-hidden /> Annuler
            </Button>
            <Button
              size="sm"
              onClick={onCreate}
              disabled={!title.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Création…" : "Créer"}
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {String(createMutation.error)}
            </p>
          )}
        </div>
      )}

      {storiesQuery.isPending && (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}
      {storiesQuery.data && storiesQuery.data.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">
          Aucune histoire. Crée la première pour commencer à écrire.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(storiesQuery.data ?? []).map((s) => (
          <StoryCard
            key={s.id}
            story={s}
            onUpdate={(args) => updateMutation.mutateAsync(args)}
            onDelete={() => {
              if (
                window.confirm(
                  `Supprimer l'histoire « ${s.title} » ? (les chapitres seront perdus)`,
                )
              ) {
                deleteMutation.mutate(s.id);
              }
            }}
            updating={updateMutation.isPending}
            deleting={deleteMutation.isPending}
          />
        ))}
      </div>
    </section>
  );
}

interface StoryCardProps {
  story: Story;
  onUpdate: (args: {
    id: string;
    title: string;
    type: StoryType;
    synopsis?: string;
    status: string;
    targetWordCount?: number;
  }) => Promise<Story>;
  onDelete: () => void;
  updating: boolean;
  deleting: boolean;
}

function StoryCard({
  story,
  onUpdate,
  onDelete,
  updating,
  deleting,
}: StoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [type, setType] = useState<StoryType>(story.type);
  const [synopsis, setSynopsis] = useState(story.synopsis ?? "");
  const [status, setStatus] = useState(story.status);
  const [target, setTarget] = useState(
    story.target_word_count != null ? String(story.target_word_count) : "",
  );

  const cancel = () => {
    setTitle(story.title);
    setType(story.type);
    setSynopsis(story.synopsis ?? "");
    setStatus(story.status);
    setTarget(
      story.target_word_count != null ? String(story.target_word_count) : "",
    );
    setEditing(false);
  };

  const save = async () => {
    if (!title.trim()) return;
    const targetNum = target.trim() ? Number.parseInt(target, 10) : undefined;
    await onUpdate({
      id: story.id,
      title: title.trim(),
      type,
      synopsis: synopsis.trim() || undefined,
      status: status.trim() || "drafting",
      targetWordCount:
        targetNum !== undefined && Number.isFinite(targetNum) && targetNum >= 0
          ? targetNum
          : undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-md border bg-card p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`edit-title-${story.id}`}>Titre</Label>
          <Input
            id={`edit-title-${story.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-type-${story.id}`}>Type</Label>
            <select
              id={`edit-type-${story.id}`}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as StoryType)}
            >
              {STORY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {storyTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-status-${story.id}`}>Statut</Label>
            <select
              id={`edit-status-${story.id}`}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STORY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {storyStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-target-${story.id}`}>Objectif (mots)</Label>
            <Input
              id={`edit-target-${story.id}`}
              type="number"
              min={0}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`edit-syn-${story.id}`}>Synopsis</Label>
          <Textarea
            id={`edit-syn-${story.id}`}
            rows={3}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={cancel}>
            <X className="size-4" aria-hidden /> Annuler
          </Button>
          <Button size="sm" onClick={save} disabled={!title.trim() || updating}>
            {updating ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{story.title}</span>
          <span className="text-xs rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
            {storyTypeLabel(story.type)}
          </span>
          <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
            {storyStatusLabel(story.status)}
          </span>
          {story.target_word_count != null && (
            <span className="text-xs text-muted-foreground">
              objectif {story.target_word_count.toLocaleString("fr-FR")} mots
            </span>
          )}
        </div>
        {story.synopsis && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {story.synopsis}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Page d'écriture multi-chapitres : disponible en P4.3.
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
          disabled={updating || deleting}
        >
          <Pencil className="size-3.5" aria-hidden /> Modifier
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="size-3.5" aria-hidden /> Supprimer
        </Button>
      </div>
    </div>
  );
}
