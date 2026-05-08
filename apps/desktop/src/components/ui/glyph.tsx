/**
 * Glyph — carré 18×18 mono qui indexe le type d'une fiche.
 *
 * Charte § 05 — Composants. La couleur du glyph code la sémantique :
 *   P personnage → bordeaux
 *   L lieu       → ivy (lierre)
 *   F faction    → ocre
 *   O objet      → ink-soft
 *   C concept    → ink-soft
 *   R réel       → ink-soft
 *   + ajout      → ink-soft (filet uniquement)
 *
 * On utilise les classes Tailwind exposées via @theme inline (text-bordeaux,
 * border-bordeaux/45, etc.) pour rester cohérent avec les tokens.
 */

import { cn } from "@/lib/utils";

export type GlyphKind =
  | "character"
  | "location"
  | "faction"
  | "object"
  | "concept"
  | "real"
  | "chapter"
  | "story"
  | "add"
  | "neutral";

interface GlyphProps {
  kind: GlyphKind;
  /** Lettre ou caractère affiché — par défaut, déduit du kind. */
  letter?: string;
  className?: string;
}

const DEFAULT_LETTER: Record<GlyphKind, string> = {
  character: "P",
  location: "L",
  faction: "F",
  object: "O",
  concept: "C",
  real: "R",
  chapter: "§",
  story: "T",
  add: "+",
  neutral: "·",
};

const KIND_CLASS: Record<GlyphKind, string> = {
  character: "text-bordeaux border-[color-mix(in_oklab,var(--bordeaux)_45%,var(--rule))]",
  location: "text-ivy border-[color-mix(in_oklab,var(--ivy)_45%,var(--rule))]",
  faction: "text-ocre border-[color-mix(in_oklab,var(--ocre)_50%,var(--rule))]",
  object: "text-ink-soft border-rule",
  concept: "text-ink-soft border-rule",
  real: "text-ink-soft border-rule",
  chapter: "text-bordeaux border-[color-mix(in_oklab,var(--bordeaux)_35%,var(--rule))]",
  story: "text-ink border-rule",
  add: "text-ink-faint border-dashed border-rule",
  neutral: "text-ink-faint border-rule",
};

export function Glyph({ kind, letter, className }: GlyphProps) {
  const ch = letter ?? DEFAULT_LETTER[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[2px] border font-mono text-[10px] leading-none",
        KIND_CLASS[kind],
        className,
      )}
    >
      {ch}
    </span>
  );
}

/**
 * Mappe un kind backend (Character/Location/…) vers le GlyphKind.
 * Le backend stocke en PascalCase, on accepte les deux casings.
 */
export function glyphKindFromEntityKind(kind: string): GlyphKind {
  const k = kind.toLowerCase();
  switch (k) {
    case "character":
      return "character";
    case "location":
      return "location";
    case "faction":
      return "faction";
    case "object":
      return "object";
    case "concept":
      return "concept";
    case "realentity":
    case "real":
      return "real";
    default:
      return "neutral";
  }
}
