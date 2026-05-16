/**
 * Surface d'écriture multi-chapitres pour une `Story` (P8.2 — refonte
 * éditoriale de la layout, charte § 05 — Démonstration).
 *
 * Layout :
 *   ┌── 240 ──┬─────────── 1fr ─────────────┐
 *   │ Sidebar │     Éditeur  │   Sparring    │
 *   │ chap.   │   (Tiptap)   │   (3 panels)  │
 *   └─────────┴──────────────┴───────────────┘
 *
 * Le state `body` du chapitre actif vit dans `ChapterWorkspace` qui
 * englobe l'éditeur central et les panneaux IA — comme ça l'éditeur et
 * les panels partagent le même doc Tiptap (continuation IA = append au
 * doc, réécriture = replace).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Download, Plus, Save, Trash2 } from "lucide-react";

import {
  chapterCreate,
  chapterDelete,
  chapterListForStory,
  chapterReorder,
  chapterUpdate,
  storyExportMarkdown,
  storyGet,
  universeGet,
} from "@/lib/api";
import {
  CHAPTER_STATUSES,
  type Chapter,
  type ChapterStatus,
  chapterStatusLabel,
  countWordsInTiptap,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Glyph } from "@/components/ui/glyph";
import { Pill } from "@/components/ui/pill";
import { alertDialog, confirmDialog } from "@/lib/dialog";
import { writeToClipboard } from "@/lib/clipboard";
import { TiptapEditor, type TiptapDoc } from "@/components/TiptapEditor";
import { AiContinuePanel } from "@/components/AiContinuePanel";
import { AiActionsPanel } from "@/components/AiActionsPanel";
import { AiConsistencyPanel } from "@/components/AiConsistencyPanel";
import { UnknownNamesPanel } from "@/components/UnknownNamesPanel";
import { usePageMeta } from "@/components/PageMeta";
import {
  appendParagraphsToDoc,
  paragraphsToDoc,
} from "@/lib/tiptap-utils";
import type { Story } from "@/lib/types";

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
      // Hotfix freeze : on pousse le nouveau chapitre dans la cache
      // *avant* setActiveId. Sinon, entre `invalidateChapters` (refetch
      // async) et l'arrivée des données, le useEffect L111 qui valide
      // activeId voit que `created.id` n'est pas dans `chapters` et le
      // réécrit en `chapters[0].id` — l'user se retrouve coincé sur le
      // chapitre précédent et l'éditeur Tiptap se démonte/remonte en
      // cascade (= freeze visible).
      qc.setQueryData<Chapter[]>(["chapters", storyId], (old) =>
        old ? [...old, created] : [created],
      );
      // Le refetch en background sync les champs serveur (created_at, …).
      void invalidateChapters();
      setActiveId(created.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: chapterUpdate,
    onSuccess: invalidateChapters,
  });
  const deleteMutation = useMutation({
    mutationFn: chapterDelete,
    onSuccess: (_void, deletedId) => {
      // Idem au create : on retire de la cache immédiatement pour éviter
      // que activeChapter pointe sur un fantôme pendant le refetch.
      qc.setQueryData<Chapter[]>(["chapters", storyId], (old) =>
        old ? old.filter((c) => c.id !== deletedId) : [],
      );
      void invalidateChapters();
    },
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

  const activeIndex = useMemo(
    () =>
      activeChapter ? chapters.findIndex((c) => c.id === activeChapter.id) : -1,
    [activeChapter, chapters],
  );

  const universeName = universeQuery.data?.name ?? "Univers";
  const universeSlug = universeName.toLowerCase().replace(/\s+/g, "");
  const totalWords = chapters.reduce((acc, c) => acc + c.word_count, 0);
  const activeWords = activeChapter?.word_count ?? 0;
  const breadcrumb = activeChapter
    ? `${universeSlug}.romanesk · Chapitre ${activeIndex + 1}${
        activeChapter.title ? ` — ${activeChapter.title}` : ""
      }`
    : `${universeSlug}.romanesk · ${storyQuery.data?.title ?? ""}`;
  const meta = activeChapter
    ? `${activeWords.toLocaleString("fr-FR")} mots · sauvegardé`
    : `${totalWords.toLocaleString("fr-FR")} mots · ${chapters.length} chapitres`;
  usePageMeta({ breadcrumb, meta });

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

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    if (!draggedId || draggedId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  };

  const onDragLeaveItem = () => {
    setOverId(null);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragged = draggedId;
    setDraggedId(null);
    setOverId(null);
    if (!dragged || dragged === targetId) return;
    const fromIdx = chapters.findIndex((c) => c.id === dragged);
    const toIdx = chapters.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...chapters];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    reorderMutation.mutate(
      next.map((c, i) => ({ id: c.id, sortOrder: i })),
    );
  };

  const onDragEnd = () => {
    setDraggedId(null);
    setOverId(null);
  };

  const onDelete = async (chapter: Chapter) => {
    const ok = await confirmDialog({
      title: `Supprimer ce chapitre ?`,
      body: `« ${chapter.title ?? "(sans titre)"} » sera retiré de l'histoire. Action irréversible.`,
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(chapter.id);
  };

  if (!universeId || !storyId) return null;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-0 px-4 py-4">
      <div className="overflow-hidden rounded-[4px] border border-rule bg-paper-deep">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* ─────────── Sidebar gauche : chapitres ─────────── */}
          <aside className="border-b border-rule bg-[color-mix(in_oklab,var(--paper-deep)_80%,var(--paper-shade))] p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between pb-3">
              <Eyebrow bullet={false}>
                {storyQuery.data?.title ?? "Histoire"} · {chapters.length}{" "}
                chap.
              </Eyebrow>
              <button
                type="button"
                onClick={onCreate}
                disabled={createMutation.isPending}
                className="inline-flex size-6 items-center justify-center rounded-[2px] text-ink-faint transition hover:bg-paper hover:text-bordeaux disabled:opacity-50"
                title="Nouveau chapitre"
              >
                <Plus className="size-3.5" aria-hidden />
              </button>
            </div>

            {chaptersQuery.isPending && (
              <p className="font-body text-sm italic text-ink-faint">
                Chargement…
              </p>
            )}
            {chapters.length === 0 && !chaptersQuery.isPending && (
              <p className="font-body text-sm italic text-ink-faint">
                Aucun chapitre. Crée le premier.
              </p>
            )}

            <ol className="flex flex-col gap-0.5">
              {chapters.map((c, i) => {
                const active = c.id === activeId;
                const isDragging = draggedId === c.id;
                const isDropTarget = overId === c.id && draggedId !== c.id;
                return (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, c.id)}
                    onDragOver={(e) => onDragOver(e, c.id)}
                    onDragLeave={onDragLeaveItem}
                    onDrop={(e) => onDrop(e, c.id)}
                    onDragEnd={onDragEnd}
                    className={[
                      "group flex cursor-default items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-[14px] text-ink transition",
                      active
                        ? "bg-paper shadow-[inset_2px_0_0_var(--bordeaux)]"
                        : "hover:bg-[color-mix(in_oklab,var(--paper)_55%,transparent)]",
                      isDragging ? "opacity-40" : "",
                      isDropTarget
                        ? "bg-[color-mix(in_oklab,var(--bordeaux)_8%,transparent)]"
                        : "",
                    ].join(" ")}
                  >
                    <Glyph kind="chapter" letter={String(i + 1)} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setActiveId(c.id)}
                    >
                      <div className="truncate font-body">
                        {c.title ?? "(sans titre)"}
                      </div>
                    </button>
                    <span className="font-mono text-[10px] tracking-[0.06em] text-ink-faint">
                      {c.word_count.toLocaleString("fr-FR")}
                    </span>
                    <div className="flex flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                        onClick={() => onMove(c, -1)}
                        disabled={i === 0 || reorderMutation.isPending}
                        title="Monter"
                        aria-label="Monter"
                      >
                        <ArrowUp className="size-3" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                        onClick={() => onMove(c, 1)}
                        disabled={
                          i === chapters.length - 1 ||
                          reorderMutation.isPending
                        }
                        title="Descendre"
                        aria-label="Descendre"
                      >
                        <ArrowDown className="size-3" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 border-t border-dotted border-rule pt-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const md = await storyExportMarkdown(storyId);
                    await writeToClipboard(md);
                    void alertDialog(
                      `${md.length} caractères copiés dans le presse-papier.`,
                      { title: "Markdown exporté" },
                    );
                  } catch (err) {
                    void alertDialog(String(err), {
                      title: "Échec de l'export",
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint transition hover:text-bordeaux"
                title="Exporter cette histoire en Markdown"
              >
                <Download className="size-3" aria-hidden />
                Exporter MD
              </button>
            </div>
          </aside>

          {/* ─────────── Workspace : éditeur + sparring partner ─────────── */}
          <div className="min-w-0">
            {!activeChapter && chapters.length === 0 && (
              <div className="m-6 rounded-[3px] border border-dashed border-rule p-8 text-center font-body italic text-ink-faint">
                Crée un chapitre pour commencer à écrire.
              </div>
            )}
            {activeChapter && storyQuery.data && (
              // P11.y (hotfix freeze) — pas de `key={activeChapter.id}` ici.
              // Avec une key qui change à chaque switch de chapitre, on
              // démontait/remontait ChapterWorkspace + Tiptap + les 3
              // panels IA d'un coup, ce qui pouvait freezer pendant
              // plusieurs secondes. ChapterWorkspace gère désormais le
              // resync de son state local via un useEffect[chapter.id].
              <ChapterWorkspace
                universeId={universeId}
                chapter={activeChapter}
                story={storyQuery.data}
                chapterIndex={activeIndex}
                onSave={(args) => updateMutation.mutateAsync(args)}
                onDelete={() => onDelete(activeChapter)}
                saving={updateMutation.isPending}
                deleting={deleteMutation.isPending}
              />
            )}
          </div>
        </div>
      </div>

      {/* Le footer mince légende des kinds est maintenant rendu globalement
       * par Layout (P8.3-E) — toutes les pages en bénéficient. */}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ChapterWorkspace — colonne éditeur + sparring partner
// ─────────────────────────────────────────────────────────────────────────

interface ChapterWorkspaceProps {
  universeId: string;
  chapter: Chapter;
  story: Story;
  chapterIndex: number;
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

function ChapterWorkspace({
  universeId,
  chapter,
  story,
  chapterIndex,
  onSave,
  onDelete,
  saving,
  deleting,
}: ChapterWorkspaceProps) {
  const [title, setTitle] = useState(chapter.title ?? "");
  const [body, setBody] = useState<TiptapDoc>(chapter.body_json as TiptapDoc);
  const [status, setStatus] = useState<ChapterStatus>(chapter.status);
  const initialRef = useRef({
    title: chapter.title ?? "",
    bodyJson: JSON.stringify(chapter.body_json),
    status: chapter.status,
  });
  const [savedFlash, setSavedFlash] = useState(false);

  // P11.y — resync explicite quand on change de chapitre. Plus rapide
  // qu'un démontage/remontage complet (ancien pattern via key prop) :
  // Tiptap garde son instance, on lui passe juste le nouveau body via
  // sa prop value (TiptapEditor a déjà un useEffect qui detect le
  // changement de prop et fait setContent sans re-déclencher onChange).
  useEffect(() => {
    setTitle(chapter.title ?? "");
    setBody(chapter.body_json as TiptapDoc);
    setStatus(chapter.status);
    initialRef.current = {
      title: chapter.title ?? "",
      bodyJson: JSON.stringify(chapter.body_json),
      status: chapter.status,
    };
    setSavedFlash(false);
  }, [chapter.id, chapter.title, chapter.body_json, chapter.status]);

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

  // Cmd/Ctrl-S manuel.
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
  }, [dirty, saving, body, title, status]);

  // Auto-save 3s.
  const AUTOSAVE_DELAY_MS = 3000;
  const autosaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty || saving) {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void save();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [dirty, saving, body, title, status]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Centre : éditeur Tiptap */}
      <div className="bg-paper">
        {/* Hint éditorial */}
        <div className="border-b border-rule bg-[color-mix(in_oklab,var(--bordeaux)_5%,var(--paper))] px-7 py-2 font-mono text-[11px] tracking-[0.02em] text-ink-faint">
          Cmd/Ctrl-S pour sauver · sauvegarde auto 3 s · les guillemets «&nbsp;»,
          cadratins et apostrophes typographiques se posent tout seuls
        </div>

        {/* Cartouche du chapitre */}
        <div className="px-7 pb-2 pt-7">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              Chapitre {chapterIndex + 1}
            </span>
            <span className="font-body text-[12px] italic text-ink-faint">
              ·{" "}
              {savedFlash && !dirty
                ? "enregistré"
                : saving
                ? "sauvegarde…"
                : dirty
                ? "modifié"
                : "à jour"}
            </span>
          </div>
          <Label htmlFor="ch-title" className="sr-only">
            Titre du chapitre
          </Label>
          <Input
            id="ch-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre du chapitre"
            className="mt-1 border-0 bg-transparent px-0 font-display text-[28px] font-medium leading-[1.1] tracking-[-0.01em] text-ink shadow-none focus-visible:ring-0"
          />
          <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
            {(title.trim() || "Sans titre")} ·{" "}
            {wordCount.toLocaleString("fr-FR")} mots
          </div>
        </div>

        {/* Éditeur Tiptap — P11.y : pleine hauteur via min-h-[60vh].
         * S'adapte à la taille du viewport, donne ~60% d'écran à
         * l'écriture quoiqu'il arrive. */}
        <div className="px-1 pb-4">
          <TiptapEditor
            value={body}
            onChange={setBody}
            placeholder="Écris ton chapitre…"
            className="min-h-[60vh]"
            toolbar
            frenchTypography
          />
        </div>

        {/* Barre du bas — statut + actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper-deep/50 px-7 py-3 font-mono text-[11px] text-ink-faint">
          <select
            id="ch-status"
            className="h-7 rounded-[3px] border border-rule bg-paper px-2 font-body text-[12px] text-ink"
            value={status}
            onChange={(e) => setStatus(e.target.value as ChapterStatus)}
          >
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {chapterStatusLabel(s)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
            variant="outline"
          >
            <Save className="size-3.5" aria-hidden />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <span className="ml-auto">
            {saving
              ? "sauvegarde…"
              : dirty
              ? "auto-save dans quelques secondes"
              : savedFlash
              ? "✓ enregistré"
              : "à jour"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-ink-faint hover:text-bordeaux"
            onClick={onDelete}
            disabled={deleting}
            title="Supprimer ce chapitre"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Droite : sparring partner */}
      <aside className="border-t border-rule bg-[color-mix(in_oklab,var(--paper-deep)_90%,var(--paper-shade))] p-4 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between pb-3">
          <Eyebrow bullet={false}>Sparring partner</Eyebrow>
          <Pill tone="bordeaux">Modèle créatif</Pill>
        </div>
        <div className="flex flex-col gap-4">
          <AiContinuePanel
            story={story}
            chapterTitle={chapter.title}
            body={body}
            onAccept={(paragraphs) =>
              setBody(appendParagraphsToDoc(body, paragraphs))
            }
          />
          <AiActionsPanel
            story={story}
            chapterTitle={chapter.title}
            body={body}
            onReplaceBody={(paragraphs) => setBody(paragraphsToDoc(paragraphs))}
          />
          <AiConsistencyPanel
            universeId={universeId}
            story={story}
            chapterTitle={chapter.title}
            body={body}
          />
          <UnknownNamesPanel
            chapterId={chapter.id}
            universeId={universeId}
            body={body}
          />
        </div>
      </aside>
    </div>
  );
}
