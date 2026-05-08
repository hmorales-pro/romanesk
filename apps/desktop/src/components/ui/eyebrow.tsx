/**
 * Eyebrow — petite étiquette éditoriale.
 *
 * Idiome charte § 05 : JetBrains Mono · 11px · letter-spacing 0.18em ·
 * UPPERCASE · point bordeaux 4×4 + 10px de marge.
 *
 * Usage :
 *   <Eyebrow>§ 02 — Fonctionnalités</Eyebrow>
 *   <Eyebrow bullet={false}>v0.6.0 · pre-alpha</Eyebrow>
 */

import { cn } from "@/lib/utils";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  bullet?: boolean;
  children: React.ReactNode;
}

export function Eyebrow({
  bullet = true,
  className,
  children,
  ...props
}: EyebrowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint",
        className,
      )}
      {...props}
    >
      {bullet && (
        <span
          aria-hidden
          className="mr-2.5 inline-block size-1 rounded-full bg-bordeaux"
        />
      )}
      {children}
    </span>
  );
}
