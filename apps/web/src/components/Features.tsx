import { asset } from '../lib/assets';
import { useReveal } from '../lib/useReveal';

/**
 * Shipped capabilities — six cards (even grid) with product shots / illustrations.
 */
const FEATURES = [
  {
    title: 'Desktop vault',
    body: 'Folder tree, BlockNote editor, Mermaid, wikilinks. Notes are files on disk.',
    image: 'shots/shot-02.webp',
    imageAlt: 'Second Brain note editor with folder tree',
  },
  {
    title: 'Agent surfaces',
    body: 'brain CLI and brain-mcp. Same core as the app — Claude, Cursor, Codex, Gemini, and other MCP clients.',
    image: 'illust/agents.webp',
    imageAlt: 'Illustration of agents writing into a local vault',
  },
  {
    title: 'House rules',
    body: 'RULES.md lives in the vault. Agents read it before they file updates.',
    image: 'illust/day-into-vault.webp',
    imageAlt: 'Illustration of the day being filed into vault notes',
  },
  {
    title: 'Hybrid search',
    body: 'Keyword search always local. Optional semantic search with a built-in on-device model, or your own provider.',
    image: 'shots/shot-03.webp',
    imageAlt: 'Second Brain search results in the desktop app',
  },
  {
    title: 'Graph & multi-hop recall',
    body: 'Browse tags, [[wikilinks]], and similarity. From a seed note, walk hops via CLI, MCP, or the Related panel.',
    image: 'shots/shot-05.webp',
    imageAlt: 'Knowledge graph view in Second Brain',
  },
  {
    title: 'Databases',
    body: 'A folder becomes a table or board. Each row is still a normal note agents can create.',
    image: 'shots/shot-04.webp',
    imageAlt: 'Database table view of notes in Second Brain',
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

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <article
              key={feature.title}
              className={`reveal feature-card group overflow-hidden ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: visible ? `${70 + i * 55}ms` : '0ms' }}
            >
              <div className="feature-card-media relative aspect-[16/10] overflow-hidden bg-surface">
                <img
                  src={asset(feature.image)}
                  alt={feature.imageAlt}
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--raised)_55%,transparent)] to-transparent opacity-80"
                  aria-hidden="true"
                />
              </div>
              <div className="p-5">
                <div className="mb-2.5 h-px w-8 bg-accent" aria-hidden="true" />
                <h3 className="font-serif text-lg font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
