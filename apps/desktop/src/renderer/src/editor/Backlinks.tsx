/**
 * "Linked from" — the notes that wikilink to this one (ADR 0010). Backlinks make links bidirectional
 * without the author maintaining both ends. Derived on demand from the files via core; refreshed
 * when the vault changes. Hidden entirely when nothing links here, so it never adds empty chrome.
 */

import { noteDisplayName } from '@brain/core/paths';
import type { NoteRef } from '@brain/core/wikilinks';
import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Backlinks({
  path,
  onOpenNote,
}: {
  path: string;
  onOpenNote: (path: string) => void;
}) {
  const [refs, setRefs] = useState<NoteRef[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.vault
        .backlinks(path)
        .then((r) => {
          if (!cancelled) setRefs(r);
        })
        .catch(console.error);
    load();
    const unsubscribe = window.vault.onVaultChange(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [path]);

  if (refs.length === 0) return null;

  return (
    <section className="border-edge mt-10 border-t pt-4" data-testid="backlinks">
      <h2 className="text-faint mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Link2 size={13} aria-hidden /> Linked from
      </h2>
      <ul className="flex flex-col gap-0.5">
        {refs.map((ref) => (
          <li key={ref.path}>
            <button
              type="button"
              onClick={() => onOpenNote(ref.path)}
              className="text-muted hover:text-accent text-left text-sm"
            >
              {ref.title || noteDisplayName(ref.path)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
