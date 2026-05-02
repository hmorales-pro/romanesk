import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, BrainCog, Save } from "lucide-react";

import { aiPing, settingsGet, settingsSave, type AppSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: settingsGet,
  });

  const saveMutation = useMutation({
    mutationFn: settingsSave,
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
    },
  });

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [embedModel, setEmbedModel] = useState("");
  const [savedOnce, setSavedOnce] = useState(false);

  // Hydrate le form quand les settings sont chargés.
  useEffect(() => {
    if (settingsQuery.data) {
      setOllamaBaseUrl(settingsQuery.data.ollamaBaseUrl);
      setChatModel(settingsQuery.data.chatModel);
      setEmbedModel(settingsQuery.data.embedModel);
    }
  }, [settingsQuery.data]);

  const onSave = () => {
    const next: AppSettings = {
      ollamaBaseUrl: ollamaBaseUrl.trim() || "http://localhost:11434",
      chatModel: chatModel.trim() || "gemma4:e2b",
      embedModel: embedModel.trim() || "nomic-embed-text:latest",
    };
    saveMutation.mutate(next, { onSuccess: () => setSavedOnce(true) });
  };

  const onTest = () => {
    aiPing().then(
      (s) => {
        window.alert(
          s.reachable
            ? `✓ Ollama joignable (${s.providerId})`
            : `✗ Ollama hors ligne : ${s.error ?? "raison inconnue"}`,
        );
      },
      (err) => window.alert(`Erreur: ${String(err)}`),
    );
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-3xl flex flex-col gap-6">
      <nav>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Bibliothèque
        </Link>
      </nav>

      <header className="flex items-start gap-4">
        <div className="rounded-full bg-secondary p-3 text-secondary-foreground">
          <BrainCog className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Paramètres</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configuration du provider IA local (Ollama).
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ollama</CardTitle>
          <CardDescription>
            URL du serveur Ollama et modèles utilisés pour la génération de
            texte (chat) et les embeddings (RAG).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {settingsQuery.isPending && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}

          {settingsQuery.data && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="set-url">URL Ollama</Label>
                <Input
                  id="set-url"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <p className="text-xs text-muted-foreground">
                  Default : http://localhost:11434
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="set-chat">Modèle chat</Label>
                  <Input
                    id="set-chat"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    placeholder="gemma4:e2b"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pour la génération de fiches et le RAG.
                    Suggestions : gemma4:e2b, llama3.2:latest, mistral:latest.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="set-embed">Modèle d'embedding</Label>
                  <Input
                    id="set-embed"
                    value={embedModel}
                    onChange={(e) => setEmbedModel(e.target.value)}
                    placeholder="nomic-embed-text:latest"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pour l'indexation RAG. Doit être un modèle d'embedding
                    (768-1024 dim). Suggestions : nomic-embed-text:latest,
                    qwen3-embedding:4b ou :8b, bge-m3:latest.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={onSave} disabled={saveMutation.isPending}>
                  <Save className="size-4" aria-hidden />
                  {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button variant="outline" onClick={onTest}>
                  Tester Ollama
                </Button>
              </div>

              {savedOnce && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  ✓ Settings enregistrés dans{" "}
                  <span className="font-mono text-xs">
                    ~/Library/Application Support/app.romanesk.desktop/settings.json
                  </span>
                  .
                  <br />
                  <strong>Redémarre Romanesk</strong> pour que les nouveaux
                  modèles soient chargés (rechargement à chaud des providers
                  IA en Phase 4+).
                </div>
              )}

              {saveMutation.isError && (
                <p className="text-sm text-destructive" role="alert">
                  {String(saveMutation.error)}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
