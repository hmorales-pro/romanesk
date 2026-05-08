/**
 * Pill — petit badge bordeaux pour signaler un état ou un mode.
 *
 * Charte § 05 — Composants. Variante par défaut bordeaux (modèle créatif,
 * mode actif), variante neutre (filet seul) et variante ocre (alerte douce).
 */

import { cn } from "@/lib/utils";

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "bordeaux" | "ocre" | "ivy" | "neutral";
  children: React.ReactNode;
}

const TONE_CLASS: Record<NonNullable<PillProps["tone"]>, string> = {
  bordeaux:
    "border-[color-mix(in_oklab,var(--bordeaux)_50%,var(--rule))] text-bordeaux",
  ocre: "border-[color-mix(in_oklab,var(--ocre)_50%,var(--rule))] text-ocre",
  ivy: "border-[color-mix(in_oklab,var(--ivy)_50%,var(--rule))] text-ivy",
  neutral: "border-rule text-ink-faint",
};

export function Pill({
  tone = "bordeaux",
  className,
  children,
  ...props
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
