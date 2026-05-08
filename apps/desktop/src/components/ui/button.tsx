import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button — version Romanesk (P8.2).
 *
 * Charte § 05 : radius 2 px, primary = encre → bordeaux au hover, secondary
 * = filet rule → border ink au hover. La typographie passe en JetBrains Mono
 * pour la variante `cta` (CTA principaux, en uppercase). Les variantes par
 * défaut gardent une casse normale pour les actions in-context (panneaux IA,
 * formulaires) où le UPPERCASE serait fatiguant.
 */
type Variant = "default" | "outline" | "ghost" | "destructive" | "cta";
type Size = "default" | "sm" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  // CTA principal : encre → bordeaux au hover (comme .btn-primary du site).
  default:
    "bg-ink text-paper hover:bg-bordeaux",
  outline:
    "border border-rule bg-transparent text-ink hover:border-ink",
  ghost:
    "text-ink hover:bg-paper-shade",
  destructive:
    "bg-bordeaux-deep text-paper hover:bg-bordeaux",
  // CTA mono uppercase de la charte (Télécharger, Voir les captures).
  cta:
    "bg-ink text-paper hover:bg-bordeaux font-mono uppercase tracking-[0.04em]",
};

const sizeClasses: Record<Size, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[3px] font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bordeaux",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
