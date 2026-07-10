import { STAR_URL } from '../lib/downloads';
import { useReveal } from '../lib/useReveal';

export function StarCta() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-20">
      <div className={`reveal mx-auto max-w-xl text-center ${visible ? 'is-visible' : ''}`}>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Building this in the open
        </h2>
        <p className="mt-3 text-base text-muted sm:text-lg">
          If the idea of a vault that agents keep current lands for you, a star helps others find
          it.
        </p>
        <a
          href={STAR_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-ink no-underline shadow-sm transition-transform hover:brightness-110 active:scale-[0.98]"
        >
          <StarIcon />
          Star muhammaddadu/second-brain
        </a>
      </div>
    </section>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z" />
    </svg>
  );
}
