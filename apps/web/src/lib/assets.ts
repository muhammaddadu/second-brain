/** Public asset under Vite `base` (works for `/` and `/second-brain/`). */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL;
  const clean = path.replace(/^\//, '');
  return `${base}${clean}`;
}
