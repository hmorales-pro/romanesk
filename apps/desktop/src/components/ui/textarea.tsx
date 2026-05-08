import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea — version Romanesk (P8.3). Même idiome que Input :
 * filet rule, radius 3 px, papier, focus bordeaux/40, Source Serif.
 */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[120px] w-full resize-y rounded-[3px] border border-rule bg-paper px-3 py-2 font-body text-[14px] leading-[1.55] text-ink",
      "placeholder:italic placeholder:text-ink-faint",
      "transition-colors focus-visible:border-bordeaux/40 focus-visible:outline-none",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
