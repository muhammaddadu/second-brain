import { useReveal } from '../lib/useReveal';
import { Shot } from './Shot';

const MOMENTS = [
  {
    src: 'shots/shot-02.webp',
    title: 'You still write here',
    caption:
      'A paper-like editor for when you want to think yourself. Agents write the same files.',
  },
  {
    src: 'shots/shot-03.webp',
    title: 'Agents search the same way',
    caption:
      '⌘K for you. The same index for MCP and CLI. Keyword always; semantic when you turn it on.',
  },
  {
    src: 'shots/shot-04.webp',
    title: 'Projects as living tables',
    caption: 'A folder becomes a table or board. Agents add rows by creating notes.',
  },
  {
    src: 'shots/shot-05.webp',
    title: 'See yourself connect',
    caption: 'People, projects, and ideas linked by tags, wikilinks, and similarity.',
  },
] as const;

export function Gallery() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section id="see" ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            The vault that holds it
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Not another chat window. A place that compounds.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {MOMENTS.map((moment, i) => (
            <article
              key={moment.src}
              className={`reveal ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: visible ? `${80 + i * 70}ms` : '0ms' }}
            >
              <Shot src={moment.src} alt={moment.title} />
              <h3 className="mt-4 font-serif text-xl font-semibold text-ink">{moment.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{moment.caption}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
