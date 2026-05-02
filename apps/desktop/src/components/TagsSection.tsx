import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import {
  tagCreateInUniverse,
  tagGetForEntity,
  tagListInUniverse,
  tagSetForEntity,
} from "@/lib/api";
import { type Entity, type Tag } from "@/lib/types";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  entity: Entity;
}

/**
 * Section Tags d'une fiche : chips actuels + champ « ajouter un tag »
 * avec auto-création si le nom n'existe pas dans l'univers.
 *
 * Sauvegarde côté serveur via `tagSetForEntity` (remplacement en bloc).
 * Tags retirés via leur croix inline. Couleur fixe par défaut en P1.4 ;
 * customisable via une page dédiée plus tard.
 */
export function TagsSection({ entity }: Props) {
  const qc = useQueryClient();

  const myTagsQuery = useQuery({
    queryKey: ["entity-tags", entity.id],
    queryFn: () => tagGetForEntity(entity.id),
  });

  const universeTagsQuery = useQuery({
    queryKey: ["universe-tags", entity.universe_id],
    queryFn: () => tagListInUniverse(entity.universe_id),
  });

  const setMutation = useMutation({
    mutationFn: ({ tagIds }: { tagIds: string[] }) =>
      tagSetForEntity(entity.id, tagIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-tags", entity.id] });
      qc.invalidateQueries({ queryKey: ["universe-tags", entity.universe_id] });
    },
  });

  const createMutation = useMutation({
    mutationFn: tagCreateInUniverse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["universe-tags", entity.universe_id] });
    },
  });

  const [input, setInput] = useState("");

  // Set local synchronisé avec myTagsQuery pour permettre des opérations
  // optimistes (ajout / retrait) sans re-fetcher entre chaque interaction.
  const [localTagIds, setLocalTagIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (myTagsQuery.data) {
      setLocalTagIds(new Set(myTagsQuery.data.map((t) => t.id)));
    }
  }, [myTagsQuery.data]);

  const myTags = (universeTagsQuery.data ?? []).filter((t) =>
    localTagIds.has(t.id),
  );

  const persist = (next: Set<string>) => {
    setLocalTagIds(next);
    setMutation.mutate({ tagIds: [...next] });
  };

  const removeTag = (tagId: string) => {
    const next = new Set(localTagIds);
    next.delete(tagId);
    persist(next);
  };

  const addByName = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    // Cherche d'abord dans les tags existants de l'univers (case-insensitive)
    const existing = (universeTagsQuery.data ?? []).find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const next = new Set(localTagIds);
      next.add(existing.id);
      persist(next);
      return;
    }
    // Sinon création (le serveur fait find_or_create donc safe contre les doublons)
    const created = await createMutation.mutateAsync({
      universeId: entity.universe_id,
      name,
    });
    const next = new Set(localTagIds);
    next.add(created.id);
    persist(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void addByName(input).then(() => setInput(""));
    } else if (e.key === "Backspace" && input === "" && myTags.length > 0) {
      // Retire le dernier tag si l'input est vide.
      removeTag(myTags[myTags.length - 1].id);
    }
  };

  // Suggestions : tags de l'univers pas encore assignés et qui matchent l'input
  const suggestions = (universeTagsQuery.data ?? [])
    .filter((t) => !localTagIds.has(t.id))
    .filter((t) =>
      input.trim() === "" ? true : t.name.toLowerCase().includes(input.toLowerCase()),
    )
    .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Tags</CardTitle>
        <CardDescription>
          Mots-clés transverses pour filtrer la bibliothèque. Crée à la volée.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          {myTags.map((t) => (
            <TagChip key={t.id} tag={t} onRemove={() => removeTag(t.id)} />
          ))}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={myTags.length === 0 ? "Tape un tag puis Entrée…" : "+ tag"}
            className="h-7 w-32 text-xs"
          />
        </div>
        {input.trim() !== "" && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const next = new Set(localTagIds);
                  next.add(s.id);
                  persist(next);
                  setInput("");
                }}
                className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              >
                + {s.name}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TagChipProps {
  tag: Tag;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
}

export function TagChip({ tag, onRemove, onClick, active }: TagChipProps) {
  const style = tag.color ? { borderColor: tag.color, color: tag.color } : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary text-secondary-foreground border-border",
        onClick && "cursor-pointer hover:opacity-80",
      )}
      style={style}
      onClick={onClick}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-60 hover:opacity-100"
          aria-label={`Retirer le tag ${tag.name}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
