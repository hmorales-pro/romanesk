/**
 * Vue graphe d'un univers en mode nébuleux (P7.7).
 *
 * Refonte visuelle d'un layout workflow (xyflow par défaut) vers un
 * visuel nébuleux/organique :
 * - Layout : force-directed simple maison (Coulomb répulsion +
 *   ressorts d'arête + centripète), itéré ~300 fois avant render. Pas
 *   de nouvelle dep — c'est ~30 lignes en O(n²) qui suffit pour
 *   les univers < 200 nœuds.
 * - Nœuds : cercles colorés selon EntityType, halo flou (filter blur
 *   en SVG), label en dessous. Custom node component xyflow.
 * - Arêtes : bezier semi-transparentes avec couleur qui se fond dans
 *   le fond.
 * - Fond : dégradé radial sombre (nuit étoilée) avec dots subtils.
 *
 * xyflow reste pour l'interaction (zoom, pan, drag, click) mais le
 * layout initial est calculé manuellement.
 */

import { useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  entityListInUniverse,
  relationListInUniverse,
  universeGet,
} from "@/lib/api";
import {
  type Entity,
  type EntityType,
  type Relation,
  isSymmetric,
  relationTypeLabel,
} from "@/lib/types";

interface NebulaNodeData extends Record<string, unknown> {
  label: string;
  kind: EntityType;
}

