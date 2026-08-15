/**
 * L'IA est-elle activée pour cet utilisateur ?
 *
 * Romanesk sait écrire sans IA, et certains auteurs n'en veulent pas —
 * par principe, par sobriété, ou parce qu'ils travaillent sur un texte
 * qu'ils ne veulent voir passer par aucun modèle. Jusqu'ici l'onboarding
 * proposait bien « continuer sans IA », mais ça n'écrivait qu'un
 * marqueur d'affichage : l'app continuait de sonder Ollama à chaque
 * démarrage et d'afficher tous les panneaux.
 *
 * Le mode `off` des réglages est la réponse durable. Ce hook le lit pour
 * que l'interface s'aligne.
 */

import { useQuery } from "@tanstack/react-query";

import { settingsGet } from "./api";

export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsGet,
    staleTime: 60_000,
  });
  // Tant que les réglages ne sont pas chargés, on considère l'IA active :
  // faire disparaître puis réapparaître les panneaux serait plus gênant
  // que de les afficher une fraction de seconde de trop.
  return data?.ollamaMode !== "off";
}
