/**
 * Atelier de description : génère un texte riche pour remplir le champ
 * description (Tiptap) d'une fiche Personnage / Lieu / Objet (Phase 5.6).
 *
 * Le prompt est construit à partir des champs structurés déjà remplis
 * (nom, summary, archetype/traits, kind/climate/population, etc.) — pas
 * besoin que l'utilisateur réécrive le contexte. Le modèle produit un
 * texte sensoriel, atmosphérique, en 2-4 paragraphes.
 *
 * Le résultat n'écrit jamais directement dans le doc Tiptap : l'utilisateur
 * choisit Accepter (remplace le doc), Ajouter (append à la fin) ou Copier.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ClipboardCopy,
  Loader2,
  Plus,
  Replace,
  Wand2,
  X,
} from "lucide-react";

import { aiComplete } from "@/lib/api";
import { useSettings } from "@/lib/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DescriptionTargetKind = "character" | "location" | "object";

interface AiDescriptionPanelProps {
  /** Type de fiche — détermine le prompt template. */
  targetKind: DescriptionTargetKind;
  /** Nom de la fiche (Character / Location / Object). */
  name: string;
  /** Résumé court (entity.summary). */
  summary: string | null;
  /**
   * Champs structurés déjà remplis, à injecter dans le contexte.
   * Format libre : `{ "Archétype": "guerrier", "Traits": "noble, taiseux" }`.
   */
  structuredFields: Record<string, string | null | undefined>;
  /** Remplace le doc description par les paragraphes générés. */
  onReplace: (paragraphs: string[]) => void;
  /** Append les paragraphes générés à la fin du doc. */
  onAppend: (paragraphs: string[]) => void;
}

export function AiDescriptionPanel({
  targetKind,
  name,
  summary,
  structuredFields,
  onReplace,
  onAppend,
}: AiDescriptionPanelProps) {
  const [hint, setHint] = useState("");
  const [text, setText] = useState<string | null>(null);
  const { pickModel } = useSettings();

  const mutation = useMutation({
    mutationFn: async () => {
      const userPrompt = buildPrompt({
        targetKind,
        name,
        summary,
        structuredFields,
        hint: hint.trim() || null,
      });
      const res = await aiComplete({
        system: SYSTEM_PROMPTS[targetKind],
        user: userPrompt,
        temperature: 0.85,
        maxTokens: 1200,
        model: pickModel("creative"),
      });
      return res.content.trim();
    },
    onSuccess: setText,
  });

  const splitParagraphs = (raw: string): string[] =>
    raw
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

  const accept = () => {
    if (text) onReplace(splitParagraphs(text));
    setText(null);
  };
  const append = () => {
    if (text) onAppend(splitParagraphs(text));
    setText(null);
  };
  const copy = () => {
    if (text) void navigator.clipboard.writeText(text);
  };

  const targetLabel = TARGET_LABELS[targetKind];
  const isEmpty = !name.trim();

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-violet-600" aria-hidden />
        <span className="text-sm font-medium">Atelier description</span>
        <span className="text-xs text-muted-foreground">
          (génère un texte riche pour {targetLabel})
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Indication facultative (ton, ambiance, longueur, focus…)"
          disabled={mutation.isPending}
        />
        <Button
          size="sm"
          onClick={() => {
            setText(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending || isEmpty}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Génération…
            </>
          ) : text ? (
            "Régénérer"
          ) : (
            "Décrire"
          )}
        </Button>
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          Renseigne au moins le nom pour activer la génération.
        </p>
      )}

      {mutation.isError && (
        <p className="text-sm text-destructive" role="alert">
          {String(mutation.error)}
        </p>
      )}

      {text && (
        <div className="rounded-md border bg-background/60 p-3 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Description proposée (non sauvegardée)
          </p>
          <div className="text-sm italic whitespace-pre-wrap leading-relaxed text-muted-foreground">
            {text}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={accept}>
              <Replace className="size-3.5" aria-hidden /> Remplacer
            </Button>
            <Button size="sm" variant="outline" onClick={append}>
              <Plus className="size-3.5" aria-hidden /> Ajouter à la suite
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              <ClipboardCopy className="size-3.5" aria-hidden /> Copier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setText(null)}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const TARGET_LABELS: Record<DescriptionTargetKind, string> = {
  character: "ce personnage",
  location: "ce lieu",
  object: "cet objet",
};

const SYSTEM_PROMPTS: Record<DescriptionTargetKind, string> = {
  character: `Tu es un romancier francophone. On te donne une fiche structurée de personnage. Tu produis une description riche, sensorielle (apparence physique, présence, voix, gestes, regard, manière d'être), en 2 à 4 paragraphes. Pas de meta-commentaire, pas d'introduction, juste le texte. Évite les clichés. Reste cohérent avec les traits déjà notés.`,
  location: `Tu es un romancier francophone. On te donne une fiche structurée de lieu. Tu produis une description riche, sensorielle (lumière, sons, odeurs, textures, atmosphère, ce qu'on y voit en arrivant, ce qui frappe), en 2 à 4 paragraphes. Pas de meta-commentaire, pas d'introduction, juste le texte. Évite les clichés. Reste cohérent avec les éléments déjà notés (climat, population…).`,
  object: `Tu es un romancier francophone. On te donne une fiche structurée d'objet. Tu produis une description riche, sensorielle et évocatrice (apparence, matière, poids, marques d'usure, l'effet qu'il produit sur ceux qui le touchent ou le voient, son histoire suggérée), en 2 à 4 paragraphes. Pas de meta-commentaire, pas d'introduction, juste le texte. Reste cohérent avec les propriétés et l'origine déjà notées.`,
};

function buildPrompt(args: {
  targetKind: DescriptionTargetKind;
  name: string;
  summary: string | null;
  structuredFields: Record<string, string | null | undefined>;
  hint: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`NOM : ${args.name}`);
  if (args.summary) lines.push(`RÉSUMÉ : ${args.summary}`);
  for (const [k, v] of Object.entries(args.structuredFields)) {
    if (v && v.trim()) lines.push(`${k.toUpperCase()} : ${v}`);
  }
  if (args.hint) {
    lines.push("");
    lines.push(`INDICATION SPÉCIFIQUE : ${args.hint}`);
  }
  lines.push("");
  lines.push(
    "Produis une description riche en 2 à 4 paragraphes (séparés par des doubles retours à la ligne).",
  );
  return lines.join("\n");
}
