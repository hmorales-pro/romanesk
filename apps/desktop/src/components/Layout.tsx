/**
 * Layout global — titlebar éditoriale (Phase 8.2).
 *
 * Reprend l'idiome de la charte § 05 — Démonstration. Sur macOS, on
 * utilise titleBarStyle: "Overlay" + hiddenTitle (cf. tauri.conf.json) :
 * les traffic-light buttons natifs (rouge/jaune/vert) apparaissent en
 * superposition sur notre titlebar custom, et on garde le drag natif via
 * data-tauri-drag-region.
 *
 *  ┌────────────────────────────────────────────────────────────────────┐
 *  │ ●●●     Cendrelune.romanesk · Chapitre 7    14 327 mots · sauvegardé│
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
      {/*
        Titlebar mono — la zone des traffic-light buttons macOS est
        réservée à gauche (pl-[88px]) parce qu'avec titleBarStyle:Overlay,
        les boutons natifs sont positionnés à x=16 (cf. tauri.conf.json)
        et prennent ~78px (3 boutons × 14px + 8px gap × 2 + marge droite).

        data-tauri-drag-region rend la titlebar entière draggable comme
        une vraie barre titre macOS — on peut l'attraper pour déplacer la
        fenêtre. Les éléments interactifs (button, input, a) à l'intérieur
        annulent automatiquement le drag.
      */}
      <div
        data-tauri-drag-region
        className="flex h-[38px] shrink-0 items-center justify-between gap-4 border-b border-rule bg-paper-deep pl-[88px] pr-4 font-mono text-[11px] tracking-[0.04em] text-ink-faint select-none"
      >
        <span
          data-tauri-drag-region
          className="min-w-0 flex-1 truncate text-center"
        >
          {breadcrumb ?? "Romanesk · atelier d'écriture"}
        </span>
        <span data-tauri-drag-region className="shrink-0">
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

      {/* Footer global — légende des kinds + assertion local-first.
       * Présent sur toutes les pages, scellé par un filet 1px.
       * Charte § 05 — Filet de réassurance. */}
      <footer className="mx-auto w-full max-w-[1440px] px-6 pb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-3 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
          <span className="inline-flex items-center gap-2">
            <i
              aria-hidden
              className="inline-block size-2 rounded-full bg-bordeaux"
            />
            Personnages
          </span>
          <span className="inline-flex items-center gap-2">
            <i
              aria-hidden
              className="inline-block size-2 rounded-full bg-ivy"
            />
            Lieux
          </span>
          <span className="inline-flex items-center gap-2">
            <i
              aria-hidden
              className="inline-block size-2 rounded-full bg-ocre"
            />
            Factions
          </span>
          <span className="text-ink-soft">
            — Objets · Concepts · Entités réelles
          </span>
          <span className="ml-auto">tout est local · rien ne sort</span>
        </div>
      </footer>
    </div>
  );
}
