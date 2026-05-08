import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, BrainCog, Save } from "lucide-react";

import {
  aiListModels,
  aiPing,
  settingsGet,
  settingsSave,
  type AiModel,
  type AppSettings,
} from "@/lib/api";
import { alertDialog } from "@/lib/dialog";
import { ModelPullPanel } from "@/components/ModelPullPanel";
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
  const [visionModel, setVisionModel] = useState("");
  const [savedOnce, setSavedOnce] = useState(false);

  // Hydrate le form quand les settings sont chargés.
  useEffect(() => {
    if (settingsQuery.data) {
      setOllamaBaseUrl(settingsQuery.data.ollamaBaseUrl);
      setChatModel(settingsQuery.data.chatModel);
      setEmbedModel(settingsQuery.data.embedModel);
      setCreativeModel(settingsQuery.data.creativeModel ?? "");
      setLiteralModel(settingsQuery.data.literalModel ?? "");
      setVisionModel(settingsQuery.data.visionModel ?? "");
    }
  }, [settingsQuery.data]);

  const onSave = () => {
    const next: AppSettings = {
      ollamaBaseUrl: ollamaBaseUrl.trim() || "http://localhost:11434",
      chatModel: chatModel.trim() || "gemma4:e2b",
      embedModel: embedModel.trim() || "nomic-embed-text:latest",
      creativeModel: creativeModel.trim() || null,
      literalModel: literalModel.trim() || null,
      visionModel: visionModel.trim() || null,
    };
    saveMutation.mutate(next, { onSuccess: () => setSavedOnce(true) });
  };

  const onTest = () => {
    aiPing().then(
      (s) => {
        void alertDialog(
          s.reachable
            ? `Ollama joignable via ${s.providerId}.`
            : `Ollama hors ligne : ${s.error ?? "raison inconnue"}.`,
          { title: s.reachable ? "✓ Connexion OK" : "✗ Connexion impossible" },
        );
      },
      (err) =>
        void alertDialog(String(err), { title: "Erreur de test" }),
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
                <ModelSelect
                  id="set-chat"
                  label="Modèle chat (par défaut)"
                  value={chatModel}
                  onChange={setChatModel}
                  baseUrl={ollamaBaseUrl}
                  hint="Modèle utilisé par défaut pour toutes les actions IA. Suggestions : gemma4:e2b, llama3.2:latest, mistral:latest."
                />
                <ModelSelect
                  id="set-embed"
                  label="Modèle d'embedding"
                  value={embedModel}
                  onChange={setEmbedModel}
                  baseUrl={ollamaBaseUrl}
                  hint="Pour l'indexation RAG. Doit être un modèle d'embedding (768-1024 dim). Suggestions : nomic-embed-text:latest, qwen3-embedding:4b ou :8b, bge-m3:latest."
                />
              </div>

              <div className="grid gap-4 border-t border-rule pt-4 sm:grid-cols-2">
                <ModelSelect
                  id="set-creative"
                  label="Modèle créatif (optionnel)"
                  value={creativeModel}
                  onChange={setCreativeModel}
                  baseUrl={ollamaBaseUrl}
                  optional
                  hint="Utilisé pour les actions divergentes : continuation, brainstorm, atelier description, drafts. Idéalement un modèle plus gros / plus créatif (mistral, llama3.3:70b…)."
                />
                <ModelSelect
                  id="set-literal"
                  label="Modèle littéral (optionnel)"
                  value={literalModel}
                  onChange={setLiteralModel}
                  baseUrl={ollamaBaseUrl}
                  optional
                  hint="Utilisé pour les actions strictes : réécriture, résumé, cohérence. Idéalement un modèle qui suit bien les instructions JSON (gemma3:12b, qwen2.5:14b…)."
                />
              </div>

              <div className="border-t border-rule pt-4">
                <ModelSelect
                  id="set-vision"
                  label="Modèle vision (optionnel — atelier description en mode image)"
                  value={visionModel}
                  onChange={setVisionModel}
                  baseUrl={ollamaBaseUrl}
                  optional
                  hint="Active l'atelier description en mode image sur les fiches Personnage / Lieu / Objet. Doit être un modèle Ollama vision-capable. Suggestions : llava:latest, qwen2.5vl:7b, gemma3:4b (avec vision)."
                />
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

      {/* P9.2 — téléchargeur de modèles intégré, accessible directement
       * sans passer par le terminal. */}
      {settingsQuery.data && <ModelPullPanel baseUrl={ollamaBaseUrl} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModelSelect — dropdown des modèles Ollama installés
// ---------------------------------------------------------------------------

interface ModelSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** URL du serveur Ollama à interroger pour la liste. */
  baseUrl: string;
  /** Si true, expose une option vide "(par défaut)". */
  optional?: boolean;
  /** Petit texte d'aide en dessous. */
  hint?: string;
}

function ModelSelect({
  id,
  label,
  value,
  onChange,
  baseUrl,
  optional = false,
  hint,
}: ModelSelectProps) {
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge la liste à l'arrivée et quand l'URL Ollama change.
  useEffect(() => {
    if (!baseUrl.trim()) return;
    setLoading(true);
    setError(null);
    aiListModels(baseUrl)
      .then((list) => {
        setModels(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setModels(null);
        setLoading(false);
      });
  }, [baseUrl]);

  // Si la valeur courante n'est pas dans la liste retournée par Ollama, on
  // l'ajoute en option custom pour éviter de la perdre silencieusement.
  const optionsList = (() => {
    if (!models) return [];
    const names = models.map((m) => m.name);
    if (value && !names.includes(value)) {
      return [{ name: value, sizeBytes: 0, modifiedAt: null }, ...models];
    }
    return models;
  })();

  // Fallback texte si Ollama hors ligne.
  if (error) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={optional ? "(vide → modèle par défaut)" : ""}
        />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-bordeaux">
          Ollama hors ligne — saisie libre
        </p>
        {hint && (
          <p className="text-xs italic text-ink-faint">{hint}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="h-9 rounded-[3px] border border-rule bg-paper px-3 font-body text-[14px] text-ink transition-colors focus-visible:border-bordeaux/40 focus-visible:outline-none disabled:opacity-50"
      >
        {loading && <option value={value}>Chargement…</option>}
        {!loading && optional && (
          <option value="">— modèle par défaut —</option>
        )}
        {!loading &&
          optionsList.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
              {m.sizeBytes > 0 ? ` · ${formatSize(m.sizeBytes)}` : ""}
            </option>
          ))}
      </select>
      {hint && (
        <p className="text-xs italic leading-snug text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
