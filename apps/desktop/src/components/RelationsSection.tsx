import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";

import {
  entityListInUniverse,
  relationCreate,
  relationDelete,
  relationListForEntity,
} from "@/lib/api";
import {
  type Entity,
  type Relation,
  type RelationType,
  RELATION_TYPES,
  isSymmetric,
  relationTypeLabel,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  entity: Entity;
}

/**
 * Section affichée sur une fiche pour montrer ses relations entrantes
 * et sortantes (sur le graphe de lore), et en ajouter / supprimer.
 *
 * Phase 1.2 : liste tabulaire. La vue graphe interactive arrive en P1.3.
 */
export function RelationsSection({ entity }: Props) {
  const qc = useQueryClient();

  const relationsQuery = useQuery({
    queryKey: ["relations", entity.id],
    queryFn: () => relationListForEntity(entity.id),
  });

  // Toutes les entités de l'univers, pour résoudre les noms des cibles
  // ET pour alimenter le select du form d'ajout.
  const universeEntitiesQuery = useQuery({
    queryKey: ["entities", entity.universe_id, "all"],
    queryFn: () => entityListInUniverse(entity.universe_id),
  });

  const createMutation = useMutation({
    mutationFn: relationCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relations", entity.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: relationDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relations", entity.id] }),
  });

  const entityById = useMemo(() => {
    const m = new Map<string, Entity>();
    (universeEntitiesQuery.data ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [universeEntitiesQuery.data]);

  // Cibles candidates pour le form : toutes les entités du même univers
  // sauf l'entité courante.
  const candidateTargets = useMemo(
    () => (universeEntitiesQuery.data ?? []).filter((e) => e.id !== entity.id),
    [universeEntitiesQuery.data, entity.id],
  );

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<RelationType>("mentor_of");
  const [targetId, setTargetId] = useState("");
  const [description, setDescription] = useState("");

  // Initialise le select cible sur la première entité dispo dès qu'on
  // ouvre le form, sinon le submit envoie une string vide.
  const openForm = () => {
    if (candidateTargets.length > 0 && !targetId) {
      setTargetId(candidateTargets[0].id);
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setType("mentor_of");
    setTargetId("");
    setDescription("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    createMutation.mutate(
      {
        sourceId: entity.id,
        targetId,
        type,
        description: description.trim() || undefined,
      },
      { onSuccess: resetForm },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Relations</CardTitle>
            <CardDescription>
              Liens narratifs avec les autres entités de l'univers.
            </CardDescription>
          </div>
          {!showForm && (
            <Button
              size="sm"
              variant="outline"
              onClick={openForm}
              disabled={candidateTargets.length === 0}
            >
              <Plus className="size-3.5" aria-hidden /> Relation
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showForm && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rel-type">Type</Label>
                <select
                  id="rel-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as RelationType)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {RELATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {entity.name} {relationTypeLabel(t, "active")}…
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rel-target">Cible</Label>
                <select
                  id="rel-target"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {candidateTargets.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rel-desc">Note (optionnelle)</Label>
              <Input
                id="rel-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Précision sur la relation, contexte…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending || !targetId}
              >
                {createMutation.isPending ? "Ajout…" : "Ajouter"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Annuler
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                Erreur : {String(createMutation.error)}
              </p>
            )}
          </form>
        )}

        {relationsQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}

        {relationsQuery.isError && (
          <p className="text-sm text-destructive" role="alert">
            Erreur : {String(relationsQuery.error)}
          </p>
        )}

        {relationsQuery.data && relationsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucune relation pour l'instant.
          </p>
        )}

        {relationsQuery.data && relationsQuery.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {relationsQuery.data.map((r) => (
              <RelationRow
                key={r.id}
                relation={r}
                viewerId={entity.id}
                otherEntity={entityById.get(otherIdOf(r, entity.id))}
                universeId={entity.universe_id}
                onDelete={() => deleteMutation.mutate(r.id)}
                deleting={deleteMutation.isPending}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function otherIdOf(relation: Relation, viewerId: string): string {
  return relation.source_id === viewerId ? relation.target_id : relation.source_id;
}

interface RelationRowProps {
  relation: Relation;
  viewerId: string;
  otherEntity: Entity | undefined;
  universeId: string;
  onDelete: () => void;
  deleting: boolean;
}

function RelationRow({
  relation,
  viewerId,
  otherEntity,
  universeId,
  onDelete,
  deleting,
}: RelationRowProps) {
  const isOutgoing = relation.source_id === viewerId;
  const symmetric = isSymmetric(relation.type);
  // Pour les types symétriques, on affiche toujours en active form.
  // Pour les asymétriques, on flippe en passive si on est target.
  const direction: "active" | "passive" =
    symmetric || isOutgoing ? "active" : "passive";
  const label = relationTypeLabel(relation.type, direction);

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="text-muted-foreground italic">{label}</span>
        {otherEntity ? (
          <Link
            to={`/u/${universeId}/e/${otherEntity.id}`}
            className="font-medium hover:underline truncate"
          >
            {otherEntity.name}
          </Link>
        ) : (
          <span className="text-muted-foreground italic">(entité supprimée)</span>
        )}
        {relation.description && (
          <span className="text-muted-foreground truncate">
            · {relation.description}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Supprimer la relation"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}
