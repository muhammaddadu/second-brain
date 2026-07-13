import { STAR_URL } from '../lib/downloads';
import { AgentsDiagram } from './diagrams/AgentsDiagram';

type HeroProps = {
  primaryDownloadHref: string;
  primaryDownloadLabel: string;
};

export function Hero({ primaryDownloadHref, primaryDownloadLabel }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
      <div
        className="hero-glow pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-accent/14 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="hero-glow pointer-events-none absolute -right-20 top-28 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
        style={{ animationDelay: '2.2s' }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <div className="animate-fade-up flex flex-wrap gap-2" style={{ animationDelay: '0ms' }}>
            {['Local-first', 'Any agent', 'Files you own'].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-accent/25 bg-accent/[0.07] px-3 py-1 text-xs font-medium text-ink"
              >
                {chip}
              </span>
            ))}
          </div>

          <h1
            className="animate-fade-up mt-6 font-serif text-[2.5rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[3.25rem]"
            style={{ animationDelay: '70ms' }}
          >
            Slowly build a digital
            <br />
            version of <em className="italic text-accent">yourself.</em>
          </h1>

          <p
            className="animate-fade-up mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: '140ms' }}
          >
            Ask an agent to summarise the last 24 hours. It updates people, projects, and
            conversations in your vault. The next agent reads that context back.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: '210ms' }}
          >
            <a
              href={primaryDownloadHref}
              className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink no-underline shadow-sm transition-transform hover:brightness-110 active:scale-[0.98]"
            >
              {primaryDownloadLabel}
            </a>
            <a
              href={STAR_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-edge bg-raised px-5 py-2.5 text-sm font-semibold text-ink no-underline transition-colors hover:border-accent/40"
            >
              <StarIcon />
              Star on GitHub
            </a>
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
          <AgentsDiagram />
        </div>
      </div>
    </section>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z" />
    </svg>
  );
}
