/** Small display-formatting helpers shared across renderer features. */

/** Shorten a home-rooted absolute path for display: `/Users/me/x` / `/home/me/x` → `~/x`. */
export function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}
