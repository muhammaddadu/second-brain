import { asset } from '../lib/assets';
import { GITHUB_URL, STAR_URL } from '../lib/downloads';
import { useTheme } from '../lib/theme';

export function Nav() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-edge/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5 no-underline">
          <img src={asset('icon.webp')} alt="" width={28} height={28} className="rounded-md" />
          <span className="font-serif text-lg font-semibold tracking-tight text-ink">
            Second Brain
          </span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          <a
            href="#vision"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted no-underline transition-colors hover:text-ink sm:inline"
          >
            Vision
          </a>
          <a
            href="#features"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted no-underline transition-colors hover:text-ink sm:inline"
          >
            Features
          </a>
          <a
            href="#download"
            className="rounded-md px-3 py-1.5 text-sm text-muted no-underline transition-colors hover:text-ink"
          >
            Download
          </a>
          <a
            href={STAR_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted no-underline transition-colors hover:text-ink sm:inline"
          >
            Star
          </a>
          <button
            type="button"
            onClick={toggle}
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-edge bg-raised text-ink transition-colors hover:border-accent/40"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-edge bg-raised text-ink transition-colors hover:border-accent/40"
            aria-label="GitHub repository"
          >
            <GitHubIcon />
          </a>
        </nav>
      </div>
    </header>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
    </svg>
  );
}
