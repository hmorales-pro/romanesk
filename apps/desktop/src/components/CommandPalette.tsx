/**
 * Palette de commandes Cmd+K (P11.1).
 *
 * Modale Romanesk déclenchée par Cmd+K (macOS) ou Ctrl+K (Windows/Linux).
 * Recherche fuzzy unifiée dans :
 *   - Univers (LibraryPage de chaque)
 *   - Fiches/entités (toutes types confondus, dans tous les univers chargés)
 *   - Histoires
 *
 * Plus une section ACTIONS avec :
 *   - Créer un univers (ouvre LibraryPage)
 *   - Créer une fiche dans l'univers courant (si on en a un)
 *   - Ouvrir Paramètres
 *   - Importer un écrit
 *
 * Navigation : ↑↓ pour scroller, ↵ pour activer, ESC pour fermer.
 *
 * Pas d'index lourd — on récupère univers + entités + stories à
 * l'ouverture via react-query (deps ouvertes via Promise.all). Le filtre
 * fuzzy est local, instantané.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  Anchor,
  BookOpen,
  Compass,
  FileUp,
  Network,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";

import {
  entityListInUniverse,
  storyListInUniverse,
  universeList,
} from "@/lib/api";
import type { Entity, Story, Universe } from "@/lib/types";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Glyph, glyphKindFromEntityKind } from "@/components/ui/glyph";
import { Kbd } from "@/components/ui/kbd";

// ---------------------------------------------------------------------------
// Types unifiés
// ---------------------------------------------------------------------------

type Item =
  | {
      kind: "universe";
      id: string;
      name: string;
      description: string | null;
      route: string;
    }
  | {
      kind: "entity";
      id: string;
      name: string;
      type: string;
      universeId: string;
      universeName: string;
      route: string;
    }
  | {
      kind: "story";
      id: string;
      title: string;
      universeId: string;
      universeName: string;
      route: string;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      hint?: string;
      icon: React.ReactNode;
      route: string;
    };

// ---------------------------------------------------------------------------
// Hook : raccourci global Cmd/Ctrl+K
// ---------------------------------------------------------------------------

function useCommandPaletteShortcut(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);
}

// ---------------------------------------------------------------------------
// Normalisation pour fuzzy matching
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function matches(query: string, text: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return normalize(text).includes(q);
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const navigate = useNavigate();
  const params = useParams<{ universeId?: string }>();
  const currentUniverseId = params.universeId ?? null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useCommandPaletteShortcut(() => setOpen(true));

  // Univers : toujours chargés.
  const universesQuery = useQuery({
    queryKey: ["universes"],
    queryFn: universeList,
    enabled: open,
  });

  // Pour chaque univers, on charge les entities + stories en parallèle.
  // useQueries serait plus propre mais on peut faire avec un seul useQuery
  // qui fan-out. On le déclenche seulement à l'ouverture de la palette.
  const indexQuery = useQuery({
    queryKey: ["palette-index", universesQuery.data?.map((u) => u.id) ?? []],
    queryFn: async () => {
      if (!universesQuery.data) return { entities: [], stories: [] };
      const results = await Promise.all(
        universesQuery.data.map(async (u) => {
          const [entities, stories] = await Promise.all([
            entityListInUniverse(u.id),
            storyListInUniverse(u.id),
          ]);
          return { universe: u, entities, stories };
        }),
      );
      const allEntities: { entity: Entity; universe: Universe }[] = [];
      const allStories: { story: Story; universe: Universe }[] = [];
      for (const r of results) {
        for (const e of r.entities) {
          allEntities.push({ entity: e, universe: r.universe });
        }
        for (const s of r.stories) {
          allStories.push({ story: s, universe: r.universe });
        }
      }
      return { entities: allEntities, stories: allStories };
    },
    enabled: open && !!universesQuery.data,
  });

  // Items unifiés filtrés par la query.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // ACTIONS — toujours en haut, contextuelles si univers courant.
    const actions: Item[] = [
      {
        kind: "action",
        id: "act:library",
        label: "Aller à la bibliothèque",
        hint: "tous les univers",
        icon: <Compass className="size-4" aria-hidden />,
        route: "/",
      },
      {
        kind: "action",
        id: "act:settings",
        label: "Ouvrir les paramètres",
        hint: "Ollama, modèles",
        icon: <SettingsIcon className="size-4" aria-hidden />,
        route: "/settings",
      },
      {
        kind: "action",
        id: "act:import",
        label: "Importer un écrit",
        hint: ".docx, .pdf, .md",
        icon: <FileUp className="size-4" aria-hidden />,
        route: "/import",
      },
    ];
    if (currentUniverseId) {
      actions.push(
        {
          kind: "action",
          id: "act:graph",
          label: "Voir le graphe nébuleux",
          hint: "univers courant",
          icon: <Network className="size-4" aria-hidden />,
          route: `/u/${currentUniverseId}/graph`,
        },
        {
          kind: "action",
          id: "act:anchor",
          label: "Ouvrir l'ancrage",
          hint: "univers courant",
          icon: <Anchor className="size-4" aria-hidden />,
          route: `/u/${currentUniverseId}/anchor`,
        },
      );
    }

    for (const a of actions) {
      if (a.kind !== "action") continue; // narrow pour TS
      if (matches(query, a.label) || matches(query, a.hint ?? "")) {
        out.push(a);
      }
    }

    // UNIVERS
    for (const u of universesQuery.data ?? []) {
      if (matches(query, u.name) || matches(query, u.description ?? "")) {
        out.push({
          kind: "universe",
          id: u.id,
          name: u.name,
          description: u.description,
          route: `/u/${u.id}`,
        });
      }
    }

    // FICHES
    for (const { entity, universe } of indexQuery.data?.entities ?? []) {
      if (matches(query, entity.name) || matches(query, universe.name)) {
        out.push({
          kind: "entity",
          id: entity.id,
          name: entity.name,
          type: entity.type,
          universeId: universe.id,
          universeName: universe.name,
          route: `/u/${universe.id}/e/${entity.id}`,
        });
      }
    }

    // HISTOIRES
    for (const { story, universe } of indexQuery.data?.stories ?? []) {
      if (matches(query, story.title) || matches(query, universe.name)) {
        out.push({
          kind: "story",
          id: story.id,
          title: story.title,
          universeId: universe.id,
          universeName: universe.name,
          route: `/u/${universe.id}/s/${story.id}`,
        });
      }
    }

    return out;
  }, [query, currentUniverseId, universesQuery.data, indexQuery.data]);

  // Reset l'index actif quand la liste change.
  useEffect(() => {
    setActiveIdx(0);
  }, [query, items.length]);

  // Show/close du <dialog>
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      // Focus l'input dès que la modale est ouverte.
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);

  // Reset query/index à chaque fermeture pour un état propre.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // ESC = close
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    dlg.addEventListener("cancel", handler);
    return () => dlg.removeEventListener("cancel", handler);
  }, []);

  const activate = (item: Item) => {
    setOpen(false);
    navigate(item.route);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) activate(item);
    }
  };

  // Scroll automatique vers l'item actif si hors viewport.
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      "[data-active='true']",
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      className={[
        "w-[min(640px,90vw)] max-h-[70vh] overflow-hidden rounded-[4px] border border-rule bg-paper p-0 text-ink",
        "shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--ink)_25%,transparent)]",
        "m-auto",
        "backdrop:bg-[color-mix(in_oklab,var(--ink)_35%,transparent)]",
      ].join(" ")}
    >
      <div className="flex flex-col">
        {/* Saisie */}
        <div className="flex items-center gap-3 border-b border-rule px-5 py-3">
          <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cherche une fiche, une histoire, une action…"
            className="flex-1 border-0 bg-transparent font-body text-[16px] text-ink placeholder:italic placeholder:text-ink-faint focus:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* Liste résultats */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {indexQuery.isPending && open && (
            <p className="px-5 py-3 font-body text-[13px] italic text-ink-faint">
              Indexation…
            </p>
          )}
          {!indexQuery.isPending && items.length === 0 && (
            <p className="px-5 py-3 font-body text-[13px] italic text-ink-faint">
              Rien ne correspond à « {query} ».
            </p>
          )}

          <Section
            title="Actions"
            items={items.filter((i) => i.kind === "action")}
            renderItem={renderItem}
            activeIdx={activeIdx}
            globalIdxOffset={0}
            allItems={items}
            onActivate={activate}
          />
          <Section
            title="Univers"
            items={items.filter((i) => i.kind === "universe")}
            renderItem={renderItem}
            activeIdx={activeIdx}
            globalIdxOffset={0}
            allItems={items}
            onActivate={activate}
          />
          <Section
            title="Fiches"
            items={items.filter((i) => i.kind === "entity")}
            renderItem={renderItem}
            activeIdx={activeIdx}
            globalIdxOffset={0}
            allItems={items}
            onActivate={activate}
          />
          <Section
            title="Histoires"
            items={items.filter((i) => i.kind === "story")}
            renderItem={renderItem}
            activeIdx={activeIdx}
            globalIdxOffset={0}
            allItems={items}
            onActivate={activate}
          />
        </div>

        {/* Pied — hints clavier */}
        <div className="flex items-center gap-4 border-t border-rule bg-paper-deep px-5 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑↓</Kbd> naviguer
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> ouvrir
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Kbd>⌘K</Kbd> à tout moment
          </span>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Sections + rendu d'item
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  items: Item[];
  renderItem: (
    item: Item,
    isActive: boolean,
    onClick: () => void,
  ) => React.ReactNode;
  activeIdx: number;
  globalIdxOffset: number;
  allItems: Item[];
  onActivate: (item: Item) => void;
}

