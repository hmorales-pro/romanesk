import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import {
  eraListInUniverse,
  eventListInUniverse,
  universeGet,
} from "@/lib/api";
import { type Era, type Event as TimelineEvent, eraYearsLabel } from "@/lib/types";

/**
 * Frise visuelle horizontale d'un univers : bandes colorées par époque,
 * marqueurs ponctuels pour les événements.
 *
 * Phase 2.5 minimaliste : SVG hand-coded, échelle linéaire entre min(year)
 * et max(year), pas de zoom utilisateur. Suffisant pour < 50 événements
 * et 5-10 époques. Phase 3+ : zoom, drag, regroupement, époques imbriquées.
 */
export default function TimelinePage() {
  const { universeId } = useParams<{ universeId: string }>();

  const universeQuery = useQuery({
    queryKey: ["universe", universeId],
    queryFn: () => universeGet(universeId!),
    enabled: !!universeId,
  });

  const erasQuery = useQuery({
    queryKey: ["eras", universeId],
    queryFn: () => eraListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const eventsQuery = useQuery({
    queryKey: ["events", universeId],
    queryFn: () => eventListInUniverse(universeId!),
    enabled: !!universeId,
  });

  const erasById = useMemo(() => {
    const m = new Map<string, Era>();
    (erasQuery.data ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [erasQuery.data]);

  const range = useMemo(
    () => computeRange(erasQuery.data ?? [], eventsQuery.data ?? []),
    [erasQuery.data, eventsQuery.data],
  );

  if (!universeId) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <p className="text-destructive" role="alert">
          Univers introuvable (id manquant).
        </p>
      </div>
    );
  }

  const eras = erasQuery.data ?? [];
  const events = eventsQuery.data ?? [];

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
        <h1 className="text-sm font-medium">Frise temporelle</h1>
        <span className="text-xs text-muted-foreground ml-auto">
          {eras.length} époque{eras.length > 1 ? "s" : ""} ·{" "}
          {events.length} événement{events.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-secondary/20 p-6">
        {erasQuery.isPending || eventsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : eras.length === 0 && events.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic max-w-md text-center">
              Pas encore de timeline. Crée des époques et des événements
              depuis la page univers, puis reviens ici pour voir la frise.
            </p>
          </div>
        ) : !range ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground italic">
              Aucune date renseignée. Ajoute des années sur les époques ou les
              événements pour générer la frise.
            </p>
            {eras.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Époques (sans frise)</h2>
                {eras.map((era) => (
                  <div key={era.id} className="text-sm">
                    <span
                      className="inline-block size-3 rounded-full mr-2 align-middle"
                      style={{ background: era.color ?? "#94a3b8" }}
                      aria-hidden
                    />
                    {era.name} — {eraYearsLabel(era)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <TimelineSvg
            range={range}
            eras={eras}
            events={events}
            erasById={erasById}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calcul des bornes temporelles
// ---------------------------------------------------------------------------

interface YearRange {
  min: number;
  max: number;
}

function computeRange(eras: Era[], events: TimelineEvent[]): YearRange | null {
  const years: number[] = [];
  for (const era of eras) {
    if (era.start_year != null) years.push(era.start_year);
    if (era.end_year != null) years.push(era.end_year);
  }
  for (const ev of events) {
    if (ev.year != null) years.push(ev.year);
  }
  if (years.length === 0) return null;
  let min = Math.min(...years);
  let max = Math.max(...years);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  // Marge de 5% de chaque côté pour la lisibilité.
  const span = max - min;
  return { min: min - span * 0.05, max: max + span * 0.05 };
}

// ---------------------------------------------------------------------------
// Rendu SVG
// ---------------------------------------------------------------------------

interface SvgProps {
  range: YearRange;
  eras: Era[];
  events: TimelineEvent[];
  erasById: Map<string, Era>;
}

function TimelineSvg({ range, eras, events, erasById }: SvgProps) {
  const width = 1200;
  const padding = 40;
  const innerWidth = width - padding * 2;
  const eraBandHeight = 32;
  const eraGap = 4;
  const erasHeight = Math.max(1, eras.length) * (eraBandHeight + eraGap);
  const eventsRowHeight = 80;
  const height = padding * 2 + erasHeight + eventsRowHeight;

  const xFor = (year: number) =>
    padding + ((year - range.min) / (range.max - range.min)) * innerWidth;

  // Échelle de graduations : 5 ticks répartis sur l'axe.
  const ticks = generateTicks(range.min, range.max, 6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      preserveAspectRatio="xMinYMid meet"
    >
      {/* Axe X */}
      <line
        x1={padding}
        x2={width - padding}
        y1={padding + erasHeight + 30}
        y2={padding + erasHeight + 30}
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={xFor(t)}
            x2={xFor(t)}
            y1={padding + erasHeight + 26}
            y2={padding + erasHeight + 34}
            stroke="#94a3b8"
            strokeWidth={1}
          />
          <text
            x={xFor(t)}
            y={padding + erasHeight + 50}
            textAnchor="middle"
            fontSize={11}
            fill="#64748b"
          >
            {formatYear(t)}
          </text>
        </g>
      ))}

      {/* Bandes d'époques */}
      {eras.map((era, i) => {
        if (era.start_year == null && era.end_year == null) return null;
        const start = era.start_year ?? range.min;
        const end = era.end_year ?? range.max;
        const x = xFor(start);
        const w = Math.max(2, xFor(end) - x);
        const y = padding + i * (eraBandHeight + eraGap);
        const color = era.color ?? "#94a3b8";
        return (
          <g key={era.id}>
            <rect
              x={x}
              y={y}
              width={w}
              height={eraBandHeight}
              fill={color}
              fillOpacity={0.18}
              stroke={color}
              strokeWidth={1}
              rx={4}
            />
            <text
              x={x + 8}
              y={y + eraBandHeight / 2 + 4}
              fontSize={12}
              fill="#1e293b"
              fontWeight={500}
            >
              {era.name}
            </text>
          </g>
        );
      })}

      {/* Marqueurs d'événements */}
      {events.map((ev) => {
        if (ev.year == null) return null;
        const x = xFor(ev.year);
        const era = ev.era_id ? erasById.get(ev.era_id) : undefined;
        const color = era?.color ?? "#475569";
        const yBase = padding + erasHeight + 20;
        return (
          <g key={ev.id}>
            <line
              x1={x}
              x2={x}
              y1={padding}
              y2={yBase}
              stroke={color}
              strokeOpacity={0.3}
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <circle cx={x} cy={yBase} r={5} fill={color} stroke="white" strokeWidth={2}>
              <title>
                {`${ev.name} (${formatYear(ev.year)}${
                  era ? ` · ${era.name}` : ""
                })${ev.description ? `\n${ev.description}` : ""}`}
              </title>
            </circle>
          </g>
        );
      })}

      {/* Légende — événements positionnés en colonne sous l'axe */}
      {events
        .filter((e) => e.year != null)
        .map((ev, i) => {
          const x = xFor(ev.year!);
          // Empilement vertical pour éviter les chevauchements.
          const y = padding + erasHeight + 60 + (i % 4) * 16;
          return (
            <text
              key={`${ev.id}-label`}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={10}
              fill="#475569"
            >
              {ev.name}
            </text>
          );
        })}
    </svg>
  );
}

function formatYear(y: number): string {
  const rounded = Math.round(y);
  return rounded < 0 ? `${-rounded} av.` : String(rounded);
}

function generateTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}
