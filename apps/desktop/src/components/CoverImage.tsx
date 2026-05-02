import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ImagePlus, ImageOff } from "lucide-react";

import {
  entityClearCoverImage,
  entityGetCoverImageData,
  entitySetCoverImage,
} from "@/lib/api";
import type { Entity } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
  entity: Entity;
}

/**
 * Image de couverture d'une entité. Stockage côté Rust dans
 * `<app_data_dir>/media/<universeId>/<entityId>/cover_<timestamp>.<ext>`.
 *
 * Chargement via base64 pour rester simple — pas de configuration
 * `assetProtocol` Tauri à faire. Suffisant pour des images < 1 MB.
 * Si on a besoin d'images lourdes en Phase 2+, switcher vers le
 * protocole `asset://` natif.
 */
export function CoverImage({ entity }: Props) {
  const qc = useQueryClient();

  const imageQuery = useQuery({
    queryKey: ["entity-cover", entity.id],
    queryFn: () => entityGetCoverImageData(entity.id),
  });

  const setMutation = useMutation({
    mutationFn: (sourcePath: string) =>
      entitySetCoverImage(entity.id, sourcePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-cover", entity.id] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => entityClearCoverImage(entity.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-cover", entity.id] });
    },
  });

  const onChoose = async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["jpg", "jpeg", "png", "gif", "webp"],
        },
      ],
    });
    if (typeof selected === "string") {
      setMutation.mutate(selected);
    }
  };

  const data = imageQuery.data;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="aspect-[16/9] w-full rounded-md border border-border bg-secondary/30 flex items-center justify-center overflow-hidden"
      >
        {imageQuery.isPending ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : data ? (
          <img
            src={`data:${data.mime};base64,${data.dataBase64}`}
            alt={`Couverture de ${entity.name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Pas d'image de couverture.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onChoose}
          disabled={setMutation.isPending}
        >
          <ImagePlus className="size-3.5" aria-hidden />
          {data ? "Changer l'image" : "Ajouter une image"}
        </Button>
        {data && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            <ImageOff className="size-3.5" aria-hidden /> Retirer
          </Button>
        )}
      </div>
      {setMutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          {String(setMutation.error)}
        </p>
      )}
    </div>
  );
}