function Section({
  title,
  items,
  renderItem,
  activeIdx,
  allItems,
  onActivate,
}: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="px-5 pb-1 pt-3">
        <Eyebrow bullet={false}>{title}</Eyebrow>
      </div>
      {items.map((item) => {
        const globalIdx = allItems.indexOf(item);
        const isActive = globalIdx === activeIdx;
        return (
          <div key={item.id} data-active={isActive ? "true" : undefined}>
            {renderItem(item, isActive, () => onActivate(item))}
          </div>
        );
      })}
    </div>
  );
}

function renderItem(
  item: Item,
  isActive: boolean,
  onClick: () => void,
): React.ReactNode {
  const baseClass =
    "flex w-full items-center gap-3 px-5 py-2 text-left transition";
  const stateClass = isActive
    ? "bg-paper-shade text-ink"
    : "text-ink hover:bg-paper-deep";

  if (item.kind === "action") {
    return (
      <button
        type="button"
        className={`${baseClass} ${stateClass}`}
        onClick={onClick}
      >
        <span className="text-ink-soft">{item.icon}</span>
        <span className="flex-1 font-body text-[14px]">{item.label}</span>
        {item.hint && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
            {item.hint}
          </span>
        )}
      </button>
    );
  }

  if (item.kind === "universe") {
    return (
      <button
        type="button"
        className={`${baseClass} ${stateClass}`}
        onClick={onClick}
      >
        <BookOpen className="size-4 text-ink-soft" aria-hidden />
        <span className="flex-1">
          <span className="font-display text-[16px] font-medium tracking-[-0.005em]">
            {item.name}
          </span>
          {item.description && (
            <span className="ml-2 font-body text-[12px] italic text-ink-faint">
              · {item.description}
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          univers
        </span>
      </button>
    );
  }

  if (item.kind === "entity") {
    return (
      <button
        type="button"
        className={`${baseClass} ${stateClass}`}
        onClick={onClick}
      >
        <Glyph kind={glyphKindFromEntityKind(item.type)} />
        <span className="flex-1">
          <span className="font-body text-[14px]">{item.name}</span>
          <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
            {item.universeName}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          {item.type}
        </span>
      </button>
    );
  }

  // story
  return (
    <button
      type="button"
      className={`${baseClass} ${stateClass}`}
      onClick={onClick}
    >
      <BookOpen className="size-4 text-ink-soft" aria-hidden />
      <span className="flex-1">
        <span className="font-body text-[14px]">{item.title}</span>
        <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">
          {item.universeName}
        </span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
        histoire
      </span>
    </button>
  );
}

