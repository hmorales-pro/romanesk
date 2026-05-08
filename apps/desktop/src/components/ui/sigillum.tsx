/**
 * Sigillum — sigle de Romanesk : cercle, croix, croix de Saint-André,
 * pupille au centre. Charte § 07 — Logo.
 *
 * Trait fin (1.4 px), sans fill, héritage de currentColor pour pouvoir
 * teinter (text-bordeaux, text-ink-soft, etc.).
 */

import { cn } from "@/lib/utils";

interface SigillumProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number | string;
}

export function Sigillum({ size = "1em", className, ...props }: SigillumProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      width={size}
      height={size}
      aria-hidden
      className={cn("inline-block", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d="M12 2 V 22 M2 12 H 22 M5 5 L 19 19 M19 5 L 5 19"
        strokeWidth="0.6"
        opacity="0.4"
      />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  );
}
