/**
 * EntityRenameDialog (P14.1c)
 *
 * Modale Romanesk pour le refactoring de nom d'une entité dans tout
 * l'univers — équivalent du « rename symbol » d'un IDE, adapté à la
 * fiction.
 *
 * Workflow :
 *   1. L'utilisateur saisit le nouveau nom et clique « Chercher ».
 *   2. Le backend scanne tous les chapitres + autres entités à la
 *      recherche du nom courant (word-boundary, pas de sub-string).
 *   3. La liste des occurrences s'affiche, regroupée par section
 *      (Chapitres, Fiches), avec extrait italique en contexte et une
 *      checkbox individuelle (toutes cochées par défaut).
 *   4. L'utilisateur exclut éventuellement les faux positifs et clique
 *      « Renommer N occurrences ».
 *
 * On utilise un overlay <div fixed top-[38px]> (pas <dialog showModal>)
 * pour la même raison qu'ImportProgressOverlay : laisser la titlebar
 * Tauri draggable pendant qu'on travaille.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, X } from "lucide-react";

import {
  entityFindMentions,
  entityRenameInUniverse,
  type Mention,
  type MentionLocationKey,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/ui/eyebrow";

interface EntityRenameDialogProps {
  open: boolean;
  entityId: string;
  currentName: string;
  onClose: () => void;
  onRenamed?: (newName: string) => void;
}

/** Sérialisation stable pour comparer / cocher des MentionLocationKey. */
function keyId(k: MentionLocationKey): string {
  switch (k.kind) {
    case "chapter":
      return `c:${k.chapterId}`;
    case "entitySummary":
      return `es:${k.entityId}`;
    case "entityField":
      return `ef:${k.entityId}:${k.field}`;
  }
}

