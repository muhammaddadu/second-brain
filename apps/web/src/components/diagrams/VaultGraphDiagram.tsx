import { DiagramCard } from './DiagramChrome';

const NODES = [
  { label: 'Person', detail: 'How someone writes, what they care about' },
  { label: 'Project', detail: 'Status, decisions, open questions' },
  { label: 'Preference', detail: 'Your style, house rules, defaults' },
  { label: 'Journal', detail: 'What happened, filed where it belongs' },
] as const;

/**
 * Marketing graph: note types people keep.
 * Honest mechanism: tags, wikilinks, similarity — you still choose folders.
 */
export function VaultGraphDiagram() {
  return (
    <div className="diagram-panel !p-0">
      <div className="relative overflow-hidden p-5 sm:p-7">
        <svg
          viewBox="0 0 100 56"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full opacity-50 sm:h-48"
          aria-hidden="true"
        >
          <line x1="20" y1="22" x2="50" y2="28" stroke="var(--edge)" strokeWidth="0.5" />
          <line x1="80" y1="18" x2="50" y2="28" stroke="var(--edge)" strokeWidth="0.5" />
          <line x1="22" y1="42" x2="50" y2="28" stroke="var(--edge)" strokeWidth="0.5" />
          <line
            x1="78"
            y1="44"
            x2="50"
            y2="28"
            stroke="var(--accent)"
            strokeWidth="0.55"
            strokeDasharray="1.2 1.2"
          />
          <circle cx="50" cy="28" r="2.4" fill="var(--accent)" />
          <circle cx="20" cy="22" r="1.7" fill="var(--ink)" opacity="0.45" />
          <circle cx="80" cy="18" r="1.7" fill="var(--ink)" opacity="0.45" />
          <circle cx="22" cy="42" r="1.7" fill="var(--ink)" opacity="0.45" />
          <circle cx="78" cy="44" r="1.7" fill="var(--ink)" opacity="0.45" />
        </svg>

        <div className="relative grid gap-3 sm:grid-cols-2">
          {NODES.map((n) => (
            <DiagramCard key={n.label}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {n.label}
              </p>
              <p className="mt-1.5 text-sm text-muted">{n.detail}</p>
            </DiagramCard>
          ))}
        </div>

        <p className="relative mt-5 text-center text-xs text-muted">
          Linked by tags, <code className="text-[11px] text-ink">[[wikilinks]]</code>, and
          similarity. You still choose the folders.
        </p>
      </div>
    </div>
  );
}
