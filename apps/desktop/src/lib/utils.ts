import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Helper standard shadcn/ui : compose des classes Tailwind en gérant
 * proprement les conflits (ex. `px-2` + `px-4` → `px-4`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
