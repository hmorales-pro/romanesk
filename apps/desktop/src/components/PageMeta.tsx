/**
 * PageMeta — context pour que chaque page puisse poser, dans la titlebar
 * du Layout, son breadcrumb (au centre) et sa meta à droite.
 *
 * Idiome charte § 05 — Démonstration : la titlebar est en mono 11 px
 * letter-spacing 0.04em, couleur ink-faint. Format type :
 *
 *     · · ·    Cendrelune.romanesk · Chapitre 7 — La frontière      14 327 mots · sauvegardé
 *
 * Les pages utilisent `usePageMeta({ breadcrumb: …, meta: … })` dans un
 * `useEffect` ou directement dans le rendu (le hook est idempotent : il
 * pose la valeur au mount et la nettoie au unmount).
 */

import { createContext, useContext, useEffect, useState } from "react";

type Crumb = string | null;

interface PageMetaState {
  breadcrumb: Crumb;
  meta: Crumb;
}

interface PageMetaContext extends PageMetaState {
  set: (next: Partial<PageMetaState>) => void;
}

const Ctx = createContext<PageMetaContext | null>(null);

export function PageMetaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PageMetaState>({
    breadcrumb: null,
    meta: null,
  });
  const set = (next: Partial<PageMetaState>) =>
    setState((prev) => ({ ...prev, ...next }));
  return (
    <Ctx.Provider value={{ ...state, set }}>{children}</Ctx.Provider>
  );
}

export function usePageMetaState(): PageMetaState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { breadcrumb: null, meta: null };
  }
  return { breadcrumb: ctx.breadcrumb, meta: ctx.meta };
}

/**
 * Pose la titlebar le temps que ce composant est monté. Au unmount, la
 * titlebar revient à `null`. Idempotent : changer les valeurs met juste
 * à jour le context.
 */
export function usePageMeta({
  breadcrumb,
  meta,
}: Partial<PageMetaState>) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    ctx.set({
      breadcrumb: breadcrumb ?? null,
      meta: meta ?? null,
    });
    return () => {
      ctx.set({ breadcrumb: null, meta: null });
    };
  }, [breadcrumb, meta]);
}
