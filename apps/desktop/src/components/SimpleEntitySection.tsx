/**
 * Section minimale pour les EntityType qui n'ont pas leur propre form
 * complet sur UniversePage : Faction, Object, Concept (Phase 5).
 *
 * Création : juste le nom + un select de sous-type. L'utilisateur peut
 * compléter le détail (idéologie, propriétés, description Tiptap, etc.)
 * en ouvrant la fiche depuis la liste.
 *
 * Liste : grille de cards cliquables vers `/u/:id/e/:entityId`.
 */

import { type ReactNode, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";

import type { Entity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface KindOption<K extends string> {
  value: K;
  label: string;
}

interface Props<K extends string> {
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
  /** Sous-types disponibles dans le select de création. */
  kinds: KindOption<K>[];
  /** Sous-type par défaut sélectionné dans le form. */
  defaultKind: K;
  /** Crée une fiche minimaliste (nom + kind). */
  onCreate: (args: { name: string; kind: K }) => Promise<Entity>;
  onCreated: () => void;
  /** Donne le sous-type d'une entity pour l'afficher en chip. */
  getKind: (entity: Entity) => K;
  kindLabel: (k: K) => string;
}

export function SimpleEntitySection<K extends string>({
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
}: Props<K>) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<K>(defaultKind);

  const mutation = useMutation({
    mutationFn: onCreate,
    onSuccess: () => {
      onCreated();
      setName("");
      setKind(defaultKind);
      setShowForm(false);
    },
  });

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
              <select
                id={`new-${title}-kind`}
                value={kind}
                onChange={(e) => setKind(e.target.value as K)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
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
                name.trim() && mutation.mutate({ name: name.trim(), kind })
              }
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Création…" : "Créer"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tu pourras éditer la description, les relations, les tags et
            le détail en ouvrant la fiche.
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
