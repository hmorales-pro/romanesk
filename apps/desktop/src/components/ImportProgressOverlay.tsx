/**
 * ImportProgressOverlay (P13.2)
 *
 * Pendant l'analyse map-reduce d'un long texte (cf. P13.1), affiche en
 * plein écran trois colonnes vivantes :
 *
 *   1. Une progress bar globale (chunks traités / total) + statut courant
 *   2. Un feed live des découvertes au fil de l'eau ("✨ Aldwen mentionné
 *      · personnage", "📍 Vélanyr semble être un lieu côtier") — c'est le
 *      sentiment "l'IA travaille pour toi", très différent d'un spinner
 *      aveugle
 *   3. Un encart de patience : conseils ("5-10 min, va prendre un café"),
 *      citations littéraires en rotation lente (15 s), pour rassurer et
 *      ne pas faire culpabiliser de l'attente
 *
 * Le composant ne déclenche pas l'analyse — il s'abonne aux events
 * `import-progress` que le backend émet. Le caller gère la mutation.
 */

import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Coffee,
  Compass,
  Quote,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type {
  DiscoveredItem,
  ImportProgressEvent,
} from "@/lib/api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Glyph, glyphKindFromEntityKind } from "@/components/ui/glyph";

// ---------------------------------------------------------------------------
// Citations & encouragements
// ---------------------------------------------------------------------------

/**
 * Citations littéraires courtes — domaine public (auteurs morts depuis
 * 70 ans+). Rotation lente, choisies pour leur lien avec l'écriture, le
 * temps, l'attention. Pas trop solennelles — Romanesk reste un atelier,
 * pas un salon littéraire.
 */
const QUOTES: { text: string; author: string }[] = [
  {
    text: "Le talent, c'est la patience plus la curiosité.",
    author: "Edmond et Jules de Goncourt",
  },
  {
    text: "Écrire, c'est une façon de parler sans être interrompu.",
    author: "Jules Renard",
  },
  {
    text: "Bien écrire, c'est tout à la fois bien penser, bien sentir et bien rendre.",
    author: "Buffon",
  },
  {
    text: "Un livre est une fenêtre par laquelle on s'évade.",
    author: "Julien Green",
  },
  {
    text: "La patience est amère, mais son fruit est doux.",
    author: "Jean-Jacques Rousseau",
  },
  {
    text: "Le temps découvre les secrets ; le temps fait naître les occasions.",
    author: "Racine",
  },
];

/**
 * Conseils d'attente. Format léger, pas pénible. Style « ami qui te dit
 * de te détendre » plus que « interface qui s'excuse ».
 */
const PATIENCE_TIPS: { icon: LucideIcon; text: string }[] = [
  {
    icon: Coffee,
    text: "5 à 10 minutes typiquement — bon moment pour un café ou un thé.",
  },
  {
    icon: Compass,
    text: "L'IA lit fragment par fragment, comme tu relirais un manuscrit.",
  },
  {
    icon: Sparkles,
    text: "Plus le récit est riche, plus la phase finale est précise.",
  },
];

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

interface ImportProgressOverlayProps {
  /** True quand une analyse stream est en cours. Quand false, l'overlay
   * est démonté et son state nettoyé. */
  active: boolean;
  /** Permet d'annuler depuis le composant parent (bouton « Plus tard »). */
  onCancel?: () => void;
}

interface FeedEntry {
  id: string;
  /** Texte affiché dans le feed (« ✨ Aldwen mentionné · personnage »). */
  text: string;
  /** Item original pour le rendu Glyph + couleur. */
  item: DiscoveredItem;
  /** Timestamp pour le tri visuel (plus récent en haut). */
  ts: number;
}

const KIND_VERB: Record<string, string> = {
  character: "personnage",
  location: "lieu",
  faction: "faction",
  object: "objet",
  concept: "concept",
};

