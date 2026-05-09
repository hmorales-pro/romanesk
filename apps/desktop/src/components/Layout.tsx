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
import { Kbd } from "@/components/ui/kbd";
import { AIStatusBadge } from "@/components/AIStatusBadge";
import { OnboardingGate } from "@/components/OnboardingGate";
import { CommandPalette } from "@/components/CommandPalette";
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
      {/* Modale d'onboarding au premier lancement (P9.3) — détecte si
       * Ollama est joignable et propose les bonnes étapes le cas échéant. */}
      <OnboardingGate />

      {/* Palette de commandes Cmd/Ctrl+K (P11.1) — recherche unifiée
       * fiches/histoires/univers + actions de navigation. */}
      <CommandPalette />

      {/*
        Wrapper sticky du header global : titlebar mono + nav restent
        visibles quand le contenu scrolle (P8.3-G). z-50 pour passer
        au-dessus des panels et de l'éditeur. La couleur de fond doit
        être opaque (sinon le contenu transparait à travers au scroll).
      */}
      <div className="sticky top-0 z-50 bg-paper">
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
          className="flex h-[38px] items-center justify-between gap-4 border-b border-rule bg-paper-deep pl-[88px] pr-4 font-mono text-[11px] tracking-[0.04em] text-ink-faint select-none"
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
            {/* Hint discret de la palette — déclenchable via Cmd/Ctrl+K
             * (P11.1). On simule le keypress via dispatchEvent pour ne pas
             * dupliquer la logique d'ouverture. */}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                    bubbles: true,
                  }),
                );
              }}
              className="ml-auto inline-flex items-center gap-2 rounded-[3px] border border-rule px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] text-ink-faint transition hover:border-bordeaux/40 hover:text-bordeaux"
              title="Palette de commandes"
            >
              <span>Chercher…</span>
              <Kbd>⌘K</Kbd>
            </button>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-ink-faint transition hover:text-ink"
              title="Paramètres"
            >
              <SettingsIcon className="size-4" aria-hidden />
              <span className="sr-only">Paramètres</span>
            </Link>
          </div>
        </header>
      </div>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer barre d'état (P8.3-I, option 3 — utilité plutôt que
       * décoration). Sticky bas pour rester visible au scroll. Affiche
       * l'état IA, la version, un raccourci Settings, et un rappel
       * discret du local-first. */}
      <footer className="sticky bottom-0 z-40 border-t border-rule bg-paper">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-6 py-2 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
          <AIStatusBadge />
          <span className="text-ink-faint/40">·</span>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 transition hover:text-bordeaux"
            title="Paramètres IA + base"
          >
            <SettingsIcon className="size-3" aria-hidden />
            Paramètres
          </Link>
          <span className="ml-auto inline-flex items-center gap-2 text-ink-faint">
            <i
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-bordeaux"
            />
            local-first · rien ne sort
          </span>
        </div>
      </footer>
    </div>
  );
}
