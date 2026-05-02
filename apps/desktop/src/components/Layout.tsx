import { Link, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Sparkles className="size-5" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">Romanesk</span>
          </Link>
          <span className="text-xs text-muted-foreground">Phase 0 · pre-alpha</span>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
