import { asset } from '../lib/assets';
import { GITHUB_URL, RELEASES_URL } from '../lib/downloads';

export function Footer() {
  return (
    <footer className="border-t border-edge px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <img src={asset('icon.webp')} alt="" width={22} height={22} className="rounded" />
          <div>
            <p className="font-serif text-sm font-semibold text-ink">Second Brain</p>
            <p className="text-xs text-muted">A digital self, in files you own.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href={GITHUB_URL}
            className="text-muted no-underline hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            className="text-muted no-underline hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            Releases
          </a>
          <a
            href={`${GITHUB_URL}/blob/main/docs/guides/getting-started.md`}
            className="text-muted no-underline hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  );
}
