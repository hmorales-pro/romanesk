import { createHashRouter } from "react-router-dom";
import Layout from "@/components/Layout";
import LibraryPage from "@/pages/LibraryPage";
import UniversePage from "@/pages/UniversePage";
import EntityPage from "@/pages/EntityPage";
import GraphPage from "@/pages/GraphPage";
import TimelinePage from "@/pages/TimelinePage";

/**
 * On utilise `createHashRouter` plutôt que `createBrowserRouter` car
 * Tauri sert son front depuis un schéma `tauri://` (en prod) ou
 * `http://localhost:1430` (en dev). Les hash URLs survivent aux reloads
 * Vite et n'ont besoin d'aucune configuration côté serveur.
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "u/:universeId", element: <UniversePage /> },
      { path: "u/:universeId/e/:entityId", element: <EntityPage /> },
      { path: "u/:universeId/graph", element: <GraphPage /> },
      { path: "u/:universeId/timeline", element: <TimelinePage /> },
    ],
  },
]);
