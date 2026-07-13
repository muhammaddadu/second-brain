import { useReveal } from '../lib/useReveal';
import { HopRecallDiagram } from './diagrams/HopRecallDiagram';

const THREADS = [
  {
    title: 'People',
    body: 'How someone writes. What they care about. What you promised them last week.',
  },
  {
    title: 'Projects',
    body: 'Status, decisions, open questions. Updated when the work moves, not when you remember to.',
  },
  {
    title: 'Conversations',
    body: 'The useful bits from chats with humans and agents, filed instead of lost in scrollback.',
  },
  {
    title: 'Your style',
    body: 'RULES.md tells every agent how notes should look and where they go.',
  },
] as const;

export function ValueProps() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="value"
      ref={ref}
      className="border-t border-edge bg-surface/40 px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 xl:gap-20">
          <div className={`reveal ${visible ? 'is-visible' : ''}`}>
            <h2 className="max-w-xl font-serif text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-4xl">
              Keep the parts of you that live in many places
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Work leaves traces in tools that do not talk to each other. Second Brain is where
              those traces become a durable picture of you: plain files on your machine, organised
              your way.
            </p>
            <div className="mt-9 grid gap-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-7">
              {THREADS.map((thread, i) => (
                <div
                  key={thread.title}
                  className={`reveal ${visible ? 'is-visible' : ''}`}
                  style={{ transitionDelay: visible ? `${80 + i * 60}ms` : '0ms' }}
                >
                  <div className="mb-2.5 h-px w-8 bg-accent" aria-hidden="true" />
                  <h3 className="font-serif text-lg font-semibold text-ink">{thread.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-[15px]">
                    {thread.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`reveal min-w-0 ${visible ? 'is-visible' : ''}`}
            style={{ transitionDelay: visible ? '140ms' : '0ms' }}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Multi-hop recall
                </p>
                <p className="mt-1 text-sm text-muted">
                  From a seed note, walk the graph — not just the closest match.
                </p>
              </div>
            </div>
            <HopRecallDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
