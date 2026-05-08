/**
 * Kbd — affiche un raccourci clavier dans la lignée mono de la charte.
 * Usage : <Kbd>⌘⏎</Kbd>, <Kbd>Ctrl+S</Kbd>.
 */

import { cn } from "@/lib/utils";

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center font-mono text-[10px] text-ink-faint",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
