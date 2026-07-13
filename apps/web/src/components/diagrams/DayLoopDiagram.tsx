import type { CSSProperties } from 'react';
import { useReveal } from '../../lib/useReveal';
import { DiagramCard, FlowConnector } from './DiagramChrome';

const STEPS: {
  label: string;
  title: string;
  body: string;
  accent?: boolean;
}[] = [
  {
    label: 'You ask',
    title: '"Summarise the last 24 hours"',
    body: 'The agent uses tools it already has: chat, calendar, tickets, the repo.',
  },
  {
    label: 'Vault',
    title: 'Read rules. File updates.',
    body: 'Search notes, follow RULES.md, update People / Projects / Journal.',
    accent: true,
  },
  {
    label: 'Tomorrow',
    title: 'The next agent already knows',
    body: 'Context lives in files on disk, not in a chat scrollback that disappears.',
  },
];

/**
 * The 24-hour summarise loop — staggered cards, traveling flow bead, step glow.
 */
export function DayLoopDiagram() {
  const { ref, visible } = useReveal<HTMLDivElement>('0px 0px -8% 0px');

  return (
    <div ref={ref} className={`diagram-panel diagram-stage ${visible ? 'is-live' : ''}`}>
      <div className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
            <DiagramCard
              accent={step.accent === true}
              className="diagram-enter loop-step-active flex-1"
              style={
                {
                  '--enter-delay': `${i * 100}ms`,
                  '--glow-delay': `${0.8 + i * 2}s`,
                } as CSSProperties
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent font-serif text-xs font-semibold text-accent-ink shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent)]">
                  {i + 1}
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {step.label}
                </p>
              </div>
              <p className="mt-3.5 font-serif text-lg font-semibold leading-snug text-ink sm:text-xl">
                {step.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </DiagramCard>
            {i < STEPS.length - 1 ? (
              <>
                <FlowConnector />
                <div className="lg:hidden">
                  <FlowConnector vertical />
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