export function EntityRenameDialog({
  open,
  entityId,
  currentName,
  onClose,
  onRenamed,
}: EntityRenameDialogProps) {
  const [newName, setNewName] = useState(currentName);
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset à chaque ouverture.
  useEffect(() => {
    if (open) {
      setNewName(currentName);
      setMentions(null);
      setSelected(new Set());
    }
  }, [open, currentName]);

  // ESC ferme.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const findMutation = useMutation({
    mutationFn: () => entityFindMentions(entityId),
    onSuccess: (res) => {
      setMentions(res.mentions);
      // Toutes cochées par défaut.
      setSelected(new Set(res.mentions.map((m) => keyId(m.key))));
    },
  });

  const renameMutation = useMutation({
    mutationFn: () => {
      const locations =
        mentions
          ?.filter((m) => selected.has(keyId(m.key)))
          .map((m) => m.key) ?? [];
      return entityRenameInUniverse({
        entityId,
        newName: newName.trim(),
        locations,
      });
    },
    onSuccess: (res) => {
      onRenamed?.(res.renamedEntity.name);
      onClose();
    },
  });

  // Groupage par section (chapter / entity).
  const sections = useMemo(() => {
    if (!mentions) return null;
    const chapters = mentions.filter((m) => m.key.kind === "chapter");
    const entities = mentions.filter((m) => m.key.kind !== "chapter");
    return { chapters, entities };
  }, [mentions]);

  const toggleAll = (group: Mention[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of group) {
        const id = keyId(m.key);
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const totalSelected = selected.size;
  const totalOccurrences = mentions
    ?.filter((m) => selected.has(keyId(m.key)))
    .reduce((sum, m) => sum + m.count, 0) ?? 0;
  const sameAsCurrent = newName.trim() === currentName.trim();
  const canSearch = !sameAsCurrent && newName.trim().length > 0;

  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 top-[38px] z-40 flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--ink)_45%,transparent)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-[min(760px,92vw)] max-h-[80vh] overflow-hidden rounded-[4px] border border-rule bg-paper text-ink shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]">
        <div className="flex flex-col gap-4 p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Eyebrow>Refactoring · rename propagé</Eyebrow>
              <h2 className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
                Renommer{" "}
                <em className="font-display italic font-normal text-bordeaux">
                  « {currentName} »
                </em>
              </h2>
              <p className="font-body text-[13px] italic leading-snug text-ink-faint">
                Cherche toutes les occurrences dans les chapitres et autres
                fiches, puis remplace dans celles que tu choisis.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-faint transition hover:text-bordeaux"
              aria-label="Fermer"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* Champ nouveau nom */}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rename-new-name">Nouveau nom</Label>
              <Input
                id="rename-new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                maxLength={120}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    canSearch &&
                    !findMutation.isPending
                  ) {
                    e.preventDefault();
                    findMutation.mutate();
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              onClick={() => findMutation.mutate()}
              disabled={!canSearch || findMutation.isPending}
            >
              <Search className="size-3.5" aria-hidden />
              {findMutation.isPending
                ? "Recherche…"
                : mentions
                  ? "Re-chercher"
                  : "Chercher les occurrences"}
            </Button>
          </div>

          {findMutation.isError && (
            <p className="font-body text-[13px] italic text-bordeaux">
              {String(findMutation.error)}
            </p>
          )}

          {/* Résultats */}
          {sections && (
            <div className="flex flex-col gap-3 overflow-y-auto rounded-[3px] border border-dashed border-rule bg-paper-deep/40 p-4">
              {sections.chapters.length === 0 &&
                sections.entities.length === 0 && (
                  <p className="font-body text-[13px] italic text-ink-faint">
                    Aucune occurrence dans les chapitres ni dans les autres
                    fiches. Si tu valides quand même, seul le nom de la fiche
                    elle-même sera changé.
                  </p>
                )}

              {sections.chapters.length > 0 && (
                <SectionGroup
                  title={`Chapitres · ${sections.chapters.length}`}
                  mentions={sections.chapters}
                  selected={selected}
                  setSelected={setSelected}
                  toggleAll={(on) => toggleAll(sections.chapters, on)}
                />
              )}

              {sections.entities.length > 0 && (
                <SectionGroup
                  title={`Fiches · ${sections.entities.length}`}
                  mentions={sections.entities}
                  selected={selected}
                  setSelected={setSelected}
                  toggleAll={(on) => toggleAll(sections.entities, on)}
                />
              )}
            </div>
          )}

          {renameMutation.isError && (
            <p className="font-body text-[13px] italic text-bordeaux">
              {String(renameMutation.error)}
            </p>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
              {mentions
                ? `${totalSelected} location${
                    totalSelected > 1 ? "s" : ""
                  } sélectionnée${
                    totalSelected > 1 ? "s" : ""
                  } · ${totalOccurrences} occurrence${
                    totalOccurrences > 1 ? "s" : ""
                  }`
                : "Cherche d'abord les occurrences"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={
                  sameAsCurrent ||
                  newName.trim().length === 0 ||
                  renameMutation.isPending
                }
                onClick={() => renameMutation.mutate()}
                title={
                  mentions
                    ? `Renommer la fiche + ${totalSelected} location${
                        totalSelected > 1 ? "s" : ""
                      }`
                    : "Renommer (juste la fiche)"
                }
              >
                {renameMutation.isPending
                  ? "Renommage…"
                  : `Renommer${
                      totalSelected > 0 ? ` · ${totalSelected} loc.` : ""
                    }`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionGroup — un groupe de mentions (chapitres ou fiches)
// ---------------------------------------------------------------------------

function SectionGroup({
  title,
  mentions,
  selected,
  setSelected,
  toggleAll,
}: {
  title: string;
  mentions: Mention[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleAll: (on: boolean) => void;
}) {
  const allOn = mentions.every((m) => selected.has(keyId(m.key)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Eyebrow bullet={false}>{title}</Eyebrow>
        <button
          type="button"
          className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint transition hover:text-bordeaux"
          onClick={() => toggleAll(!allOn)}
        >
          {allOn ? "tout décocher" : "tout cocher"}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {mentions.map((m) => {
          const id = keyId(m.key);
          const checked = selected.has(id);
          return (
            <li key={id}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-[3px] px-2 py-1.5 transition ${
                  checked ? "bg-paper" : "bg-transparent"
                } hover:bg-paper`}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-bordeaux"
                  checked={checked}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-[14px] text-ink">
                      {m.label}
                    </span>
                    <span className="font-mono text-[10.5px] tracking-[0.06em] text-ink-faint">
                      ×{m.count}
                    </span>
                  </div>
                  {m.excerpt && (
                    <span className="font-body text-[12.5px] italic leading-snug text-ink-faint">
                      {m.excerpt}
                    </span>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
