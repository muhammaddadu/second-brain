/**
 * Multi-hop recall (E11) — seed → 1-hop → 2-hop over the knowledge graph.
 * Visual only; claims match shipped CLI/MCP/Related panel behaviour.
 */
import { DiagramCard, FlowConnector } from './DiagramChrome';

const STEPS = [
  {
    label: 'Seed',
    title: 'People / Maya',
    body: 'Search lands on a note. Recall starts here.',
  },
  {
    label: '1 hop',
    title: 'Walkable hotels',
    body: 'Shared tag + [[wikilink]]. Edge kinds stay visible.',
    accent: true,
  },
  {
    label: '2 hops',
    title: 'Project: Kickoff',
    body: 'Context the next agent needs — without re-asking.',
  },
] as const;

export function HopRecallDiagram() {
  return (
    <div className="diagram-panel">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
            <DiagramCard accent={'accent' in step && step.accent === true} className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {step.label}
              </p>
              <p className="mt-2 font-serif text-base font-semibold leading-snug text-ink">
                {step.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
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
      <p className="relative mt-4 text-center text-xs text-muted">
        <code className="text-[11px] text-ink">brain recall</code>
        {' · '}
        MCP <code className="text-[11px] text-ink">recall</code>
        {' · '}
        Related panel — same core walk
      </p>
    </div>
  );
}
