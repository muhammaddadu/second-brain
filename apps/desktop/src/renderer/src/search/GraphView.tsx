/**
 * Knowledge-graph view (E4). An interactive force-directed map of the vault: notes are nodes, edges
 * come from shared tags and semantic similarity (from core's `buildGraph`, derived from the index).
 * A similarity-threshold slider and tag filter change what's shown; clicking a node opens the note.
 * Layout runs once with d3-force to a settled state, then renders as pannable/zoomable SVG.
 */
import type { GraphData } from '@brain/core';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const WIDTH = 900;
const HEIGHT = 640;
const SETTLE_TICKS = 300;

interface SimNode extends SimulationNodeDatum {
  path: string;
  title: string;
  tags: string[];
}
type SimLink = SimulationLinkDatum<SimNode> & { weight: number; kind: string };

/** Run d3-force to a settled layout (no animation) and return positioned nodes + resolved links. */
function layout(data: GraphData): { nodes: SimNode[]; links: SimLink[] } {
  const nodes: SimNode[] = data.nodes.map((n) => ({ path: n.path, title: n.title, tags: n.tags }));
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const links: SimLink[] = data.edges
    .filter((e) => byPath.has(e.source) && byPath.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, weight: e.weight, kind: e.kind }));

  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.path)
        .distance((l) => 40 + (1 - l.weight) * 120)
        .strength((l) => 0.2 + l.weight * 0.5),
    )
    .force('charge', forceManyBody().strength(-160))
    .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
    .stop();
  sim.tick(SETTLE_TICKS);
  return { nodes, links };
}

export function GraphView({ onOpenNote }: { onOpenNote: (path: string) => void }) {
  const [data, setData] = useState<GraphData | null>(null);
  const [threshold, setThreshold] = useState(0.6);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.vault
      .graph(threshold)
      .then((g) => {
        if (!cancelled) setData(g);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [threshold]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of data?.nodes ?? []) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [data]);

  const { nodes, links } = useMemo(() => (data ? layout(data) : { nodes: [], links: [] }), [data]);

  // Tag filter: keep nodes with the active tag and any edge between two kept nodes.
  const shownNodes = activeTag ? nodes.filter((n) => n.tags.includes(activeTag)) : nodes;
  const shownPaths = new Set(shownNodes.map((n) => n.path));
  const shownLinks = links.filter((l) => {
    const s = typeof l.source === 'object' ? (l.source as SimNode).path : String(l.source);
    const t = typeof l.target === 'object' ? (l.target as SimNode).path : String(l.target);
    return shownPaths.has(s) && shownPaths.has(t);
  });

  function pos(end: SimLink['source']): { x: number; y: number } {
    const n =
      typeof end === 'object' ? (end as SimNode) : nodes.find((x) => x.path === String(end));
    return { x: n?.x ?? 0, y: n?.y ?? 0 };
  }

  return (
    <div className="animate-fade flex h-full flex-col">
      <div className="border-edge flex flex-wrap items-center gap-4 border-b px-6 py-3">
        <h1 className="font-serif text-xl font-semibold">Knowledge graph</h1>
        <label className="text-muted flex items-center gap-2 text-xs">
          Similarity
          <input
            type="range"
            min={0.3}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="accent-accent"
          />
          <span className="tabular-nums">{threshold.toFixed(2)}</span>
        </label>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`rounded-full px-2 py-0.5 text-xs ${activeTag === null ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'}`}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTag(t === activeTag ? null : t)}
                className={`rounded-full px-2 py-0.5 text-xs ${t === activeTag ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {data === null ? (
          <div className="text-muted absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> Building graph…
          </div>
        ) : shownNodes.length === 0 ? (
          <div className="text-muted absolute inset-0 flex items-center justify-center px-8 text-center text-sm">
            No connections yet. Add tags to notes, or turn on semantic search, to see how they
            relate.
          </div>
        ) : (
          <svg
            role="img"
            aria-label="Knowledge graph"
            className="h-full w-full cursor-grab active:cursor-grabbing"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            onMouseDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onMouseMove={(e) => {
              if (!drag.current) return;
              const dx = e.clientX - drag.current.x;
              const dy = e.clientY - drag.current.y;
              drag.current = { x: e.clientX, y: e.clientY };
              setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
            }}
            onMouseUp={() => {
              drag.current = null;
            }}
            onMouseLeave={() => {
              drag.current = null;
            }}
            onWheel={(e) => {
              const next = Math.min(3, Math.max(0.3, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
              setView((v) => ({ ...v, scale: next }));
            }}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {shownLinks.map((l, i) => {
                const a = pos(l.source);
                const b = pos(l.target);
                return (
                  <line
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional edges
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--color-edge, #e2d8c6)"
                    strokeWidth={0.5 + l.weight * 2}
                    strokeOpacity={l.kind === 'semantic' ? 0.5 : 0.8}
                  />
                );
              })}
              {shownNodes.map((n) => (
                // biome-ignore lint/a11y/useSemanticElements: a native <button> can't live inside SVG; role+keyboard is the accessible equivalent
                <g
                  key={n.path}
                  transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
                  className="cursor-pointer focus:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${n.title}`}
                  onClick={() => onOpenNote(n.path)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenNote(n.path);
                    }
                  }}
                >
                  <title>{n.title}</title>
                  <circle r={5 + Math.min(6, n.tags.length * 1.5)} className="fill-accent" />
                  <text x={9} y={4} className="fill-ink text-[10px]" style={{ fontSize: 10 }}>
                    {n.title}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