export default function GraphPage() {
  const { universeId } = useParams<{ universeId: string }>();
  const navigate = useNavigate();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const entitiesQuery = useQuery({
    queryKey: ["entities", universeId, "all"],
    queryFn: () => entityListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const relationsQuery = useQuery({
    queryKey: ["relations-in-universe", universeId],
    queryFn: () => relationListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const { nodes, edges } = useMemo(() => {
    const ents = entitiesQuery.data ?? [];
    const rels = relationsQuery.data ?? [];
    return buildGraph(ents, rels);
  }, [entitiesQuery.data, relationsQuery.data]);

  const onNodeClick: NodeMouseHandler<Node> = (_, node) => {
    if (universeId) {
      navigate(`/u/${universeId}/e/${node.id}`);
    }
  };

  if (!universeId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <p className="text-destructive" role="alert">
          Univers introuvable (id manquant).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)]">
      <div className="container mx-auto px-6 py-4 flex items-center gap-3 border-b border-border">
        <Link
          to={`/u/${universeId}`}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3.5" aria-hidden />{" "}
          {universeQuery.data?.name ?? "Univers"}
        </Link>
        <span className="text-sm text-muted-foreground">·</span>
        <h1 className="text-sm font-medium">Graphe nébuleux</h1>
        <span className="text-xs text-muted-foreground ml-auto">
          {nodes.length} nœud{nodes.length > 1 ? "s" : ""} ·{" "}
          {edges.length} relation{edges.length > 1 ? "s" : ""}
        </span>
      </div>

      <div
        className="flex-1 relative"
        style={{
          background:
            "radial-gradient(ellipse at center, #1a1238 0%, #0c0a1f 70%, #050414 100%)",
        }}
      >
        {/* Voile lumineux subtil pour l'effet nébuleux. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 40% 30% at 30% 40%, rgba(99,102,241,0.12) 0%, transparent 70%), radial-gradient(ellipse 30% 25% at 70% 60%, rgba(236,72,153,0.10) 0%, transparent 70%)",
          }}
        />

        {entitiesQuery.isPending || relationsQuery.isPending ? (
          <p className="text-sm text-muted-foreground/80 p-6">Chargement…</p>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground/80 italic max-w-md text-center px-6">
              Pas encore d'entités dans cet univers. Crée des Personnages et
              des Lieux depuis la page univers, puis ajoute des relations
              entre eux pour voir la nébuleuse prendre forme.
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES_REGISTRY}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            nodesDraggable
            nodesConnectable={false}
            edgesFocusable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={32}
              size={1}
              color="rgba(255,255,255,0.08)"
            />
            <Controls
              showInteractive={false}
              className="!bg-white/5 !border-white/10 [&_button]:!bg-white/5 [&_button]:!border-white/10 [&_button]:!text-white/80"
            />
            <MiniMap
              nodeColor={(n) => entityTypeColor(n.data?.kind as EntityType)}
              maskColor="rgba(0,0,0,0.6)"
              style={{
                background: "rgba(12, 10, 31, 0.85)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              pannable
              zoomable
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom node component — pastille colorée avec halo flou
// ---------------------------------------------------------------------------

// Map node-type → component, fournie à ReactFlow. Définie après le
// composant pour éviter le "used before declaration" et stable par
// référence pour ne pas re-monter les nœuds à chaque render parent.
const NebulaNode = memo(function NebulaNode({ data }: NodeProps<Node<NebulaNodeData>>) {
  const color = entityTypeColor(data.kind);
  return (
    <div className="flex flex-col items-center pointer-events-auto">
      {/* Handles invisibles — requis pour que xyflow positionne les arêtes. */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: "none" }}
      />

      {/* Halo flou en backdrop. */}
      <div
        aria-hidden
        className="absolute size-12 rounded-full -z-10"
        style={{
          background: color,
          filter: "blur(16px)",
          opacity: 0.55,
        }}
      />
      {/* Pastille principale. */}
      <div
        className="size-7 rounded-full ring-1 ring-white/20 shadow-lg"
        style={{
          background: color,
          boxShadow: `0 0 18px ${color}66`,
        }}
      />
      {/* Label sous la pastille. */}
      <div
        className="mt-1.5 text-xs px-2 py-0.5 rounded-md whitespace-nowrap"
        style={{
          background: "rgba(0,0,0,0.4)",
          color: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(255,255,255,0.08)",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        {data.label}
      </div>
    </div>
  );
});

const NODE_TYPES_REGISTRY = { nebula: NebulaNode };

// ---------------------------------------------------------------------------
// Conversion entities/relations → nodes/edges + force layout
// ---------------------------------------------------------------------------

function buildGraph(entities: Entity[], relations: Relation[]) {
  // 1) Layout force-directed maison (~300 itérations).
  const positions = forceLayout(entities, relations);

  const nodes: Node<NebulaNodeData>[] = entities.map((e) => ({
    id: e.id,
    type: "nebula",
    position: positions[e.id] ?? { x: 0, y: 0 },
    data: {
      label: e.name,
      kind: e.type,
    },
    // Tailwind-free pour rester contrôlable depuis le composant.
    style: { background: "transparent", border: "none", padding: 0 },
  }));

  const edges: Edge[] = relations.map((r) => {
    const symmetric = isSymmetric(r.type);
    return {
      id: r.id,
      source: r.source_id,
      target: r.target_id,
      label: relationTypeLabel(r.type, "active"),
      type: "default",
      animated: false,
      markerEnd: symmetric ? undefined : { type: "arrowclosed" as const },
      style: {
        stroke: "rgba(180, 160, 220, 0.35)",
        strokeWidth: 1,
      },
      labelStyle: {
        fontSize: 10,
        fill: "rgba(220, 215, 240, 0.7)",
      },
      labelBgStyle: {
        fill: "rgba(20, 18, 45, 0.7)",
      },
      labelBgPadding: [3, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes, edges };
}

/**
 * Mini force-directed layout en O(n² × iterations).
 *
 * - Répulsion de Coulomb entre toutes les paires de nœuds.
 * - Force attractive de ressort le long de chaque arête.
 * - Force centripète douce vers (0, 0) pour éviter la dérive.
 *
 * Suffisant pour < 200 nœuds. Les positions sont déterministes
 * (seed sur les indices, pas de random) — l'utilisateur peut ensuite
 * dragger les nœuds librement via xyflow.
 */
function forceLayout(
  entities: Entity[],
  relations: Relation[],
): Record<string, { x: number; y: number }> {
  const n = entities.length;
  if (n === 0) return {};

  // Init en cercle pour avoir un layout déterministe et bien réparti.
  const positions: { id: string; x: number; y: number }[] = entities.map((e, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = 200 + n * 8;
    return {
      id: e.id,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
    };
  });
  const idx = new Map(positions.map((p, i) => [p.id, i]));

  // Paramètres de simulation, tunés à la main pour Romanesk.
  const REPULSION = 8000;
  const SPRING_LENGTH = 180;
  const SPRING_K = 0.04;
  const CENTER_K = 0.005;
  const DAMPING = 0.85;
  const ITERATIONS = 300;

  const velocities: { vx: number; vy: number }[] = positions.map(() => ({
    vx: 0,
    vy: 0,
  }));

  const edgePairs: [number, number][] = [];
  for (const r of relations) {
    const s = idx.get(r.source_id);
    const t = idx.get(r.target_id);
    if (s != null && t != null) edgePairs.push([s, t]);
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Reset forces.
    const fx = new Array(n).fill(0);
    const fy = new Array(n).fill(0);

    // Répulsion entre toutes les paires.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const force = REPULSION / dist2;
        const dist = Math.sqrt(dist2);
        const fxi = (dx / dist) * force;
        const fyi = (dy / dist) * force;
        fx[i] += fxi;
        fy[i] += fyi;
        fx[j] -= fxi;
        fy[j] -= fyi;
      }
    }

    // Ressorts d'arêtes.
    for (const [a, b] of edgePairs) {
      const dx = positions[b].x - positions[a].x;
      const dy = positions[b].y - positions[a].y;
      const dist = Math.sqrt(dx * dx + dy * dy + 0.01);
      const stretch = dist - SPRING_LENGTH;
      const force = SPRING_K * stretch;
      const fxi = (dx / dist) * force;
      const fyi = (dy / dist) * force;
      fx[a] += fxi;
      fy[a] += fyi;
      fx[b] -= fxi;
      fy[b] -= fyi;
    }

    // Centripète douce.
    for (let i = 0; i < n; i++) {
      fx[i] -= positions[i].x * CENTER_K;
      fy[i] -= positions[i].y * CENTER_K;
    }

    // Intégration + damping.
    for (let i = 0; i < n; i++) {
      velocities[i].vx = (velocities[i].vx + fx[i]) * DAMPING;
      velocities[i].vy = (velocities[i].vy + fy[i]) * DAMPING;
      positions[i].x += velocities[i].vx;
      positions[i].y += velocities[i].vy;
    }
  }

  const out: Record<string, { x: number; y: number }> = {};
  for (const p of positions) {
    out[p.id] = { x: p.x, y: p.y };
  }
  return out;
}

function entityTypeColor(kind: EntityType | undefined): string {
  switch (kind) {
    case "Character":
      return "#818cf8"; // indigo light (visible sur fond sombre)
    case "Location":
      return "#34d399"; // emerald light
    case "Faction":
      return "#fbbf24"; // amber light
    case "Object":
      return "#c084fc"; // violet light
    case "Concept":
      return "#22d3ee"; // cyan light
    case "RealEntity":
      return "#94a3b8"; // slate light
    default:
      return "#94a3b8";
  }
}
