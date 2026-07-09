/**
 * The app's navigation model — a small typed router shared by main and renderer. Routes serialize
 * to a URL grammar so they are deep-link native: a CLI or another process can open the app to a
 * specific place via `secondbrain://<route>` (or `--route=<route>` at launch). Keeping this as
 * plain data (not a routing library) avoids Electron file:// pitfalls and gives us one source of
 * truth for both in-app navigation and deep links.
 *
 * Grammar (the part after the scheme):
 *   settings
 *   graph                      → the knowledge-graph view
 *   note                       → the "no note selected" state
 *   note/<uri-encoded path>    → open a specific note
 *   database/<uri-encoded path> → open a folder as a database (table/board)
 */
export type Route =
  | { name: 'note'; path: string | null }
  | { name: 'settings' }
  | { name: 'graph' }
  | { name: 'database'; path: string };

/** Custom protocol used for deep links, e.g. `secondbrain://note/Journal%2F2026-07-07.note.json`. */
export const APP_SCHEME = 'secondbrain';

export const DEFAULT_ROUTE: Route = { name: 'note', path: null };

/** Serialize a route to its URL path (no scheme), e.g. `note/Journal%2Fa.note.json`. */
export function routeToUrl(route: Route): string {
  if (route.name === 'settings') return 'settings';
  if (route.name === 'graph') return 'graph';
  if (route.name === 'database') return `database/${encodeURIComponent(route.path)}`;
  return route.path ? `note/${encodeURIComponent(route.path)}` : 'note';
}

/** Parse a route from a URL — tolerant of a leading `secondbrain://` (or `secondbrain:`) prefix. */
export function routeFromUrl(url: string): Route {
  const trimmed = url
    .trim()
    .replace(new RegExp(`^${APP_SCHEME}://`), '')
    .replace(new RegExp(`^${APP_SCHEME}:`), '')
    .replace(/^\/+/, '');
  if (trimmed === 'settings') return { name: 'settings' };
  if (trimmed === 'graph') return { name: 'graph' };
  if (trimmed === '' || trimmed === 'note') return { name: 'note', path: null };
  const dbMatch = /^database\/(.+)$/.exec(trimmed);
  if (dbMatch?.[1]) {
    try {
      return { name: 'database', path: decodeURIComponent(dbMatch[1]) };
    } catch {
      return DEFAULT_ROUTE;
    }
  }
  const noteMatch = /^note\/(.+)$/.exec(trimmed);
  if (noteMatch?.[1]) {
    try {
      return { name: 'note', path: decodeURIComponent(noteMatch[1]) };
    } catch {
      return DEFAULT_ROUTE;
    }
  }
  return DEFAULT_ROUTE;
}
