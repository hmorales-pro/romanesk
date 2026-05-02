/**
 * Pré-remplissage IA des champs structurés d'une fiche (Phase 6.1).
 *
 * Couplage minimal : prend un universeId + un kind d'entity + un nom +
 * un callback `onApply(draft)`. Le panel appelle `ai_generate_entity_draft`
 * (étendu en P6.1 aux types Faction / Object / Concept en plus de
 * Character / Location), affiche les champs reçus pour relecture, puis
 * laisse l'utilisateur cliquer « Appliquer » pour pousser les valeurs
 * dans les states du form parent.
 *
 * Ce panel ne fait pas de description Tiptap riche — c'est le boulot
 * d'AiDescriptionPanel (P5.6). Ici on remplit des champs typés
 * structurés (kind, ideology, properties[], etc.).
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Wand2, Check, X } from "lucide-react";

import { aiGenerateEntityDraft, type EntityDraft } from "@/lib/api";
import type { EntityType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AiDraftPanelProps {
  universeId: string;
  kind: EntityType;
  /** Nom courant du form parent (utilisé comme entrée du draft). */
  name: string;
  /** Pour libellés (« faction », « objet », « concept »…). */
  kindLabel: string;
  /** Appliqué quand l'utilisateur clique « Appliquer ». */
  onApply: (draft: EntityDraft) => void;
}

export function AiDraftPanel({
  universeId,
  kind,
  name,
  kindLabel,
  onApply,
}: AiDraftPanelProps) {
  const [hint, setHint] = useState("");
  const [draft, setDraft] = useState<EntityDraft | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      aiGenerateEntityDraft({
        universeId,
        kind,
        name: name.trim(),
        hint: hint.trim() || undefined,
      }),
    onSuccess: setDraft,
  });

  const apply = () => {
    if (draft) onApply(draft);
    setDraft(null);
  };

  const isEmpty = !name.trim();

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-amber-600" aria-hidden />
        <span className="text-sm font-medium">
          Pré-remplir {kindLabel} avec l'IA
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Indication facultative (genre, époque, ton, contexte)"
          disabled={mutation.isPending}
        />
        <Button
          size="sm"
          onClick={() => {
            setDraft(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending || isEmpty}
          title={isEmpty ? "Renseigne d'abord le nom" : "Générer un brouillon"}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Génération…
            </>
          ) : draft ? (
            "Régénérer"
          ) : (
            "Générer le brouillon"
          )}
        </Button>
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          Renseigne au moins le nom au-dessus pour activer la génération.
        </p>
      )}

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {draft && (
        <div className="rounded-md border bg-background/60 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Brouillon proposé (non appliqué)
            </p>
            <div className="flex gap-1">
              <Button size="sm" onClick={apply}>
                <Check className="size-3.5" aria-hidden /> Appliquer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>

          {draft.parseWarning && (
            <p className="text-xs text-amber-700">
              ⚠ {draft.parseWarning}
            </p>
          )}

          <DraftPreview draft={draft} />
        </div>
      )}
    </div>
  );
}

function DraftPreview({ draft }: { draft: EntityDraft }) {
  const fields: { label: string; value: string | null }[] = [
    { label: "Nom", value: draft.name },
    { label: "Résumé", value: draft.summary },
    { label: "Archétype", value: draft.archetype },
    {
      label: "Traits",
      value: draft.traits?.length ? draft.traits.join(", ") : null,
    },
    { label: "Type de lieu", value: draft.locationKind },
    { label: "Climat", value: draft.climate },
    { label: "Population", value: draft.population },
    { label: "Type de faction", value: draft.factionKind },
    { label: "Idéologie", value: draft.ideology },
    { label: "Fondation", value: draft.founded },
    { label: "Dirigeant", value: draft.leader },
    { label: "Type d'objet", value: draft.objectKind },
    { label: "Origine", value: draft.origin },
    { label: "Propriétaire", value: draft.owner },
    {
      label: "Propriétés",
      value: draft.properties?.length ? draft.properties.join(", ") : null,
    },
    { label: "Type de concept", value: draft.conceptKind },
    { label: "Domaine", value: draft.domain },
  ].filter((f) => f.value);

  return (
    <dl className="grid gap-1 text-sm">
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-[120px_1fr] gap-2">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="text-sm">{f.value}</dd>
        </div>
      ))}
      {draft.descriptionText && (
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <dt className="text-xs text-muted-foreground">Description</dt>
          <dd className="text-sm italic text-muted-foreground line-clamp-3 whitespace-pre-wrap">
            {draft.descriptionText}
          </dd>
        </div>
      )}
    </dl>
  );
}
