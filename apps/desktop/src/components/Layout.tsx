/**
 * Layout global — titlebar éditoriale (Phase 8.2).
 *
 * Reprend l'idiome de la charte § 05 — Démonstration :
 *
 *  ┌────────────────────────────────────────────────────────────────────┐
 *  │  · · ·   Cendrelune.romanesk · Chapitre 7        14 327 mots · ok  │
 *  ├────────────────────────────────────────────────────────────────────┤
 *  │ ←  ⊕ Romanesk   v0.6.0 · pre-alpha                       Settings  │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 * La titlebar (haute) reçoit son contenu depuis chaque page via le hook
 * `usePageMeta`. La barre du dessous garde la nav + brand + bouton retour.
 */

import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";

import { Sigillum } from "@/components/ui/sigillum";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  PageMetaProvider,
  usePageMetaState,
} from "@/components/PageMeta";

export default function Layout() {
  return (
    <PageMetaProvider>
      <LayoutShell />
    </PageMetaProvider>
  );
}

function LayoutShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const showBack = location.pathname !== "/";
  const { breadcrumb, meta } = usePageMetaState();

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Titlebar mono — 3 points + breadcrumb + meta */}
      <div className="flex items-center justify-between gap-4 border-b border-rule bg-paper-deep px-4 py-2.5 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-ink-faint/30" />
          <span className="size-2.5 rounded-full bg-ink-faint/30" />
          <span className="size-2.5 rounded-full bg-ink-faint/30" />
        </div>
        <span className="min-w-0 flex-1 truncate text-center">
          {breadcrumb ?? "Romanesk · atelier d'écriture"}
        </span>
        <span className="shrink-0">
          {meta ?? "local-first · aucun cloud"}
        </span>
      </div>

      {/* Barre nav — brand + retour + version + settings */}
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-6 py-3">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex size-8 items-center justify-center rounded-[3px] text-ink-faint transition hover:bg-paper-shade hover:text-ink"
              title="Retour à la page précédente"
              aria-label="Retour"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-2 text-ink transition hover:text-bordeaux"
          >
            <Sigillum size={20} className="text-bordeaux" />
            <span className="font-display text-lg font-medium tracking-[-0.005em]">
              Romanesk
            </span>
          </Link>
          <Eyebrow bullet={false} className="ml-2 text-ink-faint">
            v0.6.0 · pre-alpha
          </Eyebrow>
          <Link
            to="/settings"
            className="ml-auto inline-flex items-center gap-1 text-ink-faint transition hover:text-ink"
            title="Paramètres"
          >
            <SettingsIcon className="size-4" aria-hidden />
            <span className="sr-only">Paramètres</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
