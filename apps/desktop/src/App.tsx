import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface PingResult {
  message: string;
  echoed_at: string;
}

export default function App() {
  const [result, setResult] = useState<PingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePing() {
    setLoading(true);
    setError(null);
    try {
      // `ping` est défini côté Rust dans src-tauri/src/lib.rs
      const res = await invoke<PingResult>("ping");
      setResult(res);
    } catch (err) {
      setError(String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Sparkles className="size-10 text-primary" aria-hidden />
        <h1 className="text-4xl font-semibold tracking-tight">Romanesk</h1>
        <p className="text-muted-foreground max-w-md">
          Walking skeleton — Phase&nbsp;0. Cette page vérifie uniquement que le
          front React communique avec le runtime Rust de Tauri.
        </p>
      </header>

      <button
        onClick={handlePing}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-border bg-primary px-4 py-2",
          "text-sm font-medium text-primary-foreground shadow-sm",
          "hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Zap className="size-4" aria-hidden />
        {loading ? "Envoi du ping…" : "Pinger le runtime Rust"}
      </button>

      {result && (
        <section
          aria-live="polite"
          className="rounded-lg border border-border bg-card p-4 text-sm text-card-foreground"
        >
          <p>
            Réponse Rust&nbsp;: <span className="font-mono">{result.message}</span>
          </p>
          <p className="text-muted-foreground">
            Reçue à <span className="font-mono">{result.echoed_at}</span>
          </p>
        </section>
      )}

      {error && (
        <section
          role="alert"
          className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
        >
          Erreur&nbsp;: <span className="font-mono">{error}</span>
        </section>
      )}

      <footer className="mt-auto pt-8 text-xs text-muted-foreground">
        Build local-first · Tauri 2 + React + Tailwind 4
      </footer>
    </main>
  );
}
