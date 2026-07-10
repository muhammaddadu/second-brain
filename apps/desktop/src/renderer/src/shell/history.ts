/**
 * Browser-style navigation history for the workspace route. Pure so it's unit-testable: `push`
 * truncates any forward entries (a new navigation forks history), and `go` clamps within bounds.
 * The component holds one {@link NavHistory} in state and derives back/forward availability from it.
 */
import type { Route } from '../../../shared/route';

export interface NavHistory {
  entries: Route[];
  index: number;
}

const MAX_ENTRIES = 100;

export function initHistory(route: Route): NavHistory {
  return { entries: [route], index: 0 };
}

export function current(h: NavHistory): Route {
  return h.entries[h.index] ?? { name: 'note', path: null };
}

/** Navigate to a new route: drop anything ahead of the cursor, append, cap the length. */
export function push(h: NavHistory, route: Route): NavHistory {
  // Ignore a no-op navigation to the identical route (avoids dead history entries).
  if (sameRoute(current(h), route)) return h;
  const kept = h.entries.slice(0, h.index + 1);
  const entries = [...kept, route].slice(-MAX_ENTRIES);
  return { entries, index: entries.length - 1 };
}

/** Move the cursor by `delta` (‑1 back, +1 forward), clamped. */
export function go(h: NavHistory, delta: number): NavHistory {
  const index = Math.min(Math.max(h.index + delta, 0), h.entries.length - 1);
  return index === h.index ? h : { ...h, index };
}

export function canGoBack(h: NavHistory): boolean {
  return h.index > 0;
}
export function canGoForward(h: NavHistory): boolean {
  return h.index < h.entries.length - 1;
}

/** Replace the current entry in place (e.g. a rename changed the open note's path) without a new step. */
export function replace(h: NavHistory, route: Route): NavHistory {
  const entries = h.entries.slice();
  entries[h.index] = route;
  return { ...h, entries };
}

function sameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  if (a.name === 'note' && b.name === 'note') return a.path === b.path;
  if (a.name === 'database' && b.name === 'database') return a.path === b.path;
  return true;
}
