/**
 * Multi-hop recall (E11) — seed → 1-hop → 2-hop.
 * Vertical timeline so it reads cleanly in a narrow column and on mobile.
 */
import type { CSSProperties } from 'react';
import { useReveal } from '../../lib/useReveal';
import { DiagramCard } from './DiagramChrome';

const STEPS = [
  {
    label: 'Seed',
    title: 'People / Maya',
    body: 'Search lands on a note. Recall starts here.',
    kind: 'search',
    mark: '0',
  },
  {
    label: '1 hop',
    title: 'Walkable hotels',
    body: 'Shared tag + [[wikilink]]. Edge kinds stay visible.',
    kind: 'link · tag',
    mark: '1',
    accent: true,
  },
  {
    label: '2 hops',
    title: 'Project: Kickoff',
    body: 'Context the next agent needs — without re-asking.',
    kind: 'tag',
    mark: '2',
  },
] as const;

export function HopRecallDiagram() {
  const { ref, visible } = useReveal<HTMLDivElement>('0px 0px -8% 0px');

  return (
    <div ref={ref} className={`diagram-panel hop-panel diagram-stage ${visible ? 'is-live' : ''}`}>
      <div className="hop-timeline relative">
        <div className="hop-spine pointer-events-none absolute bottom-4 top-4" aria-hidden="true">
          <div className="hop-spine-line" />
          <span className="hop-spine-bead" />
        </div>

        <ol className="relative m-0 flex list-none flex-col gap-3.5 p-0">
          {STEPS.map((step, i) => (
            <li key={step.label} className="relative pl-11 sm:pl-12">
              <span
                className={`hop-node absolute left-0 top-3.5 flex h-7 w-7 items-center justify-center rounded-full font-serif text-[11px] font-semibold sm:top-4 sm:h-8 sm:w-8 sm:text-xs ${
                  'accent' in step && step.accent
                    ? 'bg-accent text-accent-ink'
                    : 'bg-raised text-accent ring-1 ring-accent/35'
                }`}
                aria-hidden="true"
              >
                {step.mark}
              </span>
              <DiagramCard
                accent={'accent' in step && step.accent === true}
                className="diagram-enter loop-step-active"
                style={
                  {
                    '--enter-delay': `${i * 110}ms`,
                    '--glow-delay': `${0.6 + i * 1.8}s`,
                  } as CSSProperties
                }
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                    {step.label}
                  </p>
                  <span className="rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted">
                    {step.kind}
                  </span>
                </div>
                <p className="mt-2 font-serif text-base font-semibold leading-snug text-ink sm:text-lg">
                  {step.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
              </DiagramCard>
            </li>
          ))}
        </ol>
      </div>

      <p className="relative mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-xs text-muted">
        <code className="rounded-md bg-raised/90 px-1.5 py-0.5 text-[11px] text-ink">
          brain recall
        </code>
        <span aria-hidden="true">·</span>
        <span>
          MCP{' '}
          <code className="rounded-md bg-raised/90 px-1.5 py-0.5 text-[11px] text-ink">recall</code>
        </span>
        <span aria-hidden="true">·</span>
        <span>Related panel — same core walk</span>
      </p>
    </div>
  );
}
