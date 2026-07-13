/**
 * Multi-hop recall (E11) — walk the knowledge graph from a seed note and return related notes
 * with the shortest trail (path + edge kinds). Pure over `GraphData` so CLI / MCP / desktop share
 * one implementation; vault orchestration (`recallRelated`) builds the graph the same way as the
 * graph view (index + wikilinks), then calls the pure walker.
 */
import { buildGraph, type GraphData, type GraphEdge, type GraphOptions } from './graph.js';
import { collectVaultLinks } from './links.js';
import type { SearchIndex } from './search.js';
import type { Vault } from './vault.js';

export type EdgeKind = GraphEdge['kind'];

/** One hop along a recall trail. */
export interface RecallHopEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  weight: number;
}

/** A note reached within `hops` of the seed. */
export interface RecallHit {
  path: string;
  title: string;
  /** Shortest graph distance from the seed (1..hops). */
  distance: number;
  /** Note paths from seed to this note (inclusive). */
  trail: string[];
  /** Edges along that trail. */
  via: RecallHopEdge[];
}

export interface RecallResult {
  seed: { path: string; title: string };
  hops: number;
  kinds: EdgeKind[];
  hits: RecallHit[];
}

export interface MultiHopRecallOptions {
  /** Max graph distance from the seed (default 2, capped at {@link MAX_RECALL_HOPS}). */
  hops?: number;
  /**
   * Edge kinds to traverse. Default: all.
   * A `both` edge matches when `tag`, `semantic`, or `both` is allowed.
   */
  kinds?: readonly EdgeKind[];
  /** Cap on returned hits (default {@link DEFAULT_RECALL_LIMIT}). */
  limit?: number;
}

/** Options for the vault-facing helper — graph build + walk. */
export interface RecallRelatedOptions extends MultiHopRecallOptions {
  /** Embedding model for semantic edges (omit → tag + link only). */
  model?: string;
  threshold?: number;
  maxNeighbors?: number;
}

export const DEFAULT_RECALL_HOPS = 2;
export const MAX_RECALL_HOPS = 5;
export const DEFAULT_RECALL_LIMIT = 50;

export const ALL_EDGE_KINDS: readonly EdgeKind[] = ['link', 'tag', 'semantic', 'both'];

const KIND_SET = new Set<string>(ALL_EDGE_KINDS);

/** Parse a comma-separated kinds list (CLI/MCP); invalid tokens throw. */
export function parseEdgeKinds(raw: string): EdgeKind[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error('kinds: expected at least one of link,tag,semantic,both');
  const out: EdgeKind[] = [];
  for (const p of parts) {
    if (!KIND_SET.has(p)) {
      throw new Error(`kinds: unknown "${p}" (use link, tag, semantic, both)`);
    }
    out.push(p as EdgeKind);
  }
  return out;
}

function clampHops(hops: number | undefined): number {
  const n = hops ?? DEFAULT_RECALL_HOPS;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), MAX_RECALL_HOPS);
}

function edgeAllowed(kind: EdgeKind, allowed: ReadonlySet<EdgeKind>): boolean {
  if (allowed.has(kind)) return true;
  // A merged tag+semantic edge counts when either leg (or both) is requested.
  if (kind === 'both') {
    return allowed.has('tag') || allowed.has('semantic') || allowed.has('both');
  }
  return false;
}

type AdjEntry = { to: string; kind: EdgeKind; weight: number };

/** Undirected adjacency list, filtered by allowed kinds, neighbours strongest-first. */
function adjacency(graph: GraphData, allowed: ReadonlySet<EdgeKind>): Map<string, AdjEntry[]> {
  const map = new Map<string, AdjEntry[]>();
  const add = (from: string, to: string, kind: EdgeKind, weight: number) => {
    const list = map.get(from) ?? [];
    list.push({ to, kind, weight });
    map.set(from, list);
  };
  for (const e of graph.edges) {
    if (!edgeAllowed(e.kind, allowed)) continue;
    add(e.source, e.target, e.kind, e.weight);
    add(e.target, e.source, e.kind, e.weight);
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.weight - a.weight || a.to.localeCompare(b.to));
  }
  return map;
}

/**
 * Walk the graph from `seedPath` up to `hops` edges away. Returns shortest trails only
 * (first visit wins). Hits are ordered by distance, then descending edge weight into the note.
 */
export function multiHopRecall(
  graph: GraphData,
  seedPath: string,
  options: MultiHopRecallOptions = {},
): RecallResult {
  const hops = clampHops(options.hops);
  const kinds = [...(options.kinds ?? ALL_EDGE_KINDS)];
  const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_RECALL_LIMIT));
  const allowed = new Set(kinds);

  const titleByPath = new Map(graph.nodes.map((n) => [n.path, n.title]));
  const seedTitle = titleByPath.get(seedPath) ?? seedPath;
  const result: RecallResult = {
    seed: { path: seedPath, title: seedTitle },
    hops,
    kinds,
    hits: [],
  };

  if (
    !titleByPath.has(seedPath) &&
    !graph.edges.some((e) => e.source === seedPath || e.target === seedPath)
  ) {
    // Seed unknown and isolated from every edge — nothing to walk.
    return result;
  }

  const adj = adjacency(graph, allowed);
  const visited = new Set<string>([seedPath]);
  type QueueItem = { path: string; distance: number; trail: string[]; via: RecallHopEdge[] };
  const queue: QueueItem[] = [{ path: seedPath, distance: 0, trail: [seedPath], via: [] }];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || cur.distance >= hops) continue;
    const neighbours = adj.get(cur.path) ?? [];
    for (const n of neighbours) {
      if (visited.has(n.to)) continue;
      visited.add(n.to);
      const hop: RecallHopEdge = { from: cur.path, to: n.to, kind: n.kind, weight: n.weight };
      const next: QueueItem = {
        path: n.to,
        distance: cur.distance + 1,
        trail: [...cur.trail, n.to],
        via: [...cur.via, hop],
      };
      result.hits.push({
        path: next.path,
        title: titleByPath.get(next.path) ?? next.path,
        distance: next.distance,
        trail: next.trail,
        via: next.via,
      });
      if (result.hits.length >= limit) {
        return result;
      }
      queue.push(next);
    }
  }

  return result;
}

/**
 * Build the vault's knowledge graph (same inputs as the desktop graph view) and run multi-hop
 * recall. Shells (CLI, MCP, IPC) should call this rather than re-implementing graph assembly.
 */
export async function recallRelated(
  vault: Vault,
  index: SearchIndex,
  seedPath: string,
  options: RecallRelatedOptions = {},
): Promise<RecallResult> {
  const { links } = await collectVaultLinks(vault);
  const graphOptions: GraphOptions = {
    links,
    ...(options.model ? { model: options.model } : {}),
    ...(typeof options.threshold === 'number' ? { threshold: options.threshold } : {}),
    ...(typeof options.maxNeighbors === 'number' ? { maxNeighbors: options.maxNeighbors } : {}),
  };
  const graph = buildGraph(index, graphOptions);
  return multiHopRecall(graph, seedPath, options);
}
