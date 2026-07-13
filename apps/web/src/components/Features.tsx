import { useReveal } from '../lib/useReveal';

/**
 * Honest feature list: what we ship, not parked E10 concepts.
 */
const FEATURES = [
  {
    title: 'Desktop vault',
    body: 'Folder tree, BlockNote editor, Mermaid, wikilinks. Notes are files on disk.',
  },
  {
    title: 'Agent surfaces',
    body: 'brain CLI and brain-mcp. Same core as the app. Claude, Cursor, Codex, Gemini, and other MCP clients.',
  },
  {
    title: 'House rules',
    body: 'RULES.md lives in the vault. Agents read it before they file updates.',
  },
  {
    title: 'Hybrid search',
    body: 'Keyword search always local. Optional semantic search with a built-in on-device model, or your own provider.',
  },
  {
    title: 'Multi-hop recall',
    body: 'From a seed note, walk wikilinks, tags, and similarity. CLI, MCP, and the Related panel share one graph walk.',
  },
  {
    title: 'Knowledge graph',
    body: 'Browse the shape of the vault. Notes linked by tags, [[wikilinks]], and similarity.',
  },
  {
    title: 'Databases',
    body: 'A folder becomes a table or board. Each row is still a normal note agents can create.',
  },
] as const;

export function Features() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section id="features" ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-2xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            What you actually get
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            A local desktop app and agent access. Not a hosted memory cloud.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <article
              key={feature.title}
              className={`reveal diagram-card p-5 ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: visible ? `${80 + i * 50}ms` : '0ms' }}
            >
              <div className="mb-3 h-px w-8 bg-accent" aria-hidden="true" />
              <h3 className="font-serif text-lg font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
