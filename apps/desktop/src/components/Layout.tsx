import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  // Le bouton retour ne sert à rien sur la racine (LibraryPage), on le
  // masque. Sur toutes les autres pages, on appelle navigate(-1) qui
  // fait l'équivalent du back navigateur (utilise l'historique).
  const showBack = location.pathname !== "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md size-8 hover:bg-accent transition"
              title="Retour à la page précédente"
              aria-label="Retour"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Sparkles className="size-5" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">Romanesk</span>
          </Link>
          <span className="text-xs text-muted-foreground">v0.6.0 · pre-alpha</span>
          <Link
            to="/settings"
            className="ml-auto text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            title="Paramètres"
          >
            <SettingsIcon className="size-4" aria-hidden />
            <span className="sr-only">Paramètres</span>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
