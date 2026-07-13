import { useReveal } from '../lib/useReveal';
import { Shot } from './Shot';

const MOMENTS = [
  {
    src: 'demo.webp',
    title: 'A day into the vault',
    caption: 'Watch notes land where RULES.md says they belong.',
    wide: true,
  },
  {
    src: 'shots/shot-01.webp',
    title: 'Start local',
    caption: 'Create a vault or open a folder. No account.',
  },
  {
    src: 'shots/shot-02.webp',
    title: 'You still write here',
    caption: 'Paper-like editor for deep work. Agents write the same files.',
  },
  {
    src: 'shots/shot-03.webp',
    title: 'Same search, both sides',
    caption: '⌘K for you. The same index for MCP and CLI.',
  },
  {
    src: 'shots/shot-05.webp',
    title: 'See how notes connect',
    caption: 'The in-app graph: tags, links, similarity — then walk hops.',
  },
  {
    src: 'illust/graph-banner.webp',
    title: 'A durable picture of you',
    caption: 'People, projects, preferences — linked, not lost in scrollback.',
  },
] as const;

export function Gallery() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="see"
      ref={ref}
      className="border-t border-edge bg-surface/40 px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            The vault, in the app
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">Proof, not a pitch deck.</p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MOMENTS.map((moment, i) => (
            <article
              key={moment.src}
              className={`reveal ${'wide' in moment && moment.wide ? 'sm:col-span-2 lg:col-span-3' : ''} ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: visible ? `${70 + i * 55}ms` : '0ms' }}
            >
              <Shot
                src={moment.src}
                alt={moment.title}
                className={'wide' in moment && moment.wide ? 'gallery-hero' : ''}
              />
              <h3 className="mt-4 font-serif text-lg font-semibold text-ink">{moment.title}</h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {moment.caption}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
