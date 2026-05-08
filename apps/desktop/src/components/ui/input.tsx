import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — version Romanesk (P8.3).
 * Charte § 04/05 : filet 1 px (rule), radius 3 px, fond papier ;
 * focus → bordure bordeaux atténuée. Source Serif 4 par défaut (font-body
 * via @theme inline) pour une saisie qui se fond dans le manuscrit.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-9 w-full rounded-[3px] border border-rule bg-paper px-3 py-1 font-body text-[14px] text-ink",
      "placeholder:italic placeholder:text-ink-faint",
      "transition-colors focus-visible:border-bordeaux/40 focus-visible:outline-none",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
