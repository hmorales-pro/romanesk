/**
 * KindCombobox — input texte libre + datalist pour les types de fiches
 * polymorphes (Faction, Objet, Concept, Lieu) — P12.1.
 *
 * L'utilisateur peut :
 *   - Choisir une suggestion par défaut (les valeurs de l'enum d'origine
 *     comme "guild", "weapon"…)
 *   - Choisir un type qu'il a déjà créé dans cet univers (récupéré via
 *     `learned`, ce sont les valeurs `kind` distinctes vues dans la liste
 *     d'entités du même type)
 *   - Taper n'importe quelle nouvelle valeur — qui devient elle-même un
 *     type custom pour cet univers
 *
 * Implémentation : <input list="..."> + <datalist>. C'est l'API native
 * HTML, accessible, supportée partout, et zéro JS de filtrage à écrire.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

interface Suggestion {
  /** Valeur stockée en base (ex. "guild"). */
  value: string;
  /** Libellé affiché en suggestion (ex. "Guilde"). */
  label: string;
}

interface KindComboboxProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  /** Suggestions par défaut (les valeurs de l'enum d'origine). */
  defaults: Suggestion[];
  /**
   * Types déjà utilisés dans l'univers, dérivés des entités existantes
   * du même kind. Strings brutes — les doublons avec `defaults` sont
   * filtrés automatiquement.
   */
  learned?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function KindCombobox({
  id: idProp,
  value,
  onChange,
  defaults,
  learned = [],
  placeholder = "tape un type ou choisis…",
  className,
  disabled,
}: KindComboboxProps) {
  const fallbackId = useId();
  const inputId = idProp ?? `kind-${fallbackId}`;
  const listId = `${inputId}-list`;

  // Évite les doublons : on garde defaults en premier, puis les valeurs
  // de `learned` qui ne sont pas déjà dans defaults.
  const defaultValues = new Set(defaults.map((d) => d.value));
  const extraLearned = learned.filter((l) => l && !defaultValues.has(l));

  return (
    <>
      <input
        id={inputId}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full rounded-[3px] border border-rule bg-paper px-3 py-1 font-body text-[14px] text-ink",
          "placeholder:italic placeholder:text-ink-faint",
          "transition-colors focus-visible:border-bordeaux/40 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
      <datalist id={listId}>
        {defaults.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
        {extraLearned.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </datalist>
    </>
  );
}
