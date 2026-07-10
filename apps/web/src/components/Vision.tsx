import { asset } from '../lib/assets';
import { useReveal } from '../lib/useReveal';

const SCENES = [
  {
    step: 'Tonight',
    title: 'Your day is everywhere',
    body: 'Chats, calendars, tickets, half-finished threads. The useful bits are trapped in tools that do not talk to each other.',
  },
  {
    step: 'You ask',
    title: '"Summarise the last 24 hours"',
    body: 'Any agent with MCP or the CLI can reach your vault. It reads your rules, searches what you already wrote, and files updates where they belong.',
  },
  {
    step: 'Tomorrow',
    title: 'The next chat already knows you',
    body: 'People notes, project status, how you like things done. The vault is context for every agent you use, not a graveyard of old transcripts.',
  },
] as const;

export function Vision() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section id="vision" ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-2xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            One loop. Every day.
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Second Brain is the place agents write into, and the place they read from next time.
          </p>
        </div>

        <div
          className={`reveal mt-12 overflow-hidden rounded-xl border border-edge bg-raised ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '80ms' : '0ms' }}
        >
          <img
            src={asset('illust/day-into-vault.webp')}
            alt="Scattered day tools flowing into a personal notebook vault"
            width={1536}
            height={1024}
            className="block h-auto w-full"
            loading="lazy"
            decoding="async"
          />
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {SCENES.map((scene, i) => (
            <li
              key={scene.step}
              className={`reveal ${visible ? 'is-visible' : ''}`}
              style={{ transitionDelay: visible ? `${140 + i * 80}ms` : '0ms' }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">
                {scene.step}
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold text-ink">{scene.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{scene.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
