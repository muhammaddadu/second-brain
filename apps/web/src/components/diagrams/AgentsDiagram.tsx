import { asset } from '../../lib/assets';
import { useReveal } from '../../lib/useReveal';
import { Constellation, DiagramCard, FlowConnector } from './DiagramChrome';

const AGENTS = [
  { name: 'Claude', ask: 'Summarise the last 24 hours into my vault.', delay: 0 },
  { name: 'Cursor', ask: 'What did we decide on the kickoff?', delay: 0.35 },
  { name: 'Codex', ask: 'Update the project note from this PR.', delay: 0.7 },
  { name: 'Any MCP client', ask: "File Maya's preferences under People.", delay: 1.05 },
] as const;

/**
 * Multi-agent fan-in → local vault → recall.
 * Animated paper cards + traveling flow beads; claims match shipped MCP/CLI.
 */
export function AgentsDiagram() {
  const { ref, visible } = useReveal<HTMLDivElement>('0px 0px -6% 0px');

  return (
    <div
      ref={ref}
      className={`diagram-panel diagram-stage animate-draw-in ${visible ? 'is-live' : ''}`}
    >
      <Constellation />
      <div className="relative space-y-0.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {AGENTS.map((agent, i) => (
            <DiagramCard
              key={agent.name}
              className="diagram-enter min-h-[5.5rem]"
              style={{ ['--enter-delay' as string]: `${80 + i * 90}ms` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="agent-pulse inline-block h-1.5 w-1.5 rounded-full bg-accent"
                  style={{ animationDelay: `${agent.delay}s` }}
                  aria-hidden="true"
                />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  {agent.name}
                </p>
              </div>
              <p className="mt-2.5 text-[13px] leading-snug text-ink sm:text-sm">"{agent.ask}"</p>
            </DiagramCard>
          ))}
        </div>

        <FlowConnector vertical />

        <DiagramCard
          accent
          hub
          className="diagram-enter flex items-center gap-3.5 py-4"
          style={{ ['--enter-delay' as string]: '420ms' }}
        >
          <div className="relative shrink-0">
            <img
              src={asset('icon.webp')}
              alt=""
              width={44}
              height={44}
              className="rounded-xl shadow-sm"
            />
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-[var(--raised)]"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-lg font-semibold leading-tight text-ink">
              Second Brain vault
            </p>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              Local files · <code className="text-[12px] text-ink">brain-mcp</code> +{' '}
              <code className="text-[12px] text-ink">brain</code> CLI ·{' '}
              <code className="text-[12px] text-ink">RULES.md</code>
            </p>
          </div>
        </DiagramCard>

        <FlowConnector vertical />

        <DiagramCard className="diagram-enter" style={{ ['--enter-delay' as string]: '560ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Next chat
          </p>
          <p className="quote-live mt-2.5 text-sm leading-relaxed sm:text-[15px]">
            "Got it. Using Maya's walkable-hotel note and yesterday's project update."
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Same vault. Different agent. Context already filed — and recall can walk the links.
          </p>
        </DiagramCard>
      </div>
    </div>
  );
}
