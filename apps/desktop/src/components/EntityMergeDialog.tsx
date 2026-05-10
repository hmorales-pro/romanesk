/**
 * EntityMergeDialog (P14.2b)
 *
 * Modale de fusion de deux fiches du même type. La fiche courante
 * (target) survit ; l'utilisateur choisit une autre fiche du même
 * univers et du même type comme « source » (qui sera soft-deleted).
 * Le nom de la source est propagé dans tous les chapitres + autres
 * fiches vers le nom de la target (équivalent au rename propagé).
 *
 * Stratégies par champ : keepTarget (défaut) / keepSource / concat.
 *
 * Même idiome UI qu'EntityRenameDialog : overlay <div fixed top-[38px]>
 * pour laisser la titlebar Tauri draggable, footer avec compteur et
 * Eyebrow d'en-tête.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitMerge, X } from "lucide-react";

import { entityListInUniverse, entityMerge, type MergeStrategy } from "@/lib/api";
import type { Entity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Glyph, glyphKindFromEntityKind } from "@/components/ui/glyph";

interface EntityMergeDialogProps {
  open: boolean;
  /** Fiche courante (qui survit). */
  target: Entity;
  universeId: string;
  onClose: () => void;
  onMerged?: (merged: Entity) => void;
}

export function EntityMergeDialog({
  open,
  target,
  universeId,
  onClose,
  onMerged,
}: EntityMergeDialogProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [summaryStrategy, setSummaryStrategy] =
    useState<MergeStrategy>("keepTarget");
  const [contentStrategy, setContentStrategy] =
    useState<MergeStrategy>("keepTarget");
  const [coverStrategy, setCoverStrategy] =
    useState<MergeStrategy>("keepTarget");

  // Reset à chaque ouverture.
  useEffect(() => {
    if (open) {
      setSourceId(null);
      setSummaryStrategy("keepTarget");
      setContentStrategy("keepTarget");
      setCoverStrategy("keepTarget");
    }
  }, [open, target.id]);

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

  // Liste des fiches candidates (même univers, même type, sauf target).
  const candidatesQuery = useQuery({
    queryKey: ["merge-candidates", universeId, target.type, target.id],
    queryFn: async () => {
      const all = await entityListInUniverse(universeId, target.type);
      return all.filter((e) => e.id !== target.id);
    },
    enabled: open,
  });

  const source = useMemo<Entity | null>(() => {
    if (!sourceId || !candidatesQuery.data) return null;
    return candidatesQuery.data.find((e) => e.id === sourceId) ?? null;
  }, [sourceId, candidatesQuery.data]);

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!sourceId) throw new Error("source non sélectionnée");
      return entityMerge({
        sourceId,
        targetId: target.id,
        summaryStrategy,
        contentStrategy,
        coverStrategy,
      });
    },
    onSuccess: (res) => {
      onMerged?.(res.mergedEntity);
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 top-[38px] z-40 flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--ink)_45%,transparent)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-[min(820px,94vw)] max-h-[84vh] overflow-hidden rounded-[4px] border border-rule bg-paper text-ink shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]">
        <div className="flex max-h-[84vh] flex-col gap-4 overflow-y-auto p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Eyebrow>Fusion · deux fiches → une seule</Eyebrow>
              <h2 className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
                Fusionner avec{" "}
                <em className="font-display italic font-normal text-bordeaux">
                  « {target.name} »
                </em>
              </h2>
              <p className="font-body text-[13px] italic leading-snug text-ink-faint">
                La fiche choisie sera absorbée dans celle-ci. Son nom sera
                remplacé partout (chapitres + autres fiches), ses relations,
                tags, snapshots et références chapitres seront redirigés.
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

          {/* Sélecteur de source */}
          <div className="flex flex-col gap-2">
            <Eyebrow bullet={false}>
              Choisis la fiche à absorber · {target.type.toLowerCase()}
            </Eyebrow>
            {candidatesQuery.isPending && (
              <p className="font-body text-[13px] italic text-ink-faint">
                Chargement des fiches…
              </p>
            )}
            {candidatesQuery.isError && (
              <p className="font-body text-[13px] italic text-bordeaux">
                Erreur : {String(candidatesQuery.error)}
              </p>
            )}
            {candidatesQuery.data && candidatesQuery.data.length === 0 && (
              <p className="font-body text-[13px] italic text-ink-faint">
                Aucune autre fiche du même type dans cet univers.
              </p>
            )}
            {candidatesQuery.data && candidatesQuery.data.length > 0 && (
              <ul className="flex max-h-[28vh] flex-col gap-1 overflow-y-auto rounded-[3px] border border-dashed border-rule bg-paper-deep/40 p-2">
                {candidatesQuery.data.map((cand) => {
                  const checked = cand.id === sourceId;
                  return (
                    <li key={cand.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-2.5 rounded-[3px] px-2 py-1.5 transition ${
                          checked ? "bg-paper" : "bg-transparent"
                        } hover:bg-paper`}
                      >
                        <input
                          type="radio"
                          name="merge-source"
                          className="mt-1.5 accent-bordeaux"
                          checked={checked}
                          onChange={() => setSourceId(cand.id)}
                        />
                        <Glyph
                          kind={glyphKindFromEntityKind(cand.type)}
                          className="mt-0.5 size-5 text-[10px]"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="font-body text-[14px] text-ink">
                            {cand.name}
                          </span>
                          {cand.summary && (
                            <span className="line-clamp-1 font-body text-[12.5px] italic leading-snug text-ink-faint">
                              {cand.summary}
                            </span>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Stratégies de fusion (visibles seulement si source choisie) */}
          {source && (
            <div className="flex flex-col gap-3 rounded-[3px] border border-rule bg-paper-deep/30 p-4">
              <Eyebrow bullet={false}>Stratégie par champ</Eyebrow>
              <StrategyRow
                label="Résumé"
                hint="Le summary court (sous le titre)."
                concatAllowed
                value={summaryStrategy}
                onChange={setSummaryStrategy}
                targetPreview={target.summary ?? "(vide)"}
                sourcePreview={source.summary ?? "(vide)"}
              />
              <StrategyRow
                label="Contenu détaillé"
                hint="Biographie, description, traits, etc. (objet JSON)."
                concatAllowed={false}
                value={contentStrategy}
                onChange={setContentStrategy}
                targetPreview={summarizeContent(target.content)}
                sourcePreview={summarizeContent(source.content)}
              />
              <StrategyRow
                label="Image de couverture"
                hint="« Concat » garde la cible si elle en a une, sinon la source."
                concatAllowed
                value={coverStrategy}
                onChange={setCoverStrategy}
                targetPreview={target.cover_image ? "(image présente)" : "(aucune)"}
                sourcePreview={source.cover_image ? "(image présente)" : "(aucune)"}
              />
            </div>
          )}

          {mergeMutation.isError && (
            <p className="font-body text-[13px] italic text-bordeaux">
              {String(mergeMutation.error)}
            </p>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 border-t border-rule pt-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
              {source
                ? `« ${source.name} » → « ${target.name} » · soft-delete + propagation`
                : "Choisis d'abord la fiche à absorber"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={!source || mergeMutation.isPending}
                onClick={() => mergeMutation.mutate()}
                title={
                  source
                    ? `Fusionner « ${source.name} » dans « ${target.name} »`
                    : "Sélectionne une fiche à absorber"
                }
              >
                <GitMerge className="size-3.5" aria-hidden />
                {mergeMutation.isPending ? "Fusion…" : "Fusionner"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StrategyRow — un toggle 3-positions pour un champ donné
// ---------------------------------------------------------------------------

function StrategyRow({
  label,
  hint,
  concatAllowed,
  value,
  onChange,
  targetPreview,
  sourcePreview,
}: {
  label: string;
  hint: string;
  concatAllowed: boolean;
  value: MergeStrategy;
  onChange: (v: MergeStrategy) => void;
  targetPreview: string;
  sourcePreview: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-body text-[14px] font-medium text-ink">
            {label}
          </span>
          <span className="font-body text-[12px] italic leading-snug text-ink-faint">
            {hint}
          </span>
        </div>
        <div className="flex shrink-0 rounded-[3px] border border-rule bg-paper">
          <SegmentButton
            active={value === "keepTarget"}
            onClick={() => onChange("keepTarget")}
            title="Garde la valeur de la fiche actuelle"
          >
            cible
          </SegmentButton>
          <SegmentButton
            active={value === "keepSource"}
            onClick={() => onChange("keepSource")}
            title="Remplace par la valeur de la fiche absorbée"
          >
            source
          </SegmentButton>
          {concatAllowed && (
            <SegmentButton
              active={value === "concat"}
              onClick={() => onChange("concat")}
              title="Concatène les deux"
            >
              concat
            </SegmentButton>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-[3px] border border-dashed border-rule bg-paper px-2 py-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
            cible
          </div>
          <div className="line-clamp-2 font-body italic text-ink/80">
            {targetPreview}
          </div>
        </div>
        <div className="rounded-[3px] border border-dashed border-rule bg-paper px-2 py-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
            source
          </div>
          <div className="line-clamp-2 font-body italic text-ink/80">
            {sourcePreview}
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition ${
        active
          ? "bg-bordeaux text-paper"
          : "bg-transparent text-ink-faint hover:bg-paper-deep"
      }`}
    >
      {children}
    </button>
  );
}

/** Petit aperçu textuel d'un content_json polymorphe : on prend les
 *  premiers champs string non-vides pour donner une idée de ce qui
 *  remplit la fiche. Pour un contenu Tiptap, on extrait juste le type. */
function summarizeContent(content: Record<string, unknown> | null | undefined): string {
  if (!content) return "(vide)";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(content)) {
    if (parts.length >= 3) break;
    if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v.length > 40 ? v.slice(0, 40) + "…" : v}`);
    } else if (Array.isArray(v) && v.length > 0) {
      const strs = v.filter((x): x is string => typeof x === "string");
      if (strs.length > 0) {
        parts.push(`${k}: ${strs.length} entrée${strs.length > 1 ? "s" : ""}`);
      }
    } else if (
      v &&
      typeof v === "object" &&
      "type" in (v as Record<string, unknown>)
    ) {
      parts.push(`${k}: (texte enrichi)`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "(rempli)";
}