export function ImportProgressOverlay({
  active,
  onCancel,
}: ImportProgressOverlayProps) {
  const [stage, setStage] = useState<string>("started");
  const [chunkIndex, setChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [quoteIdx, setQuoteIdx] = useState(0);

  // P13.2 hotfix — pas de <dialog showModal>, qui est promu dans la top
  // layer du browser et passe au-dessus de TOUT (y compris la titlebar
  // Tauri custom avec data-tauri-drag-region). Du coup l'utilisateur ne
  // peut plus déplacer la fenêtre pendant l'analyse, ce qui dure 5-10
  // min — pas acceptable.
  // À la place, overlay div fixed qui démarre à top: 38px (sous la
  // titlebar). La fenêtre reste déplaçable pendant tout le pipeline.
  // ESC est géré explicitement via un keydown listener si onCancel.

  // Reset à chaque (re)démarrage.
  useEffect(() => {
    if (active) {
      setStage("started");
      setChunkIndex(0);
      setTotalChunks(0);
      setTotalChars(0);
      setFeed([]);
      setQuoteIdx(Math.floor(Math.random() * QUOTES.length));
    }
  }, [active]);

  // Rotation des citations (15 s).
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setQuoteIdx((i) => (i + 1) % QUOTES.length);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [active]);

  // Stream des events tauri.
  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | null = null;
    void listen<ImportProgressEvent>("import-progress", (e) => {
      const ev = e.payload;
      setStage(ev.stage);

      if (ev.stage === "started") {
        setTotalChunks(ev.totalChunks);
        setTotalChars(ev.totalChars);
      } else if (ev.stage === "chunkStarted") {
        setChunkIndex(ev.index);
      } else if (ev.stage === "chunkAnalyzed") {
        setChunkIndex(ev.index + 1);
        // Push les nouvelles découvertes dans le feed.
        const now = Date.now();
        const newEntries: FeedEntry[] = ev.discovered.map((d, i) => ({
          id: `${ev.index}-${i}-${d.name}`,
          text: feedTextFor(d),
          item: d,
          ts: now + i,
        }));
        if (newEntries.length > 0) {
          setFeed((prev) => [...newEntries.reverse(), ...prev].slice(0, 60));
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [active]);

  const pct = useMemo(() => {
    if (!totalChunks || !Number.isFinite(totalChunks)) return 0;
    if (stage === "done") return 100;
    if (stage === "reducing") return 95;
    const raw = Math.round((chunkIndex / totalChunks) * 90); // 5% gardés pour reduce
    return Number.isFinite(raw) ? Math.max(0, Math.min(95, raw)) : 0;
  }, [stage, chunkIndex, totalChunks]);

  const stageLabel = (() => {
    switch (stage) {
      case "started":
        return "Préparation des fragments…";
      case "chunkStarted":
      case "chunkAnalyzed":
        return `Lecture du fragment ${chunkIndex} sur ${totalChunks}`;
      case "reducing":
        return "Synthèse finale en cours…";
      case "done":
        return "Analyse terminée — préparation de la prévisualisation";
      case "error":
        return "Une erreur est survenue, on continue ce qu'on peut";
      default:
        return "Travail en cours…";
    }
  })();

  // ESC = cancel (si onCancel est fourni) — comportement compatible avec
  // l'expérience modale habituelle.
  useEffect(() => {
    if (!active || !onCancel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onCancel]);

  if (!active) return null;

  return (
    <div
      // Backdrop : fixed à top: 38px (sous la titlebar) pour ne pas
      // intercepter les événements de drag sur la zone titlebar Tauri.
      // z-40 < z-50 du header sticky, donc tout le header reste au-dessus
      // (et draggable).
      className="fixed bottom-0 left-0 right-0 top-[38px] z-40 flex items-center justify-center bg-[color-mix(in_oklab,var(--ink)_45%,transparent)] p-6"
      // Click backdrop = cancel (si onCancel)
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) onCancel();
      }}
    >
      <div
        className={[
          "w-[min(840px,92vw)] max-h-[80vh] overflow-hidden rounded-[4px] border border-rule bg-paper text-ink",
          "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]",
        ].join(" ")}
      >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Colonne gauche — feed + progress */}
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <Eyebrow>Analyse · pipeline en cours</Eyebrow>
            <h2 className="font-display text-[26px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
              L'IA lit ton texte<em className="italic font-normal text-bordeaux"> en profondeur.</em>
            </h2>
            <p className="font-body text-[14px] italic leading-snug text-ink-faint">
              {stageLabel}
              {totalChars > 0 && (
                <>
                  {" "}· {totalChars.toLocaleString("fr-FR")} caractères ·{" "}
                  {totalChunks} fragment{totalChunks > 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>

          {/* Progress bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              <span>Progression</span>
              <span>{pct} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-shade">
              <div
                className="h-full bg-bordeaux transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Feed live */}
          <div className="flex flex-col gap-1.5 min-h-0">
            <Eyebrow bullet={false}>Découvertes en direct</Eyebrow>
            <div className="flex h-[42vh] min-h-[260px] flex-col gap-1 overflow-y-auto rounded-[3px] border border-dashed border-rule bg-paper-deep/40 p-3">
              {feed.length === 0 && (
                <p className="font-body text-[13px] italic text-ink-faint">
                  L'IA va commencer à reconnaître les personnages, lieux,
                  factions… ils apparaîtront ici au fur et à mesure.
                </p>
              )}
              {feed.map((entry) => (
                <FeedRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>

          {onCancel && stage !== "done" && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint transition hover:text-bordeaux"
              >
                Plus tard · annuler
              </button>
            </div>
          )}
        </div>

        {/* Colonne droite — patience + citation */}
        <aside className="flex flex-col gap-4 border-t border-rule bg-paper-deep p-6 lg:border-l lg:border-t-0">
          <Eyebrow bullet={false}>Patience · respiration</Eyebrow>

          <div className="flex flex-col gap-3">
            {PATIENCE_TIPS.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-2.5 font-body text-[13px] italic leading-[1.5] text-ink-soft"
                >
                  <Icon
                    className="mt-0.5 size-3.5 shrink-0 text-bordeaux"
                    aria-hidden
                  />
                  <span>{tip.text}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t border-dotted border-rule pt-4">
            <Quote className="size-4 text-bordeaux" aria-hidden />
            <blockquote className="font-display text-[18px] italic leading-[1.35] text-ink">
              « {QUOTES[quoteIdx].text} »
            </blockquote>
            <cite className="font-mono text-[10.5px] uppercase tracking-[0.08em] not-italic text-ink-faint">
              — {QUOTES[quoteIdx].author}
            </cite>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedRow — une ligne de découverte
// ---------------------------------------------------------------------------

function FeedRow({ entry }: { entry: FeedEntry }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[3px] px-2 py-1.5 transition animate-fade-in">
      <Glyph
        kind={glyphKindFromEntityKind(entry.item.kind)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-body text-[13px] text-ink">{entry.text}</span>
        {entry.item.mention && (
          <span className="truncate font-body text-[11.5px] italic text-ink-faint">
            « {entry.item.mention} »
          </span>
        )}
      </div>
    </div>
  );
}

function feedTextFor(d: DiscoveredItem): string {
  const verb = KIND_VERB[d.kind] ?? d.kind;
  return `${d.name} · ${verb}`;
}
