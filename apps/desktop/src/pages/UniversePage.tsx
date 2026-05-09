import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Anchor, BookOpen, MapPin, Network, Pencil, Plus, Search, Sparkles, User } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { usePageMeta } from "@/components/PageMeta";

import {
  aiGenerateEntityDraft,
  characterCreate,
  conceptCreate,
  entityListInUniverse,
  factionCreate,
  locationCreate,
  objectCreate,
  tagAssociationsInUniverse,
  tagListInUniverse,
  universeGet,
  universeUpdate,
} from "@/lib/api";
import { TagChip } from "@/components/TagsSection";
import { TimelineSection } from "@/components/TimelineSection";
import { RagChatPanel } from "@/components/RagChatPanel";
import { StoriesSection } from "@/components/StoriesSection";
import { SimpleEntitySection } from "@/components/SimpleEntitySection";
import { BrainstormPanel } from "@/components/BrainstormPanel";
import { Package, Users } from "lucide-react";
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
import {
  CONCEPT_KINDS,
  conceptContent,
  conceptKindLabel,
  type Entity,
  FACTION_KINDS,
  factionContent,
  factionKindLabel,
  type LocationKind,
  locationKindLabel,
  OBJECT_KINDS,
  objectContent,
  objectKindLabel,
} from "@/lib/types";

