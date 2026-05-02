import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
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

/**
 * Vue graphe interactive d'un univers.
 *
 * Phase 1.3 : layout circulaire initial (déterministe, pas besoin de
 * dagre/elkjs en deps), nœuds colorés par EntityType, arcs labelés par
 * type de relation, click sur un nœud → navigation vers la fiche.
 *
 * Phase 1.5+ : layout auto (dagre), zoom-to-fit après load, persistance
 * des positions custom user.
 */
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
          <ArrowLeft className="size-3.5" aria-hidden /> {universeQuery.data?.name ?? "Univers"}
        </Link>
        <span className="text-sm text-muted-foreground">·</span>
        <h1 className="text-sm font-medium">Graphe des relations</h1>
        <span className="text-xs text-muted-foreground ml-auto">
          {nodes.length} nœud{nodes.length > 1 ? "s" : ""} ·{" "}
          {edges.length} relation{edges.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 bg-secondary/20">
        {entitiesQuery.isPending || relationsQuery.isPending ? (
          <p className="text-sm text-muted-foreground p-6">Chargement…</p>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic">
              Pas encore d'entités dans cet univers. Crée des Personnages et
              des Lieux depuis la page univers, puis ajoute des relations
              entre eux pour voir le graphe se remplir.
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitView
            // Désactive le snap-to-grid pour Phase 1, comportement libre.
            nodesDraggable
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => entityTypeColor(n.data?.kind as EntityType)}
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
// Conversion entities/relations → nodes/edges
// ---------------------------------------------------------------------------

function buildGraph(entities: Entity[], relations: Relation[]) {
  const radius = Math.max(150, entities.length * 40);
  const nodes: Node[] = entities.map((e, i) => {
    const angle = (2 * Math.PI * i) / Math.max(entities.length, 1);
    return {
      id: e.id,
      position: {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      },
      data: {
        label: e.name,
        kind: e.type,
      },
      // Style appliqué inline pour la couleur par type. CSS du package
      // gère le reste (bord, padding, font).
      style: {
        background: entityTypeColor(e.type),
        color: "white",
        border: "2px solid rgba(0,0,0,0.2)",
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 500,
      },
    };
  });

  const edges: Edge[] = relations.map((r) => {
    const symmetric = isSymmetric(r.type);
    return {
      id: r.id,
      source: r.source_id,
      target: r.target_id,
      label: relationTypeLabel(r.type, "active"),
      type: "default",
      animated: false,
      // Pour les arcs symétriques, pas de flèche directionnelle.
      // Pour les asymétriques, la flèche par défaut suffit (target).
      markerEnd: symmetric ? undefined : { type: "arrowclosed" as const },
      style: {
        stroke: symmetric ? "#94a3b8" : "#64748b",
        strokeWidth: 1.5,
      },
      labelStyle: {
        fontSize: 11,
        fill: "#475569",
      },
      labelBgStyle: {
        fill: "rgba(255,255,255,0.85)",
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes, edges };
}

function entityTypeColor(kind: EntityType | undefined): string {
  switch (kind) {
    case "Character":
      return "#6366f1"; // indigo
    case "Location":
      return "#10b981"; // emerald
    case "Faction":
      return "#f59e0b"; // amber
    case "Object":
      return "#a855f7"; // violet
    case "Concept":
      return "#06b6d4"; // cyan
    case "RealEntity":
      return "#64748b"; // slate
    default:
      return "#64748b";
  }
}
