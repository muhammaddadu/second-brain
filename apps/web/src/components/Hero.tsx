import { STAR_URL } from '../lib/downloads';
import { Shot } from './Shot';

type HeroProps = {
  primaryDownloadHref: string;
  primaryDownloadLabel: string;
};

export function Hero({ primaryDownloadHref, primaryDownloadLabel }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pb-12 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
      <div
        className="hero-glow pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="hero-glow pointer-events-none absolute -right-20 top-40 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
        style={{ animationDelay: '2.2s' }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p
            className="animate-fade-up mb-3 font-serif text-xl font-semibold tracking-tight text-ink sm:text-2xl"
            style={{ animationDelay: '0ms' }}
          >
            Second Brain
          </p>
          <h1
            className="animate-fade-up font-serif text-[2.35rem] font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl"
            style={{ animationDelay: '70ms' }}
          >
            Slowly build a digital
            <br />
            version of yourself.
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            style={{ animationDelay: '140ms' }}
          >
            Ask any AI agent to summarise the last 24 hours. It pulls from the tools it can reach,
            updates the right notes in your vault, and leaves context for the next conversation.
            People, projects, how you work: kept in one place you own.
          </p>

          <div
            className="animate-fade-up mt-7 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '210ms' }}
          >
            <a
              href={primaryDownloadHref}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink no-underline shadow-sm transition-transform hover:brightness-110 active:scale-[0.98]"
            >
              {primaryDownloadLabel}
            </a>
            <a
              href={STAR_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-edge bg-raised px-5 py-2.5 text-sm font-semibold text-ink no-underline transition-colors hover:border-accent/40"
            >
              <StarIcon />
              Star on GitHub
            </a>
          </div>
        </div>

        <div className="animate-fade-up mt-12" style={{ animationDelay: '280ms' }}>
          <Shot
            src="demo.webp"
            alt="Second Brain vault: notes, search, databases, and knowledge graph"
            loading="eager"
            width={1280}
            height={839}
          />
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
