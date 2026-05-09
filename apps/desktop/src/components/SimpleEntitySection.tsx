/**
 * Section minimale pour les EntityType qui n'ont pas leur propre form
 * complet sur UniversePage : Faction, Object, Concept (Phase 5).
 *
 * Création : juste le nom + un type (combobox texte libre + suggestions
 * par défaut + types déjà utilisés dans l'univers — P12.1).
 *
 * Liste : grille de cards cliquables vers `/u/:id/e/:entityId`.
 */

import { type ReactNode, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";

import type { Entity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KindCombobox } from "@/components/ui/kind-combobox";

export interface KindOption {
  value: string;
  label: string;
}

interface Props {
  /** Titre H2 de la section. */
  title: string;
  /** Bouton de création (« Nouvelle faction », « Nouvel objet »…). */
  createLabel: string;
  /** Icône à gauche du titre (composant lucide ou JSX). */
  icon: ReactNode;
  universeId: string;
  items: Entity[];
  loading: boolean;
  error: unknown;
  /** Sous-types proposés par défaut (suggestions du combobox). */
  kinds: KindOption[];
  /** Sous-type par défaut sélectionné dans le form. */
  defaultKind: string;
  /** Crée une fiche minimaliste (nom + kind). */
  onCreate: (args: { name: string; kind: string }) => Promise<Entity>;
  onCreated: () => void;
  /** Donne le sous-type d'une entity pour l'afficher en chip. */
  getKind: (entity: Entity) => string;
  kindLabel: (k: string) => string;
}

export function SimpleEntitySection({
  title,
  createLabel,
  icon,
  universeId,
  items,
  loading,
  error,
  kinds,
  defaultKind,
  onCreate,
  onCreated,
  getKind,
  kindLabel,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>(defaultKind);

  const mutation = useMutation({
    mutationFn: onCreate,
    onSuccess: () => {
      onCreated();
      setName("");
      setKind(defaultKind);
      setShowForm(false);
    },
  });

  // P12.1 — types déjà créés dans cet univers, dérivés des items existants.
  // Permet à l'utilisateur de retomber sur ses types custom au lieu de
  // les retaper.
  const learnedKinds = useMemo(() => {
    const set = new Set<string>();
    for (const e of items) {
      const k = getKind(e);
      if (k && k.trim()) set.add(k);
    }
    return Array.from(set).sort();
  }, [items, getKind]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" aria-hidden /> {createLabel}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-md border bg-card p-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-${title}-name`}>Nom *</Label>
              <Input
                id={`new-${title}-name`}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-${title}-kind`}>Type</Label>
              <KindCombobox
                id={`new-${title}-kind`}
                value={kind}
                onChange={setKind}
                defaults={kinds}
                learned={learnedKinds}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setName("");
                setKind(defaultKind);
                setShowForm(false);
              }}
            >
              <X className="size-4" aria-hidden /> Annuler
            </Button>
            <Button
              size="sm"
              onClick={() =>
                name.trim() &&
                mutation.mutate({
                  name: name.trim(),
                  kind: kind.trim() || defaultKind,
                })
              }
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Création…" : "Créer"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tu peux choisir un type proposé ou taper le tien — il sera
            réutilisable la prochaine fois. Tu pourras éditer la
            description, les relations, les tags et le détail en ouvrant
            la fiche.
          </p>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {String(mutation.error)}
            </p>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {!!error && (
        <p className="text-sm text-destructive" role="alert">
          {String(error)}
        </p>
      )}
      {!loading && items.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Aucune fiche pour l'instant.</p>
      )}

      {items.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((e) => (
            <Link
              key={e.id}
              to={`/u/${universeId}/e/${e.id}`}
              className="rounded-md border bg-card p-3 hover:border-primary/60 transition"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{e.name}</span>
                <span className="text-xs rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                  {kindLabel(getKind(e))}
                </span>
              </div>
              {e.summary && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {e.summary}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
