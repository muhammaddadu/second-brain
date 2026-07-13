/**
 * Related notes (E11) — multi-hop recall from the open note via core's knowledge graph.
 * Shows 1–2 hop neighbours with edge-kind hints. Hidden when nothing is connected.
 */

import type { RecallHit } from '@brain/core';
import { noteDisplayName } from '@brain/core/paths';
import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';

export function RelatedNotes({
  path,
  onOpenNote,
}: {
  path: string;
  onOpenNote: (path: string) => void;
}) {
  const [hits, setHits] = useState<RecallHit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.vault
        .recall(path, { hops: 2, limit: 12 })
        .then((result) => {
          if (!cancelled) setHits(result.hits);
        })
        .catch(console.error);
    load();
    const unsubscribe = window.vault.onVaultChange(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [path]);

  if (hits.length === 0) return null;

  return (
    <section className="border-edge mt-8 border-t pt-4" data-testid="related-notes">
      <h2 className="text-faint mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <GitBranch size={13} aria-hidden /> Related
      </h2>
      <ul className="flex flex-col gap-1">
        {hits.map((hit) => {
          const via = hit.via.map((e) => e.kind).join(' → ');
          return (
            <li key={hit.path}>
              <button
                type="button"
                onClick={() => onOpenNote(hit.path)}
                className="text-muted hover:text-accent group flex w-full flex-col items-start text-left text-sm"
              >
                <span>
                  <span className="text-faint mr-1.5 tabular-nums">[{hit.distance}]</span>
                  {hit.title || noteDisplayName(hit.path)}
                </span>
                {via ? (
                  <span className="text-faint group-hover:text-muted/80 text-xs">via {via}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
