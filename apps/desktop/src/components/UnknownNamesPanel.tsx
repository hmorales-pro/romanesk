/**
 * UnknownNamesPanel (P11.2) — détection passive de noms propres absents
 * du lore pendant l'écriture d'un chapitre.
 *
 * Comportement :
 *   - debounce 30 s sur les changements de `body` (le doc Tiptap brut)
 *   - appelle `chapterDetectUnknownNames(chapterId)` à chaque tick
 *   - affiche la liste des candidats avec count + extrait
 *   - chaque candidat propose : « Créer fiche » (mini-menu de type) et
 *     « Ignorer pour cette session » (Set en mémoire, réapparaît au
 *     prochain refresh manuel ou au reload de la page)
 *
 * On utilise un Set local pour les "ignorés" — délibérément non-persistant.
 * Si l'utilisateur recharge la page, les ignorés réapparaissent. C'est
 * un compromis assumé : pas de persistance veut dire pas de friction de
 * synchro, mais l'auteur peut voir un nom qu'il a déjà rejeté. Acceptable
 * pour une première version.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  characterCreate,
  chapterDetectUnknownNames,
  conceptCreate,
  factionCreate,
  locationCreate,
  objectCreate,
  type UnknownName,
} from "@/lib/api";
import type { EntityType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Glyph, glyphKindFromEntityKind } from "@/components/ui/glyph";

const DETECT_DEBOUNCE_MS = 30_000;

interface UnknownNamesPanelProps {
  chapterId: string;
  universeId: string;
  /** Le body Tiptap actuel — sert juste de trigger pour redémarrer
   *  le debounce à chaque modification (le scan se fait côté backend). */
  body: unknown;
}

const ENTITY_KINDS: { value: EntityType; label: string }[] = [
  { value: "Character", label: "Personnage" },
  { value: "Location", label: "Lieu" },
  { value: "Faction", label: "Faction" },
  { value: "Object", label: "Objet" },
  { value: "Concept", label: "Concept" },
];

export function UnknownNamesPanel({
  chapterId,
  universeId,
  body,
}: UnknownNamesPanelProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [names, setNames] = useState<UnknownName[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sérialise body pour pouvoir comparer dans le useEffect.
  const bodyKey = useMemo(() => JSON.stringify(body), [body]);

  const runScan = async () => {
    setScanning(true);
    try {
      const found = await chapterDetectUnknownNames(chapterId);
      setNames(found);
    } catch (e) {
      // On reste silencieux : la détection est best-effort, pas critique.
      console.warn("chapter_detect_unknown_names failed", e);
    } finally {
      setScanning(false);
    }
  };

  // Debounce 30 s sur le body. À chaque modification, on programme un
  // scan ; les modifications successives annulent le timer précédent.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runScan();
    }, DETECT_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, chapterId]);

  // Premier scan immédiat au mount, pour ne pas attendre 30 s la première
  // fois (l'utilisateur peut ouvrir le chapitre et voir directement les
  // noms détectés à partir du contenu déjà écrit).
  useEffect(() => {
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const visible = names.filter((n) => !ignored.has(n.name));

  const createMutation = useMutation({
    mutationFn: async ({
      name,
      kind,
    }: {
      name: string;
      kind: EntityType;
    }) => {
      switch (kind) {
        case "Character":
          return characterCreate({ universeId, name });
        case "Location":
          return locationCreate({ universeId, name });
        case "Faction":
          return factionCreate({ universeId, name });
        case "Object":
          return objectCreate({ universeId, name });
        case "Concept":
          return conceptCreate({ universeId, name });
        default:
          throw new Error(`type non supporté : ${kind}`);
      }
    },
    onSuccess: (entity, vars) => {
      // Invalide les listes pour que la fiche apparaisse partout.
      void qc.invalidateQueries({ queryKey: ["entities"] });
      void qc.invalidateQueries({ queryKey: ["entity-list"] });
      // Le nom n'est plus inconnu — on le retire de l'affichage.
      setNames((prev) => prev.filter((n) => n.name !== vars.name));
      setPickerOpen(null);
      // On navigue vers la fiche pour que l'auteur l'enrichisse, mais
      // dans un nouvel onglet conceptuel — ici on ouvre simplement la
      // route. L'écriture du chapitre garde son état (URL différente).
      navigate(`/u/${universeId}/e/${entity.id}`);
    },
  });

  if (visible.length === 0 && !scanning) {
    return (
      <section className="flex flex-col gap-2 rounded-[3px] border border-dashed border-rule p-3">
        <Eyebrow bullet={false}>Noms propres</Eyebrow>
        <p className="font-body text-[12.5px] italic leading-snug text-ink-faint">
          Tout est dans ton lore. L'app vérifie en passant.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-[3px] border border-rule bg-paper p-3">
      <div className="flex items-center justify-between">
        <Eyebrow bullet={false}>
          Noms propres détectés{scanning ? " · scan…" : ""}
        </Eyebrow>
        <button
          type="button"
          onClick={() => void runScan()}
          className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint transition hover:text-bordeaux"
          title="Re-scanner maintenant (au lieu d'attendre 30 s)"
        >
          rescanner
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {visible.map((n) => {
          const picking = pickerOpen === n.name;
          return (
            <li
              key={n.name}
              className="flex flex-col gap-1.5 rounded-[3px] border border-dashed border-rule bg-paper-deep/40 p-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[15px] font-medium text-ink">
                  {n.name}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
                  ×{n.occurrences}
                </span>
              </div>
              {n.excerpt && (
                <p className="line-clamp-2 font-body text-[12px] italic leading-snug text-ink-faint">
                  {n.excerpt}
                </p>
              )}

              {!picking ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPickerOpen(n.name)}
                    disabled={createMutation.isPending}
                  >
                    <Plus className="size-3" aria-hidden /> Créer fiche
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setIgnored((prev) => {
                        const next = new Set(prev);
                        next.add(n.name);
                        return next;
                      })
                    }
                    title="Masquer pour cette session"
                  >
                    <X className="size-3" aria-hidden /> Ignorer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                    type :
                  </span>
                  {ENTITY_KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[3px] border border-rule bg-paper px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink transition hover:bg-bordeaux hover:text-paper"
                      onClick={() =>
                        createMutation.mutate({ name: n.name, kind: k.value })
                      }
                      disabled={createMutation.isPending}
                    >
                      <Glyph
                        kind={glyphKindFromEntityKind(k.value)}
                        className="size-3 text-[8px]"
                      />
                      {k.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint transition hover:text-bordeaux"
                    onClick={() => setPickerOpen(null)}
                  >
                    annuler
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1 font-body text-[11.5px] italic leading-snug text-ink-faint">
        <Sparkles className="size-3" aria-hidden />
        Détection locale, sans IA. Recheck toutes les 30 s.
      </p>
    </section>
  );
}
