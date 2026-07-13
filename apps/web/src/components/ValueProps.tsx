import { useReveal } from '../lib/useReveal';
import { VaultGraphDiagram } from './diagrams/VaultGraphDiagram';

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
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div className={`reveal ${visible ? 'is-visible' : ''}`}>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Keep the parts of you that live in many places
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Work leaves traces in tools that do not talk to each other. Second Brain is where
              those traces become a durable picture of you: plain files on your machine, organised
              your way.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {THREADS.map((thread) => (
                <div key={thread.title}>
                  <div className="mb-2 h-px w-7 bg-accent" aria-hidden="true" />
                  <h3 className="font-serif text-lg font-semibold text-ink">{thread.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{thread.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`reveal ${visible ? 'is-visible' : ''}`}
            style={{ transitionDelay: visible ? '120ms' : '0ms' }}
          >
            <VaultGraphDiagram />
          </div>
        </div>
      </div>
    </section>
  );
}
