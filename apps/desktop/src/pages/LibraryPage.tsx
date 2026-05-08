import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileUp, Plus } from "lucide-react";

import {
  universeCreate,
  universeDelete,
  universeExportMarkdown,
  universeList,
} from "@/lib/api";
import { AIStatusBadge } from "@/components/AIStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePageMeta } from "@/components/PageMeta";

export default function LibraryPage() {
  const qc = useQueryClient();

  const universesQuery = useQuery({
    queryKey: ["universes"],
    queryFn: universeList,
  });

  const createMutation = useMutation({
    mutationFn: universeCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["universes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: universeDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["universes"] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      { onSuccess: () => resetForm() },
    );
  };

  const universeCount = universesQuery.data?.length ?? 0;
  usePageMeta({
    breadcrumb: "Romanesk · bibliothèque",
    meta: universeCount > 0 ? `${universeCount} univers` : null,
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-4">
      {/* Cartouche éditorial — Eyebrow + nom Cormorant + actions */}
      <header className="flex flex-col gap-4 rounded-[4px] border border-rule bg-paper-deep p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Eyebrow>Bibliothèque · {universeCount} univers</Eyebrow>
          <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.014em] text-ink">
            Tes <em className="font-display italic font-normal text-bordeaux">univers fictionnels.</em>
          </h1>
          <p className="max-w-[36em] font-body text-[15px] italic leading-[1.55] text-ink-soft">
            Construis, écris, garde — tout reste sur ta machine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AIStatusBadge />
          <Link to="/import">
            <Button variant="outline" size="sm">
              <FileUp className="size-4" aria-hidden /> Importer un écrit
            </Button>
          </Link>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="size-4" aria-hidden />
              Nouvel univers
            </Button>
          )}
        </div>
      </header>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nouvel univers</CardTitle>
            <CardDescription>
              Donne-lui un nom — tu pourras tout préciser après.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="universe-name">Nom *</Label>
                <Input
                  id="universe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aether, Royaume de Bren, …"
                  autoFocus
                  required
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="universe-desc">Description (optionnelle)</Label>
                <Textarea
                  id="universe-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Une phrase pour situer le ton, l'époque, l'enjeu…"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !name.trim()}
                >
                  {createMutation.isPending ? "Création…" : "Créer"}
                </Button>
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Annuler
                </Button>
              </div>
              {createMutation.isError && (
                <p className="text-sm text-destructive" role="alert">
                  Erreur : {String(createMutation.error)}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <section>
        {universesQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
        {universesQuery.isError && (
          <p className="text-sm text-destructive" role="alert">
            Erreur : {String(universesQuery.error)}
          </p>
        )}
        {universesQuery.data && universesQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucun univers pour l'instant. Crée le premier ↑
          </p>
        )}
        {universesQuery.data && universesQuery.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {universesQuery.data.map((u, idx) => (
              <Card
                key={u.id}
                className="group flex flex-col gap-2 p-5 transition hover:border-bordeaux/40"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <CardTitle>
                  <Link
                    to={`/u/${u.id}`}
                    className="font-display text-2xl font-medium leading-[1.05] tracking-[-0.014em] text-ink transition group-hover:text-bordeaux"
                  >
                    {u.name}
                  </Link>
                </CardTitle>
                {u.description && (
                  <CardDescription className="line-clamp-3">
                    {u.description}
                  </CardDescription>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-dotted border-rule pt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
                  <span>
                    Créé le{" "}
                    {new Date(u.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="hover:text-bordeaux"
                      onClick={async () => {
                        try {
                          const md = await universeExportMarkdown(u.id);
                          await navigator.clipboard.writeText(md);
                          window.alert(
                            `Markdown de « ${u.name} » copié dans le presse-papier (${md.length} caractères).`,
                          );
                        } catch (err) {
                          window.alert(`Échec de l'export : ${String(err)}`);
                        }
                      }}
                    >
                      Exporter
                    </button>
                    <span className="text-ink-faint/40">·</span>
                    <button
                      type="button"
                      className="hover:text-bordeaux"
                      onClick={() => {
                        if (window.confirm(`Supprimer "${u.name}" ?`)) {
                          deleteMutation.mutate(u.id);
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
