import { type PlatformId, RELEASES_URL, type ReleaseInfo } from '../lib/downloads';
import { useReveal } from '../lib/useReveal';

type DownloadProps = {
  release: ReleaseInfo | null;
  detected: PlatformId;
  loading: boolean;
};

export function Download({ release, detected, loading }: DownloadProps) {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="download"
      ref={ref}
      className="border-t border-edge bg-surface/40 px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Download
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Straight from GitHub Releases to the installer file.
            {release ? (
              <>
                {' '}
                Current:{' '}
                <a
                  href={release.htmlUrl}
                  className="text-accent no-underline hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {release.tag}
                </a>
              </>
            ) : null}
          </p>
        </div>

        <div
          className={`reveal mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2 ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          {loading && !release ? (
            <p className="col-span-full text-center text-sm text-muted">Loading latest release…</p>
          ) : null}

          {release?.downloads.map((d) => {
            const recommended = d.id === detected;
            return (
              <a
                key={d.id}
                href={d.url}
                className={`group flex items-center justify-between gap-4 rounded-xl border px-5 py-4 no-underline transition-colors ${
                  recommended
                    ? 'border-accent/50 bg-accent/10 hover:bg-accent/15'
                    : 'border-edge bg-raised hover:border-accent/35'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{d.label}</span>
                    {recommended ? (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent">
                        For you
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{d.detail}</p>
                </div>
                <span className="text-sm font-medium text-accent opacity-80 transition-opacity group-hover:opacity-100">
                  ↓
                </span>
              </a>
            );
          })}

          {!loading && (!release || release.downloads.length === 0) ? (
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="col-span-full rounded-xl border border-edge bg-raised px-5 py-4 text-center font-semibold text-ink no-underline hover:border-accent/40"
            >
              Open latest release on GitHub →
            </a>
          ) : null}
        </div>

        <p
          className={`reveal mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-faint ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '180ms' : '0ms' }}
        >
          Builds are not code-signed yet. On macOS, right-click → Open the first time, or run{' '}
          <code className="rounded bg-surface px-1 py-0.5 text-[11px] text-muted">
            xattr -cr &quot;/Applications/Second Brain.app&quot;
          </code>{' '}
          if Gatekeeper says the app is damaged. On Windows SmartScreen: More info → Run anyway.
        </p>
      </div>
    </section>
  );
}