export default function UniversePage() {
  const { universeId } = useParams<{ universeId: string }>();
  const qc = useQueryClient();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const charactersQuery = useQuery({
    queryKey: ["entities", universeId, "Character"],
    queryFn: () => entityListInUniverse(universeId!, "Character"),
    enabled: !!universeId,
  });

  const locationsQuery = useQuery({
    queryKey: ["entities", universeId, "Location"],
    queryFn: () => entityListInUniverse(universeId!, "Location"),
    enabled: !!universeId,
  });

  const factionsQuery = useQuery({
    queryKey: ["entities", universeId, "Faction"],
    queryFn: () => entityListInUniverse(universeId!, "Faction"),
    enabled: !!universeId,
  });

  const objectsQuery = useQuery({
    queryKey: ["entities", universeId, "Object"],
    queryFn: () => entityListInUniverse(universeId!, "Object"),
    enabled: !!universeId,
  });

  const conceptsQuery = useQuery({
    queryKey: ["entities", universeId, "Concept"],
    queryFn: () => entityListInUniverse(universeId!, "Concept"),
    enabled: !!universeId,
  });

  const tagsQuery = useQuery({
    queryKey: ["universe-tags", universeId],
    queryFn: () => tagListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const associationsQuery = useQuery({
    queryKey: ["tag-associations", universeId],
    queryFn: () => tagAssociationsInUniverse(universeId!),
    enabled: !!universeId,
  });

  // Filtres : recherche par nom + tags actifs (intersection : entité doit avoir TOUS les tags sélectionnés).
  const [search, setSearch] = useState("");
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());

  const tagsByEntity = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (associationsQuery.data ?? []).forEach((a) => {
      if (!m.has(a.entityId)) m.set(a.entityId, new Set());
      m.get(a.entityId)!.add(a.tagId);
    });
    return m;
  }, [associationsQuery.data]);

  const matchesFilters = (e: { id: string; name: string }) => {
    if (search.trim()) {
      if (!e.name.toLowerCase().includes(search.toLowerCase().trim())) return false;
    }
    if (activeTagIds.size > 0) {
      const tags = tagsByEntity.get(e.id) ?? new Set();
      for (const tid of activeTagIds) {
        if (!tags.has(tid)) return false;
      }
    }
    return true;
  };

  const filteredCharacters = (charactersQuery.data ?? []).filter(matchesFilters);
  const filteredLocations = (locationsQuery.data ?? []).filter(matchesFilters);
  const filteredFactions = (factionsQuery.data ?? []).filter(matchesFilters);
  const filteredObjects = (objectsQuery.data ?? []).filter(matchesFilters);
  const filteredConcepts = (conceptsQuery.data ?? []).filter(matchesFilters);

  if (!universeId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <p className="text-destructive" role="alert">
          Univers introuvable (id manquant dans l'URL).
        </p>
      </div>
    );
  }

  // P8.3 — alimente la titlebar éditoriale.
  const totalEntities =
    (charactersQuery.data?.length ?? 0) +
    (locationsQuery.data?.length ?? 0) +
    (factionsQuery.data?.length ?? 0) +
    (objectsQuery.data?.length ?? 0) +
    (conceptsQuery.data?.length ?? 0);
  const universeSlug =
    universeQuery.data?.name.toLowerCase().replace(/\s+/g, "") ?? "univers";
  usePageMeta({
    breadcrumb: universeQuery.data
      ? `${universeSlug}.romanesk · univers`
      : "Romanesk · univers",
    meta: universeQuery.data
      ? `${totalEntities} fiches`
      : null,
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-4">
      {/* Cartouche éditorial — Eyebrow méta + nom Cormorant + actions */}
      <header className="flex flex-col gap-4 rounded-[4px] border border-rule bg-paper-deep p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Eyebrow>Univers · {totalEntities} fiches</Eyebrow>
          {universeQuery.isPending && (
            <p className="font-body text-sm italic text-ink-faint">
              Chargement…
            </p>
          )}
          {universeQuery.data && (
            <>
              <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.014em] text-ink">
                {universeQuery.data.name}
              </h1>
              {universeQuery.data.description && (
                <p className="max-w-[36em] font-body text-[15px] italic leading-[1.55] text-ink-soft">
                  {universeQuery.data.description}
                </p>
              )}
            </>
          )}
          {universeQuery.data === null && (
            <p className="font-body italic text-bordeaux" role="alert">
              Cet univers n'existe pas (ou a été supprimé).
            </p>
          )}
        </div>
        {universeQuery.data && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                document
                  .getElementById("stories")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              title="Aller à la section Histoires"
            >
              <BookOpen className="size-4" aria-hidden /> Écrire
            </Button>
            <UniverseEditButton
              universe={universeQuery.data}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ["universe", universeId] })
              }
            />
            <Link to={`/u/${universeId}/anchor`}>
              <Button variant="outline" size="sm">
                <Anchor className="size-4" aria-hidden /> Ancrage
              </Button>
            </Link>
            <Link to={`/u/${universeId}/graph`}>
              <Button variant="outline" size="sm">
                <Network className="size-4" aria-hidden /> Voir le graphe
              </Button>
            </Link>
          </div>
        )}
      </header>

      {/* Barre de filtres : recherche par nom + multi-select de tags */}
      <Card>
        <CardContent className="pt-6 flex flex-col gap-3">
          <div className="relative">
            <Search
              className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom…"
              className="pl-9"
            />
          </div>
          {(tagsQuery.data ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Filtrer par tag :</span>
              {(tagsQuery.data ?? []).map((t) => {
                const active = activeTagIds.has(t.id);
                return (
                  <TagChip
                    key={t.id}
                    tag={t}
                    active={active}
                    onClick={() => {
                      const next = new Set(activeTagIds);
                      if (active) next.delete(t.id);
                      else next.add(t.id);
                      setActiveTagIds(next);
                    }}
                  />
                );
              })}
              {activeTagIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTagIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
                >
                  effacer
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* P11.x — Histoires en haut. L'écriture des chapitres est plus
       * fréquente que la création de fiches, on remonte le raccourci. */}
      <div id="stories" className="scroll-mt-6">
        <StoriesSection universeId={universeId!} />
      </div>

      <CharacterSection
        universeId={universeId}
        items={filteredCharacters}
        loading={charactersQuery.isPending}
        error={charactersQuery.error}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["entities", universeId, "Character"] })
        }
      />

      <LocationSection
        universeId={universeId}
        items={filteredLocations}
        loading={locationsQuery.isPending}
        error={locationsQuery.error}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["entities", universeId, "Location"] })
        }
      />

      <SimpleEntitySection
        title="Factions"
        createLabel="Faction"
        icon={<Users className="size-4" aria-hidden />}
        universeId={universeId}
        items={filteredFactions}
        loading={factionsQuery.isPending}
        error={factionsQuery.error}
        kinds={FACTION_KINDS.map((k) => ({ value: k, label: factionKindLabel(k) }))}
        defaultKind="other"
        onCreate={({ name, kind }) =>
          factionCreate({ universeId, name, kind })
        }
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["entities", universeId, "Faction"] })
        }
        getKind={(e) => factionContent(e).kind}
        kindLabel={factionKindLabel}
      />

      <SimpleEntitySection
        title="Objets"
        createLabel="Objet"
        icon={<Package className="size-4" aria-hidden />}
        universeId={universeId}
        items={filteredObjects}
        loading={objectsQuery.isPending}
        error={objectsQuery.error}
        kinds={OBJECT_KINDS.map((k) => ({ value: k, label: objectKindLabel(k) }))}
        defaultKind="other"
        onCreate={({ name, kind }) =>
          objectCreate({ universeId, name, kind })
        }
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["entities", universeId, "Object"] })
        }
        getKind={(e) => objectContent(e).kind}
        kindLabel={objectKindLabel}
      />

      <SimpleEntitySection
        title="Concepts"
        createLabel="Concept"
        icon={<Sparkles className="size-4" aria-hidden />}
        universeId={universeId}
        items={filteredConcepts}
        loading={conceptsQuery.isPending}
        error={conceptsQuery.error}
        kinds={CONCEPT_KINDS.map((k) => ({ value: k, label: conceptKindLabel(k) }))}
        defaultKind="other"
        onCreate={({ name, kind }) =>
          conceptCreate({ universeId, name, kind })
        }
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["entities", universeId, "Concept"] })
        }
        getKind={(e) => conceptContent(e).kind}
        kindLabel={conceptKindLabel}
      />

      <TimelineSection universeId={universeId} />

      <BrainstormPanel universeId={universeId!} />

      <RagChatPanel universeId={universeId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Édition d'univers — bouton + modale (P10.1)
// ---------------------------------------------------------------------------

interface UniverseEditButtonProps {
  universe: { id: string; name: string; description: string | null };
  onSaved: () => void;
}

function UniverseEditButton({ universe, onSaved }: UniverseEditButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(universe.name);
  const [description, setDescription] = useState(universe.description ?? "");
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Resync depuis la prop si l'univers est rechargé.
  useEffect(() => {
    setName(universe.name);
    setDescription(universe.description ?? "");
  }, [universe.id, universe.name, universe.description]);

  // showModal/close + ESC = cancel
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
    const cancel = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    dlg.addEventListener("cancel", cancel);
    return () => dlg.removeEventListener("cancel", cancel);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      universeUpdate({
        id: universe.id,
        name: name.trim(),
        description,
      }),
    onSuccess: () => {
      onSaved();
      setOpen(false);
    },
  });

  const dirty =
    name.trim() !== universe.name ||
    (description.trim() || "") !== (universe.description ?? "");

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        title="Modifier le nom et la description"
      >
        <Pencil className="size-4" aria-hidden /> Modifier
      </Button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className={[
          "min-w-[420px] max-w-[520px] rounded-[4px] border border-rule bg-paper p-0 text-ink",
          "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]",
          "m-auto",
          "backdrop:bg-[color-mix(in_oklab,var(--ink)_35%,transparent)]",
        ].join(" ")}
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !dirty || mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <Eyebrow>Univers · édition</Eyebrow>
          <h2 className="font-display text-[22px] font-medium leading-[1.1] tracking-[-0.014em] text-ink">
            Modifier l'univers
          </h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-univ-name">Nom *</Label>
            <Input
              id="edit-univ-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-univ-desc">Description</Label>
            <Textarea
              id="edit-univ-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Une phrase pour situer le ton, l'époque, l'enjeu…"
              rows={4}
            />
            <p className="font-body text-[12px] italic text-ink-faint">
              Laisser vide pour effacer la description.
            </p>
          </div>
          {mutation.isError && (
            <p className="font-body text-[13px] italic text-bordeaux">
              {String(mutation.error)}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || !dirty || mutation.isPending}
            >
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Personnages
// ---------------------------------------------------------------------------

interface SectionProps {
  universeId: string;
  items: Entity[];
  loading: boolean;
  error: unknown;
  onCreated: () => void;
}

function CharacterSection({ universeId, items, loading, error, onCreated }: SectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("");
  const [traitsRaw, setTraitsRaw] = useState("");
  const [biography, setBiography] = useState("");
  const [aiHint, setAiHint] = useState("");

  const createMutation = useMutation({
    mutationFn: characterCreate,
    onSuccess: () => {
      onCreated();
      setName("");
      setArchetype("");
      setTraitsRaw("");
      setBiography("");
      setAiHint("");
      setShowForm(false);
    },
  });

  const draftMutation = useMutation({
    mutationFn: aiGenerateEntityDraft,
    onSuccess: (draft) => {
      if (draft.name) setName(draft.name);
      if (draft.archetype) setArchetype(draft.archetype);
      if (draft.traits && draft.traits.length > 0) setTraitsRaw(draft.traits.join(", "));
      if (draft.biographyText) setBiography(draft.biographyText);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const traits = traitsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    createMutation.mutate({
      universeId,
      name: name.trim(),
      archetype: archetype.trim() || undefined,
      traits,
      biography: biography.trim() || undefined,
    });
  };

  const onGenerate = () => {
    if (!name.trim()) return;
    draftMutation.mutate({
      universeId,
      kind: "Character",
      name: name.trim(),
      hint: aiHint.trim() || undefined,
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Personnages
        </h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" aria-hidden /> Personnage
          </Button>
        )}
      </div>

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

              {/* Bloc IA */}
              <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-3">
                <Label htmlFor="char-ai-hint" className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  Idée / contexte pour l'IA (optionnel)
                </Label>
                <Input
                  id="char-ai-hint"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  placeholder="ex. mentor exilé, traumatisé par la guerre, secret enfoui"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onGenerate}
                  disabled={draftMutation.isPending || !name.trim()}
                  className="self-start"
                >
                  {draftMutation.isPending
                    ? "Génération…"
                    : "Générer avec IA (remplit les champs)"}
                </Button>
                {draftMutation.isError && (
                  <p className="text-xs text-destructive" role="alert">
                    Erreur IA : {String(draftMutation.error)}
                  </p>
                )}
                {draftMutation.data?.parseWarning && (
                  <p className="text-xs text-amber-700" role="alert">
                    {draftMutation.data.parseWarning}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
                  {createMutation.isPending ? "Création…" : "Créer"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
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

      <EntityList
        items={items}
        loading={loading}
        error={error}
        universeId={universeId}
        emptyLabel="Aucun personnage encore. Crée le premier ↑"
        renderIcon={() => <User className="size-4 text-muted-foreground" aria-hidden />}
        renderMeta={() => null}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------

const LOCATION_KINDS: LocationKind[] = [
  "city",
  "region",
  "building",
  "naturalFeature",
  "celestial",
  "other",
];

function LocationSection({ universeId, items, loading, error, onCreated }: SectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LocationKind>("city");
  const [climate, setClimate] = useState("");
  const [population, setPopulation] = useState("");
  const [summary, setSummary] = useState("");
  const [aiHint, setAiHint] = useState("");

  const createMutation = useMutation({
    mutationFn: locationCreate,
    onSuccess: () => {
      onCreated();
      setName("");
      setKind("city");
      setClimate("");
      setPopulation("");
      setSummary("");
      setAiHint("");
      setShowForm(false);
    },
  });

  const draftMutation = useMutation({
    mutationFn: aiGenerateEntityDraft,
    onSuccess: (draft) => {
      if (draft.name) setName(draft.name);
      if (draft.summary) setSummary(draft.summary);
      if (draft.locationKind && LOCATION_KINDS.includes(draft.locationKind as LocationKind)) {
        setKind(draft.locationKind as LocationKind);
      }
      if (draft.climate) setClimate(draft.climate);
      if (draft.population) setPopulation(draft.population);
      // descriptionText : pas encore de champ description dans ce form (on le
      // remplira sur la page détail). Le draft est dans rawResponse pour debug.
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      universeId,
      name: name.trim(),
      summary: summary.trim() || undefined,
      kind,
      climate: climate.trim() || undefined,
      population: population.trim() || undefined,
    });
  };

  const onGenerate = () => {
    if (!name.trim()) return;
    draftMutation.mutate({
      universeId,
      kind: "Location",
      name: name.trim(),
      hint: aiHint.trim() || undefined,
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Lieux
        </h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" aria-hidden /> Lieu
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau lieu</CardTitle>
            <CardDescription>
              Description longue et relations (qui y vit, qui y a régné…) viendront sur la fiche.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="loc-name">Nom *</Label>
                  <Input
                    id="loc-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bren, Forêt d'Iren, Cité de Verre…"
                    autoFocus
                    required
                    maxLength={120}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="loc-kind">Type</Label>
                  <select
                    id="loc-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as LocationKind)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {LOCATION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {locationKindLabel(k)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-summary">Résumé court</Label>
                <Input
                  id="loc-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Une phrase pour situer le lieu."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="loc-climate">Climat</Label>
                  <Input
                    id="loc-climate"
                    value={climate}
                    onChange={(e) => setClimate(e.target.value)}
                    placeholder="tempéré, polaire, brumeux…"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="loc-population">Population / peuples</Label>
                  <Input
                    id="loc-population"
                    value={population}
                    onChange={(e) => setPopulation(e.target.value)}
                    placeholder="humains, elfes, ~30 000 hab.…"
                  />
                </div>
              </div>

              {/* Bloc IA */}
              <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-3">
                <Label htmlFor="loc-ai-hint" className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  Idée / contexte pour l'IA (optionnel)
                </Label>
                <Input
                  id="loc-ai-hint"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  placeholder="ex. cité portuaire en ruine, peuplée d'oubliés"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onGenerate}
                  disabled={draftMutation.isPending || !name.trim()}
                  className="self-start"
                >
                  {draftMutation.isPending
                    ? "Génération…"
                    : "Générer avec IA (remplit les champs)"}
                </Button>
                {draftMutation.isError && (
                  <p className="text-xs text-destructive" role="alert">
                    Erreur IA : {String(draftMutation.error)}
                  </p>
                )}
                {draftMutation.data?.parseWarning && (
                  <p className="text-xs text-amber-700" role="alert">
                    {draftMutation.data.parseWarning}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending || !name.trim()}>
                  {createMutation.isPending ? "Création…" : "Créer"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
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

      <EntityList
        items={items}
        loading={loading}
        error={error}
        universeId={universeId}
        emptyLabel="Aucun lieu encore. Crée le premier ↑"
        renderIcon={() => <MapPin className="size-4 text-muted-foreground" aria-hidden />}
        renderMeta={(e) => {
          const k =
            typeof (e.content as { kind?: unknown }).kind === "string"
              ? ((e.content as { kind: LocationKind }).kind)
              : null;
          return k ? <span>{locationKindLabel(k)}</span> : null;
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Liste partagée
// ---------------------------------------------------------------------------

interface EntityListProps {
  items: Entity[];
  loading: boolean;
  error: unknown;
  universeId: string;
  emptyLabel: string;
  renderIcon: () => React.ReactNode;
  renderMeta: (entity: Entity) => React.ReactNode;
}

function EntityList({
  items,
  loading,
  error,
  universeId,
  emptyLabel,
  renderIcon,
  renderMeta,
}: EntityListProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Erreur : {String(error)}
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((e) => {
        const meta = renderMeta(e);
        return (
          <Card key={e.id} className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle>
                <Link
                  to={`/u/${universeId}/e/${e.id}`}
                  className="hover:underline flex items-center gap-2"
                >
                  {renderIcon()}
                  {e.name}
                </Link>
              </CardTitle>
              {e.summary && <CardDescription>{e.summary}</CardDescription>}
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {meta}
                {meta && " · "}
                Créé le {new Date(e.created_at).toLocaleDateString("fr-FR")}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
