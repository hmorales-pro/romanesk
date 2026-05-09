import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Pencil } from "lucide-react";

import { entityGet, universeGet } from "@/lib/api";
import { CharacterDetail } from "@/pages/details/CharacterDetail";
import { LocationDetail } from "@/pages/details/LocationDetail";
import { FactionDetail } from "@/pages/details/FactionDetail";
import { ObjectDetail } from "@/pages/details/ObjectDetail";
import { ConceptDetail } from "@/pages/details/ConceptDetail";
import { Glyph, glyphKindFromEntityKind } from "@/components/ui/glyph";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { EntityRenameDialog } from "@/components/EntityRenameDialog";
import { usePageMeta } from "@/components/PageMeta";

/**
 * Dispatcher : charge l'entity, dispatch sur `entity.type` vers le bon
 * composant de détail. Layout commun (cartouche éditorial) ici.
 *
 * P8.3 — la nav breadcrumb est remontée dans la titlebar du Layout via
 * usePageMeta, et le header de fiche prend l'idiome papier (Glyph + nom
 * Cormorant + Eyebrow type) comme la charte § 05.
 */
export default function EntityPage() {
  const { universeId, entityId } = useParams<{
    universeId: string;
    entityId: string;
  }>();
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);

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

  const universeSlug =
    universeQuery.data?.name.toLowerCase().replace(/\s+/g, "") ?? "univers";
  const entityName = entityQuery.data?.name ?? "";
  const entityType = entityQuery.data?.type ?? "";
  usePageMeta({
    breadcrumb: entityQuery.data
      ? `${universeSlug}.romanesk · ${entityName}`
      : `${universeSlug}.romanesk · fiche`,
    meta: entityType ? entityType.toLowerCase() : null,
  });

  if (!universeId || !entityId) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-4">
        <p
          className="rounded-[3px] border border-rule bg-paper-deep p-4 font-body italic text-bordeaux"
          role="alert"
        >
          Lien invalide (id d'univers ou de fiche manquant).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-4">
      {/* Cartouche éditorial — Glyph + Eyebrow + nom Cormorant + bouton Renommer */}
      {entityQuery.data && (
        <header className="flex flex-col gap-3 rounded-[4px] border border-rule bg-paper-deep p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Glyph
                kind={glyphKindFromEntityKind(entityQuery.data.type)}
                className="size-6 text-[12px]"
              />
              <Eyebrow bullet={false}>
                {kindLabel(entityQuery.data.type)} · {universeQuery.data?.name ?? "Univers"}
              </Eyebrow>
            </div>
            <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.014em] text-ink">
              {entityQuery.data.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameOpen(true)}
              title="Renommer dans tout l'univers (chapitres + autres fiches)"
            >
              <Pencil className="size-4" aria-hidden /> Renommer dans l'univers
            </Button>
          </div>
        </header>
      )}

      {/* Modale rename propagé (P14.1c) */}
      {entityQuery.data && (
        <EntityRenameDialog
          open={renameOpen}
          entityId={entityQuery.data.id}
          currentName={entityQuery.data.name}
          onClose={() => setRenameOpen(false)}
          onRenamed={() => {
            // Resync de la fiche courante + de toutes les listes liées.
            void qc.invalidateQueries({ queryKey: ["entity", entityId] });
            void qc.invalidateQueries({ queryKey: ["entities"] });
            void qc.invalidateQueries({ queryKey: ["chapters"] });
          }}
        />
      )}

      {entityQuery.isPending && (
        <p className="font-body text-sm italic text-ink-faint">
          Chargement…
        </p>
      )}

      {entityQuery.isError && (
        <p
          className="rounded-[3px] border border-rule bg-paper-deep p-4 font-body italic text-bordeaux"
          role="alert"
        >
          Erreur : {String(entityQuery.error)}
        </p>
      )}

      {entityQuery.data === null && (
        <p
          className="rounded-[3px] border border-rule bg-paper-deep p-4 font-body italic text-bordeaux"
          role="alert"
        >
          Cette fiche n'existe pas (ou a été supprimée).
        </p>
      )}

      {entityQuery.data?.type === "Character" && (
        <CharacterDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "Location" && (
        <LocationDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "Faction" && (
        <FactionDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "Object" && (
        <ObjectDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "Concept" && (
        <ConceptDetail entity={entityQuery.data} universeId={universeId} />
      )}

      {entityQuery.data?.type === "RealEntity" && (
        <p className="rounded-[3px] border border-dashed border-rule bg-transparent p-4 font-body italic text-ink-faint">
          Les entités réelles (Anchor) ne sont pas encore éditables — elles
          seront gérées via la page d'ancrage en Phase 5+.
        </p>
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "Character":
      return "Personnage";
    case "Location":
      return "Lieu";
    case "Faction":
      return "Faction";
    case "Object":
      return "Objet";
    case "Concept":
      return "Concept";
    case "RealEntity":
      return "Entité réelle";
    default:
      return kind;
  }
}
