import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { entityGet, universeGet } from "@/lib/api";
import { CharacterDetail } from "@/pages/details/CharacterDetail";
import { LocationDetail } from "@/pages/details/LocationDetail";

/**
 * Dispatcher : charge l'entity, dispatch sur `entity.type` vers le bon
 * composant de détail. Layout commun (nav breadcrumb) ici.
 */
export default function EntityPage() {
  const { universeId, entityId } = useParams<{
    universeId: string;
    entityId: string;
  }>();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const entityQuery = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => entityGet(entityId!),
    enabled: !!entityId,
  });

  if (!universeId || !entityId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <p className="text-destructive" role="alert">
          Lien invalide (id d'univers ou de fiche manquant).
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-3xl flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" aria-hidden /> Bibliothèque
        </Link>
        <span>·</span>
        <Link to={`/u/${universeId}`} className="hover:text-foreground">
          {universeQuery.data?.name ?? "Univers"}
        </Link>
      </nav>

      {entityQuery.isPending && (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      )}

      {entityQuery.isError && (
        <p className="text-sm text-destructive" role="alert">
          Erreur : {String(entityQuery.error)}
        </p>
      )}

      {entityQuery.data === null && (
        <p className="text-destructive" role="alert">
          Cette fiche n'existe pas (ou a été supprimée).
        </p>
      )}

      {entityQuery.data?.type === "Character" && (
        <CharacterDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "Location" && (
        <LocationDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data &&
        entityQuery.data.type !== "Character" &&
        entityQuery.data.type !== "Location" && (
          <p className="text-sm text-muted-foreground italic">
            Le type « {entityQuery.data.type} » n'est pas encore éditable
            (Phase 1+).
          </p>
        )}
    </div>
  );
}
