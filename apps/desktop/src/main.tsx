import React from "react";
import ReactDOM from "react-dom/client";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { alertDialog } from "./lib/dialog";
import { installCloseGuard } from "./lib/closeGuard";
import "./index.css";

const queryClient = new QueryClient({
  // P16.3 — filet d'erreur global sur les écritures.
  //
  // Une mutation lancée en `.mutate(...)` range son rejet dans
  // `mutation.isError` et s'arrête là : sans `onError`, un échec de
  // création, d'édition ou de suppression ne produisait strictement
  // aucun signal — ni dialogue, ni rejet non géré. L'auteur croyait son
  // travail enregistré.
  //
  // Le `MutationCache` couvre toutes les mutations d'un coup. Les cas
  // qui méritent un message sur mesure gardent leur `onError` local :
  // celui-ci ne se déclenche que s'il n'y en a pas.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return;
      console.error("[Romanesk] mutation échouée:", error);
      void alertDialog(String(error), {
        title: "Modification non enregistrée",
      });
    },
  }),
  defaultOptions: {
    queries: {
      // Romanesk est local-first : pas de réseau distant à laisser respirer.
      // On remet juste un staleTime court pour éviter les refetch en boucle
      // pendant le dev (HMR + StrictMode).
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// P16.3 — interception de la fermeture de fenêtre : le backend nous
// laisse vider les sauvegardes en attente avant de laisser partir l'app.
installCloseGuard();

// Handlers globaux pour les erreurs non catchées par l'ErrorBoundary
// (qui ne capte que les erreurs de RENDU React, pas les promesses rejetées
// ni les exceptions dans les handlers d'event).
window.addEventListener("error", (event) => {
  console.error("[Romanesk] window.error:", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Romanesk] unhandled promise rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
