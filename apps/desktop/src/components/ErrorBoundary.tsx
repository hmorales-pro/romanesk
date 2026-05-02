import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Catch les erreurs de rendu React pour éviter qu'une exception dans une
 * page ne casse toute l'app. Phase 0 : affiche l'erreur brute + un bouton
 * Recharger. Phase 1+ : envoyer l'erreur à un canal de télémétrie OPT-IN.
 *
 * Limitations connues : ne catch PAS les erreurs des handlers async
 * (promises rejetées) — pour ça on a `unhandledrejection` global posé
 * dans `main.tsx`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[Romanesk] ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    // Tauri (et navigateur) : reload complet — l'app reprend depuis main.tsx.
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-2xl w-full flex flex-col gap-4 rounded-lg border border-destructive bg-destructive/5 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle
              className="size-6 text-destructive flex-shrink-0"
              aria-hidden
            />
            <h1 className="text-lg font-semibold text-destructive">
              Romanesk a rencontré une erreur
            </h1>
          </div>
          <p className="text-sm text-foreground/80">
            Tes données ne sont pas perdues — la base SQLite est intacte sur
            ton disque. Recharger l'app suffit en général.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Détail technique
            </summary>
            <pre className="mt-2 p-3 bg-background rounded border border-border overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
              {this.state.error.message}
              {this.state.error.stack && `\n\n${this.state.error.stack}`}
            </pre>
          </details>
          <div className="flex gap-2">
            <Button onClick={this.handleReload}>Recharger</Button>
          </div>
        </div>
      </div>
    );
  }
}
