/**
 * AiCard — carte de dialogue pour les panneaux IA.
 *
 * Idiome charte § 05 — « Sparring partner ». Filet 1px, radius 3px, role en
 * mono uppercase au-dessus. Variante "you" : background transparent, filet
 * pointillé (côté utilisateur, brouillon, prompt).
 *
 * Usage :
 *   <AiCard role="Toi" tone="you">…</AiCard>
 *   <AiCard role="IA · suggestion">…</AiCard>
 *   <AiCard role="Cohérence" tone="you">✓ Compatible…</AiCard>
 */

import { cn } from "@/lib/utils";

interface AiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  role?: string;
  tone?: "neutral" | "you";
  children: React.ReactNode;
}

export function AiCard({
  role,
  tone = "neutral",
  className,
  children,
  ...props
}: AiCardProps) {
  return (
    <div
      className={cn(
        "rounded-[3px] border p-3 text-[14px] leading-snug text-ink",
        tone === "you"
          ? "border-rule border-dashed bg-transparent"
          : "border-rule bg-paper",
        className,
      )}
      {...props}
    >
      {role && (
        <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          {role}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Header d'un panneau "Sparring partner" : titre mono à gauche +
 * pill (modèle, mode) à droite.
 */
export function AiHead({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
      <span>{title}</span>
      {children}
    </div>
  );
}
