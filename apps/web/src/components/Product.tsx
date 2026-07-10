import { useReveal } from '../lib/useReveal';
import { Shot } from './Shot';

export function Product() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section id="product" ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className={`reveal ${visible ? 'is-visible' : ''}`}>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">
            Start tonight
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Create a vault. Point an agent at it.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            One folder on your machine. A desktop app when you want to browse. MCP and CLI when an
            agent should file the day. Same files either way.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-muted">
            <li className="flex gap-3">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              No account. Local by default.
            </li>
            <li className="flex gap-3">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              <span>
                <code className="rounded bg-surface px-1 py-0.5 text-[12px] text-ink">
                  RULES.md
                </code>{' '}
                tells every agent how you organise
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden="true"
              />
              Works with the agents you already use
            </li>
          </ul>
        </div>
        <div
          className={`reveal ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '120ms' : '0ms' }}
        >
          <Shot
            src="shots/shot-01.webp"
            alt="Second Brain welcome screen: create a new vault or open a folder"
          />
        </div>
      </div>
    </section>
  );
}
