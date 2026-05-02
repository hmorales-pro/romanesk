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
  const [creativeModel, setCreativeModel] = useState("");
  const [literalModel, setLiteralModel] = useState("");
  const [savedOnce, setSavedOnce] = useState(false);

  // Hydrate le form quand les settings sont chargés.
  useEffect(() => {
    if (settingsQuery.data) {
      setOllamaBaseUrl(settingsQuery.data.ollamaBaseUrl);
      setChatModel(settingsQuery.data.chatModel);
      setEmbedModel(settingsQuery.data.embedModel);
      setCreativeModel(settingsQuery.data.creativeModel ?? "");
      setLiteralModel(settingsQuery.data.literalModel ?? "");
    }
  }, [settingsQuery.data]);

  const onSave = () => {
    const next: AppSettings = {
      ollamaBaseUrl: ollamaBaseUrl.trim() || "http://localhost:11434",
      chatModel: chatModel.trim() || "gemma4:e2b",
      embedModel: embedModel.trim() || "nomic-embed-text:latest",
      creativeModel: creativeModel.trim() || null,
      literalModel: literalModel.trim() || null,
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
                  <Label htmlFor="set-chat">Modèle chat (par défaut)</Label>
                  <Input
                    id="set-chat"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    placeholder="gemma4:e2b"
                  />
                  <p className="text-xs text-muted-foreground">
                    Modèle utilisé par défaut pour toutes les actions IA.
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

              <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="set-creative">
                    Modèle créatif (optionnel)
                  </Label>
                  <Input
                    id="set-creative"
                    value={creativeModel}
                    onChange={(e) => setCreativeModel(e.target.value)}
                    placeholder="(vide → modèle par défaut)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisé pour les actions divergentes : continuation,
                    brainstorm, atelier description, drafts. Idéalement un
                    modèle plus gros / plus créatif (mistral, llama3.3:70b…).
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="set-literal">
                    Modèle littéral (optionnel)
                  </Label>
                  <Input
                    id="set-literal"
                    value={literalModel}
                    onChange={(e) => setLiteralModel(e.target.value)}
                    placeholder="(vide → modèle par défaut)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisé pour les actions strictes : réécriture, résumé,
                    cohérence. Idéalement un modèle qui suit bien les
                    instructions JSON (gemma3:12b, qwen2.5:14b…).
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
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  ✓ Settings enregistrés dans{" "}
                  <span className="font-mono text-xs">
                    ~/Library/Application Support/app.romanesk.desktop/settings.json
                  </span>
                  . Les providers IA ont été rechargés à chaud — pas besoin
                  de redémarrer.
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
