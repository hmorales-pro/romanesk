/**
 * Modale Romanesk — alternative aux `window.alert` / `window.confirm`
 * natifs du navigateur (qui cassent l'identité visuelle).
 *
 * API impérative :
 *
 *   await alertDialog("Texte copié dans le presse-papier.");
 *   const ok = await confirmDialog({
 *     title: "Supprimer cet univers ?",
 *     body: "Action irréversible.",
 *     confirmLabel: "Supprimer",
 *     destructive: true,
 *   });
 *
 * Implémentation : rendu impératif via createRoot(). Chaque appel mounte
 * une instance de <RomaneskDialog> dans un <div> temporaire injecté dans
 * <body>, puis cleanup au close. Pas besoin de Provider — n'importe quel
 * fichier peut importer et appeler.
 *
 * Charte § 05 : filet 1 px rule, fond paper, radius 4 px, titre Cormorant,
 * boutons mono uppercase tracking 0.04em (Button variant cta).
 */

import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

interface DialogProps {
  open: boolean;
  title?: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

function RomaneskDialog({
  open,
  title,
  body,
  confirmLabel = "OK",
  cancelLabel = null,
  destructive = false,
  onConfirm,
  onCancel,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // showModal au mount → centre, ouvre le focus trap, capture ESC.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // ESC = cancel (ou confirm s'il n'y a pas de cancel).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      if (cancelLabel != null && onCancel) onCancel();
      else onConfirm();
    };
    dlg.addEventListener("cancel", handleCancel);
    return () => dlg.removeEventListener("cancel", handleCancel);
  }, [cancelLabel, onCancel, onConfirm]);

  // Click backdrop = cancel (le backdrop est visé quand l'event.target
  // est le <dialog> lui-même, pas un de ses enfants).
  const handleBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      if (cancelLabel != null && onCancel) onCancel();
      else onConfirm();
    }
  };

  return (
    <dialog
      ref={ref}
      onClick={handleBackdrop}
      className={[
        // Apparence Romanesk
        "min-w-[320px] max-w-[480px] rounded-[4px] border border-rule bg-paper p-0",
        "text-ink shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]",
        // Centrage : le browser pose un margin:auto sur dialog[open] mais
        // le preflight Tailwind écrase la marge à 0. On le remet explicite
        // pour bénéficier du centrage natif du <dialog>.
        "m-auto",
        // Backdrop semi-transparent encre
        "backdrop:bg-[color-mix(in_oklab,var(--ink)_35%,transparent)]",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 p-6">
        {title && (
          <h2 className="font-display text-[22px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
            {title}
          </h2>
        )}
        {body && (
          <div className="font-body text-[15px] leading-[1.55] text-ink-soft">
            {body}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {cancelLabel != null && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              autoFocus={destructive}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            autoFocus={!destructive}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// API impérative
// ---------------------------------------------------------------------------

interface AlertOptions {
  title?: string;
  confirmLabel?: string;
}

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

function mountDialog<T>(
  render: (resolve: (value: T) => void, dismiss: () => void) => React.ReactElement,
): Promise<T> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const cleanup = () => {
      // Petit délai pour laisser le close du <dialog> jouer son anim CSS
      // par défaut — pas indispensable mais évite le flash blanc.
      window.setTimeout(() => {
        root.unmount();
        if (container.parentNode) container.parentNode.removeChild(container);
      }, 120);
    };

    const finish = (value: T) => {
      cleanup();
      resolve(value);
    };

    root.render(render(finish, cleanup));
  });
}

/**
 * Alerte modale (équivalent de window.alert mais en charte Romanesk).
 * Retourne une Promise qui résout au click sur OK ou ESC.
 */
export function alertDialog(
  message: React.ReactNode,
  opts: AlertOptions = {},
): Promise<void> {
  return mountDialog<void>((resolve) => (
    <RomaneskDialog
      open
      title={opts.title ?? "Romanesk"}
      body={message}
      confirmLabel={opts.confirmLabel ?? "OK"}
      onConfirm={() => resolve()}
    />
  ));
}

/**
 * Confirmation modale (équivalent de window.confirm). Retourne `true` si
 * l'utilisateur confirme, `false` s'il annule (ou ESC, ou click backdrop).
 *
 * `destructive: true` colore le bouton de confirmation en bordeaux-deep
 * et place le focus initial sur Annuler — bonne pratique pour les
 * suppressions.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return mountDialog<boolean>((resolve) => (
    <RomaneskDialog
      open
      title={opts.title}
      body={opts.body}
      confirmLabel={opts.confirmLabel ?? "Confirmer"}
      cancelLabel={opts.cancelLabel ?? "Annuler"}
      destructive={opts.destructive}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  ));
}
