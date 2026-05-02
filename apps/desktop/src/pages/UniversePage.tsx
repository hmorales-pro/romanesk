import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, User } from "lucide-react";

import {
  entityCreate,
  entityListInUniverse,
  universeGet,
} from "@/lib/api";
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

export default function UniversePage() {
  const { universeId } = useParams<{ universeId: string }>();
  const qc = useQueryClient();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const entitiesQuery = useQuery({
    queryKey: ["entities", universeId],
    queryFn: () => entityListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const createMutation = useMutation({
    mutationFn: entityCreate,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["entities", universeId] }),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("");
  const [traitsRaw, setTraitsRaw] = useState("");
  const [biography, setBiography] = useState("");

  const resetForm = () => {
    setName("");
    setArchetype("");
    setTraitsRaw("");
    setBiography("");
    setShowForm(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !universeId) return;
    const traits = traitsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate(
      {
        universeId,
        name: name.trim(),
        archetype: archetype.trim() || undefined,
        traits,
        biography: biography.trim() || undefined,
      },
      { onSuccess: () => resetForm() },
    );
  };

  if (!universeId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <p className="text-destructive" role="alert">
          Univers introuvable (id manquant dans l'URL).
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl flex flex-col gap-8">
      <nav>
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Bibliothèque
        </Link>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          {universeQuery.isPending && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {universeQuery.data && (
            <>
              <h1 className="text-2xl font-semibold">{universeQuery.data.name}</h1>
              {universeQuery.data.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {universeQuery.data.description}
                </p>
              )}
            </>
          )}
          {universeQuery.data === null && (
            <p className="text-destructive" role="alert">
              Cet univers n'existe pas (ou a été supprimé).
            </p>
          )}
        </div>
        {!showForm && universeQuery.data && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" aria-hidden />
            Nouveau personnage
          </Button>
        )}
      </header>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau personnage</CardTitle>
            <CardDescription>
              Tu peux remplir uniquement le nom maintenant et compléter plus tard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="char-name">Nom *</Label>
                <Input
                  id="char-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aldric, Lyra, …"
                  autoFocus
                  required
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="char-archetype">Archétype</Label>
                <Input
                  id="char-archetype"
                  value={archetype}
                  onChange={(e) => setArchetype(e.target.value)}
                  placeholder="mentor, exilé, héritière…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="char-traits">Traits (séparés par virgule)</Label>
                <Input
                  id="char-traits"
                  value={traitsRaw}
                  onChange={(e) => setTraitsRaw(e.target.value)}
                  placeholder="calme, rancunier, érudit"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="char-bio">Biographie</Label>
                <Textarea
                  id="char-bio"
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  placeholder="Histoire, motivations, secret…"
                  rows={5}
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
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Personnages
        </h2>
        {entitiesQuery.isPending && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}
        {entitiesQuery.isError && (
          <p className="text-sm text-destructive" role="alert">
            Erreur : {String(entitiesQuery.error)}
          </p>
        )}
        {entitiesQuery.data && entitiesQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Aucun personnage encore. Crée le premier ↑
          </p>
        )}
        {entitiesQuery.data && entitiesQuery.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {entitiesQuery.data.map((e) => (
              <Card key={e.id} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle>
                    <Link
                      to={`/u/${universeId}/e/${e.id}`}
                      className="hover:underline flex items-center gap-2"
                    >
                      <User
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                      {e.name}
                    </Link>
                  </CardTitle>
                  {e.summary && <CardDescription>{e.summary}</CardDescription>}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Créé le{" "}
                  {new Date(e.created_at).toLocaleDateString("fr-FR")}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
