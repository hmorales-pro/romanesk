/**
 * Hook react-query partagé pour lire les settings de l'app.
 *
 * Sert de point unique de lecture pour les composants qui ont besoin de
 * choisir un modèle dérivé (créatif vs littéral, P6.2). react-query
 * déduplique automatiquement les useQuery avec la même clé, donc N
 * panels qui appellent useSettings() = 1 seul fetch réseau.
 *
 * Le hook expose aussi des helpers `pickModel(kind)` pour résoudre le
 * fallback chatModel quand le modèle dédié n'est pas configuré.
 */

import { useQuery } from "@tanstack/react-query";

import { settingsGet, type AppSettings } from "./api";

export type ModelKind = "creative" | "literal" | "default";

export interface SettingsHelpers {
  settings: AppSettings | null;
  /**
   * Retourne le modèle à utiliser pour un type d'action :
   * - "creative" : creativeModel sinon chatModel
   * - "literal"  : literalModel sinon chatModel
   * - "default"  : chatModel
   * Retourne `undefined` si les settings ne sont pas encore chargés —
   * dans ce cas le caller laisse le backend choisir son default_model.
   */
  pickModel: (kind: ModelKind) => string | undefined;
}

export function useSettings(): SettingsHelpers {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: settingsGet,
    // Les settings changent rarement et sont invalidés explicitement
    // par SettingsPage / l'event Tauri P6.2.
    staleTime: 5 * 60 * 1000,
  });

  const settings = q.data ?? null;

  const pickModel = (kind: ModelKind): string | undefined => {
    if (!settings) return undefined;
    switch (kind) {
      case "creative":
        return (
          (settings.creativeModel?.trim() ? settings.creativeModel : null) ??
          settings.chatModel ??
          undefined
        );
      case "literal":
        return (
          (settings.literalModel?.trim() ? settings.literalModel : null) ??
          settings.chatModel ??
          undefined
        );
      case "default":
        return settings.chatModel || undefined;
    }
  };

  return { settings, pickModel };
}
