import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const queryClient = new QueryClient({
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
