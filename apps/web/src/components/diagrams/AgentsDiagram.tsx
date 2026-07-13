import { asset } from '../../lib/assets';
import { Constellation, DiagramCard, FlowConnector } from './DiagramChrome';

const AGENTS = [
  { name: 'Claude', ask: 'Summarise the last 24 hours into my vault.' },
  { name: 'Cursor', ask: 'What did we decide on the kickoff?' },
  { name: 'Codex', ask: 'Update the project note from this PR.' },
  { name: 'Any MCP client', ask: "File Maya's preferences under People." },
] as const;

/**
 * Multi-agent fan-in → local vault → recall.
 * Visual grammar inspired by ref diagrams; claims match shipped MCP/CLI + local files.
 */
export function AgentsDiagram() {
  return (
    <div className="diagram-panel animate-draw-in">
      <Constellation />
      <div className="relative space-y-1">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {AGENTS.map((agent) => (
            <DiagramCard key={agent.name} className="min-h-[5.25rem]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {agent.name}
              </p>
              <p className="mt-2 text-[13px] leading-snug text-ink sm:text-sm">"{agent.ask}"</p>
            </DiagramCard>
          ))}
        </div>

        <FlowConnector vertical />

        <DiagramCard accent className="flex items-center gap-3.5 py-4">
          <img
            src={asset('icon.webp')}
            alt=""
            width={40}
            height={40}
            className="rounded-lg shadow-sm"
          />
          <div className="min-w-0">
            <p className="font-serif text-base font-semibold text-ink">Second Brain vault</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Local files · <code className="text-[12px] text-ink">brain-mcp</code> +{' '}
              <code className="text-[12px] text-ink">brain</code> CLI ·{' '}
              <code className="text-[12px] text-ink">RULES.md</code>
            </p>
          </div>
        </DiagramCard>

        <FlowConnector vertical />

        <DiagramCard>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            Next chat
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            "Got it. Using Maya's walkable-hotel note and yesterday's project update."
          </p>
          <p className="mt-3 text-xs text-muted">
            Same vault. Different agent. Context already filed.
          </p>
        </DiagramCard>
      </div>
    </div>
  );
}
