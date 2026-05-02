import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";

import { entityGet, universeGet } from "@/lib/api";
import { characterContent } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

      {entityQuery.data && (() => {
        const entity = entityQuery.data;
        const c = characterContent(entity);
        return (
          <article className="flex flex-col gap-6">
            <header className="flex items-start gap-4">
              <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
                <User className="size-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">{entity.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {entity.type} · créé le{" "}
                  {new Date(entity.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </header>

            {entity.summary && (
              <p className="text-base text-foreground/90">{entity.summary}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Archétype</CardTitle>
                </CardHeader>
                <CardContent>
                  {c.archetype ? (
                    <p className="text-sm">{c.archetype}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Non renseigné
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Traits</CardTitle>
                </CardHeader>
                <CardContent>
                  {c.traits.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {c.traits.map((t) => (
                        <li
                          key={t}
                          className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Aucun trait
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Biographie</CardTitle>
                <CardDescription>
                  Phase 0 : texte brut. Tiptap arrive en J8.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {c.biography ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {c.biography}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Pas encore de biographie.
                  </p>
                )}
              </CardContent>
            </Card>
          </article>
        );
      })()}
    </div>
  );
}
