/**
 * Surface d'écriture multi-chapitres pour une `Story` (Phase 4.3).
 *
 * Layout 2 colonnes :
 * - Sidebar gauche : liste des chapitres (sort_order croissant), bouton
 *   « Nouveau chapitre », boutons ▲/▼ pour réordonner localement, suppression.
 * - Centre : titre du chapitre actif éditable + éditeur Tiptap pour le corps,
 *   bouton « Enregistrer ». Le `word_count` est calculé à la volée côté front.
 *
 * Le save reste manuel (pas d'auto-save) en P4.3 pour éviter les races avec
 * la mutation react-query — l'auto-save (debounce + dirty tracking) viendra
 * en P4.x si Hugo le veut.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  chapterCreate,
  chapterDelete,
  chapterListForStory,
  chapterReorder,
  chapterUpdate,
  storyGet,
  universeGet,
} from "@/lib/api";
import {
  CHAPTER_STATUSES,
  type Chapter,
  type ChapterStatus,
  chapterStatusLabel,
  countWordsInTiptap,
  storyTypeLabel,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TiptapEditor, type TiptapDoc } from "@/components/TiptapEditor";

export default function StoryPage() {
  const { universeId, storyId } = useParams<{
    universeId: string;
    storyId: string;
  }>();
  const qc = useQueryClient();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const storyQuery = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => storyGet(storyId!),
    enabled: !!storyId,
  });

  const chaptersQuery = useQuery({
    queryKey: ["chapters", storyId],
    queryFn: () => chapterListForStory(storyId!),
    enabled: !!storyId,
  });

  const invalidateChapters = () =>
    qc.invalidateQueries({ queryKey: ["chapters", storyId] });

  const createMutation = useMutation({
    mutationFn: chapterCreate,
    onSuccess: (created) => {
      invalidateChapters();
      // Active automatiquement le nouveau chapitre.
      setActiveId(created.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: chapterUpdate,
    onSuccess: invalidateChapters,
  });
  const deleteMutation = useMutation({
    mutationFn: chapterDelete,
    onSuccess: invalidateChapters,
  });
  const reorderMutation = useMutation({
    mutationFn: chapterReorder,
    onSuccess: invalidateChapters,
  });

  const chapters = useMemo(
    () => chaptersQuery.data ?? [],
    [chaptersQuery.data],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sélection auto : premier chapitre quand la liste arrive et qu'aucun
  // n'est actif. Préserve la sélection si elle reste valide.
  useEffect(() => {
    if (chapters.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !chapters.some((c) => c.id === activeId)) {
      setActiveId(chapters[0].id);
    }
  }, [chapters, activeId]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );

  const onCreate = () => {
    if (!storyId) return;
    const nextNum = chapters.length + 1;
    createMutation.mutate({
      storyId,
      title: `Chapitre ${nextNum}`,
    });
  };

  const onMove = (chapter: Chapter, direction: -1 | 1) => {
    const idx = chapters.findIndex((c) => c.id === chapter.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= chapters.length) return;
    const a = chapters[idx];
    const b = chapters[swapIdx];
    reorderMutation.mutate([
      { id: a.id, sortOrder: b.sort_order },
      { id: b.id, sortOrder: a.sort_order },
    ]);
  };

  const onDelete = (chapter: Chapter) => {
    if (
      !window.confirm(
        `Supprimer le chapitre « ${chapter.title ?? "(sans titre)"} » ? (irréversible)`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(chapter.id);
  };

  if (!universeId || !storyId) return null;

  return (
    <div className="container mx-auto px-6 py-6 flex flex-col gap-4">
      <nav className="flex items-center gap-2 text-sm">
        <Link
          to={`/u/${universeId}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Univers
        </Link>
        {universeQuery.data && (
          <span className="text-muted-foreground">/ {universeQuery.data.name}</span>
        )}
      </nav>

      <header className="flex items-start gap-3">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <BookOpen className="size-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">
            {storyQuery.data?.title ?? "Chargement…"}
          </h1>
          {storyQuery.data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {storyTypeLabel(storyQuery.data.type)} ·{" "}
              {chapters.length} chapitre{chapters.length > 1 ? "s" : ""} ·{" "}
              {chapters.reduce((acc, c) => acc + c.word_count, 0).toLocaleString("fr-FR")}{" "}
              mots écrits
              {storyQuery.data.target_word_count != null &&
                ` / ${storyQuery.data.target_word_count.toLocaleString("fr-FR")}`}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Sidebar chapitres */}
        <aside className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Chapitres
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={onCreate}
              disabled={createMutation.isPending}
            >
              <Plus className="size-3.5" aria-hidden />
            </Button>
          </div>
          {chaptersQuery.isPending && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {chapters.length === 0 && !chaptersQuery.isPending && (
            <p className="text-sm text-muted-foreground">
              Aucun chapitre. Crée le premier pour commencer.
            </p>
          )}
          <ol className="flex flex-col gap-1">
            {chapters.map((c, i) => {
              const active = c.id === activeId;
              return (
                <li
                  key={c.id}
                  className={`rounded-md border p-2 flex items-start gap-2 ${
                    active ? "bg-accent border-primary" : "bg-card hover:bg-accent/40"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => setActiveId(c.id)}
                  >
                    <div className="text-xs text-muted-foreground">
                      Ch. {i + 1} · {chapterStatusLabel(c.status)}
                    </div>
                    <div className="text-sm font-medium truncate">
                      {c.title ?? "(sans titre)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.word_count.toLocaleString("fr-FR")} mots
                    </div>
                  </button>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => onMove(c, -1)}
                      disabled={i === 0 || reorderMutation.isPending}
                      title="Monter"
                      aria-label="Monter"
                    >
                      <ArrowUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => onMove(c, 1)}
                      disabled={
                        i === chapters.length - 1 || reorderMutation.isPending
                      }
                      title="Descendre"
                      aria-label="Descendre"
                    >
                      <ArrowDown className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Éditeur */}
        <main className="min-w-0">
          {!activeChapter && chapters.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Crée un chapitre pour commencer à écrire.
            </div>
          )}
          {activeChapter && (
            <ChapterEditor
              key={activeChapter.id}
              chapter={activeChapter}
              onSave={(args) => updateMutation.mutateAsync(args)}
              onDelete={() => onDelete(activeChapter)}
              saving={updateMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          )}
        </main>
      </div>
    </div>
  );
}

interface ChapterEditorProps {
  chapter: Chapter;
  onSave: (args: {
    id: string;
    title?: string;
    bodyJson: Record<string, unknown>;
    wordCount: number;
    status: ChapterStatus;
  }) => Promise<Chapter>;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}

function ChapterEditor({
  chapter,
  onSave,
  onDelete,
  saving,
  deleting,
}: ChapterEditorProps) {
  const [title, setTitle] = useState(chapter.title ?? "");
  const [body, setBody] = useState<TiptapDoc>(chapter.body_json as TiptapDoc);
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  // Le ref garde la dernière version DB pour calculer "dirty".
  const initialRef = useRef({
    title: chapter.title ?? "",
    bodyJson: JSON.stringify(chapter.body_json),
    status: chapter.status,
  });
  const [savedFlash, setSavedFlash] = useState(false);

  const wordCount = useMemo(() => countWordsInTiptap(body), [body]);
  const dirty = useMemo(() => {
    if ((title.trim() || "") !== initialRef.current.title) return true;
    if (status !== initialRef.current.status) return true;
    if (JSON.stringify(body) !== initialRef.current.bodyJson) return true;
    return false;
  }, [title, body, status]);

  const save = async () => {
    const updated = await onSave({
      id: chapter.id,
      title: title.trim() || undefined,
      bodyJson: body as Record<string, unknown>,
      wordCount,
      status,
    });
    initialRef.current = {
      title: updated.title ?? "",
      bodyJson: JSON.stringify(updated.body_json),
      status: updated.status,
    };
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  // Ctrl/Cmd-S pour sauver — réflexe d'écriture.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) {
          void save();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dirty, saving, body, title, status, save]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="ch-title" className="sr-only">
            Titre du chapitre
          </Label>
          <Input
            id="ch-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre du chapitre"
            className="text-lg font-semibold"
          />
        </div>
        <div>
          <Label htmlFor="ch-status" className="sr-only">
            Statut
          </Label>
          <select
            id="ch-status"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as ChapterStatus)}
          >
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {chapterStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={save} disabled={!dirty || saving}>
          <Save className="size-4" aria-hidden />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {savedFlash && !dirty && (
          <span className="text-xs text-emerald-600">✓ enregistré</span>
        )}
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          title="Supprimer ce chapitre"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <TiptapEditor
        value={body}
        onChange={setBody}
        placeholder="Écris ton chapitre…"
        className="min-h-[400px]"
      />

      <div className="text-xs text-muted-foreground flex items-center gap-3">
        <span>{wordCount.toLocaleString("fr-FR")} mots</span>
        {dirty && <span className="text-amber-600">• non enregistré</span>}
        <span className="ml-auto">Ctrl/Cmd-S pour sauver</span>
      </div>
    </div>
  );
}
