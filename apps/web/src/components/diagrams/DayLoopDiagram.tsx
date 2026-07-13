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
 * The 24-hour summarise loop — concrete cards, our product mechanics only.
 */
export function DayLoopDiagram() {
  return (
    <div className="diagram-panel">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
            <DiagramCard accent={step.accent === true} className="flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/12 font-serif text-xs font-semibold text-accent">
                  {i + 1}
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {step.label}
                </p>
              </div>
              <p className="mt-3 font-serif text-lg font-semibold leading-snug text-ink">
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
