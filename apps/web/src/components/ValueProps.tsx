import { asset } from '../lib/assets';
import { useReveal } from '../lib/useReveal';

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
    body: 'The useful residue of chats with humans and agents, filed instead of lost in a scrollback.',
  },
  {
    title: 'Your style',
    body: 'Rules for how notes should look and where they go. Every agent follows the same house style.',
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
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className={`reveal ${visible ? 'is-visible' : ''}`}>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Keep the parts of you that live in many places
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Work and life leave traces everywhere. Second Brain is where those traces become a
              durable picture of you: local files, organised your way, readable by any agent you
              trust.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {THREADS.map((thread) => (
                <div key={thread.title}>
                  <h3 className="font-serif text-lg font-semibold text-ink">{thread.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{thread.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`reveal overflow-hidden rounded-xl border border-edge bg-raised ${visible ? 'is-visible' : ''}`}
            style={{ transitionDelay: visible ? '120ms' : '0ms' }}
          >
            <img
              src={asset('illust/digital-self.webp')}
              alt="Notebook pages and graph nodes forming a silhouette"
              width={1536}
              height={1024}
              className="block h-auto w-full"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>

        <div
          className={`reveal mt-14 grid gap-8 md:grid-cols-2 ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '200ms' : '0ms' }}
        >
          <article className="overflow-hidden rounded-xl border border-edge bg-raised">
            <img
              src={asset('illust/agents.webp')}
              alt=""
              width={768}
              height={512}
              className="block h-auto w-full"
              loading="lazy"
              decoding="async"
            />
            <div className="p-5 sm:p-6">
              <h3 className="font-serif text-xl font-semibold text-ink">Any agent, same vault</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Claude, Codex, Gemini, or whatever you use next. MCP and CLI give them the same read
                and write path. They update the docs and they use the docs.
              </p>
            </div>
          </article>
          <article className="overflow-hidden rounded-xl border border-edge bg-raised">
            <img
              src={asset('illust/local.webp')}
              alt=""
              width={768}
              height={512}
              className="block h-auto w-full"
              loading="lazy"
              decoding="async"
            />
            <div className="p-5 sm:p-6">
              <h3 className="font-serif text-xl font-semibold text-ink">Yours on disk</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Plain files on your machine. No account required. Uninstall the app and the vault is
                still there. Nothing leaves unless you opt in.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
