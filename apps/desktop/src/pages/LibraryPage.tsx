import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, FileUp, Library, Plus } from "lucide-react";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Library className="size-8 text-primary" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold">Bibliothèque</h1>
            <p className="text-sm text-muted-foreground">
              Tes univers fictionnels.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AIStatusBadge />
          <Link to="/import">
            <Button variant="outline">
              <FileUp className="size-4" aria-hidden /> Importer un écrit
            </Button>
          </Link>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
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
          <div className="grid gap-3 sm:grid-cols-2">
            {universesQuery.data.map((u) => (
              <Card key={u.id} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle>
                    <Link
                      to={`/u/${u.id}`}
                      className="hover:underline flex items-center gap-2"
                    >
                      <BookOpen
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      {u.name}
                    </Link>
                  </CardTitle>
                  {u.description && (
                    <CardDescription>{u.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Créé le{" "}
                    {new Date(u.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
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
                      Exporter MD
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        // Confirm natif suffit pour Phase 0 ; à remplacer par
                        // un Dialog shadcn en Phase 1 (UX plus propre).
                        if (window.confirm(`Supprimer "${u.name}" ?`)) {
                          deleteMutation.mutate(u.id);
                        }
                      }}
                    >
                      Supprimer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
