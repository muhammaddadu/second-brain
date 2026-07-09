/**
 * ⌘K command palette (E4) — type to full-text search the vault, arrow/enter to open a note. Results
 * come from the derived index in core via `window.vault.search`; this component is a thin, keyboard-
 * first shell (open handling lives in the workspace). Snippets arrive with matched terms wrapped in
 * private-use markers from the core index and are rendered highlighted.
 */
import type { SearchHit } from '@brain/core';
import { noteDisplayName, SNIPPET_CLOSE, SNIPPET_OPEN } from '@brain/core/paths';
import { FileText, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 120;

// Core wraps matched terms in the private-use snippet markers; split on them to highlight runs.
const SNIPPET_SPLIT = new RegExp(`${SNIPPET_OPEN}(.*?)${SNIPPET_CLOSE}`, 'g');

/** Split an FTS snippet on the match markers into highlighted / plain runs. */
function renderSnippet(snippet: string) {
  const parts = snippet.split(SNIPPET_SPLIT);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: positional snippet runs
      <mark key={i} className="bg-accent/20 text-ink rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: positional snippet runs
      <span key={i}>{part}</span>
    ),
  );
}

/** The folder a note lives in, for context under its title (empty at the vault root). */
function folderOf(path: string): string {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  return dir;
}

export function SearchPalette({
  onClose,
  onOpenNote,
}: {
  onClose: () => void;
  onOpenNote: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Debounced search as the query changes; empty query clears results. `cancelled` guards against
  // out-of-order responses: a slow reply for an earlier keystroke must not overwrite a newer one.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setActive(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await window.vault.search(trimmed);
        if (cancelled) return;
        setHits(results);
        setActive(0);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setHits([]);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Focus the input on open; restore focus to whatever was focused (the trigger) on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  function choose(hit: SearchHit | undefined) {
    if (!hit) return;
    onOpenNote(hit.path);
    onClose();
  }

  // Keep Tab focus inside the modal (a bare aria-modal doesn't trap focus on its own).
  function trapFocus(e: React.KeyboardEvent) {
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeEl = document.activeElement;
    if (e.shiftKey && activeEl === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === 'Tab') {
      trapFocus(e);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled on the input below */}
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <div
        ref={dialogRef}
        className="border-edge bg-raised animate-pop relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-md"
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        data-testid="search-palette"
      >
        <div className="border-edge flex items-center gap-2.5 border-b px-4 py-3">
          <Search size={16} className="text-faint shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your notes…"
            aria-label="Search notes"
            data-testid="search-input"
            className="text-ink placeholder:text-faint w-full border-none bg-transparent text-base outline-none"
          />
          <kbd className="text-faint border-edge rounded border px-1.5 py-0.5 text-[10px] font-sans">
            Esc
          </kbd>
        </div>

        {query.trim() && (
          <ul className="max-h-[52vh] overflow-y-auto py-1" data-testid="search-results">
            {hits.length === 0 ? (
              <li className="text-muted px-4 py-6 text-center text-sm">
                No notes match “{query.trim()}”.
              </li>
            ) : (
              hits.map((hit, i) => {
                const folder = folderOf(hit.path);
                return (
                  <li key={hit.path}>
                    <button
                      type="button"
                      onClick={() => choose(hit)}
                      onMouseMove={() => setActive(i)}
                      aria-current={i === active}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left ${
                        i === active ? 'bg-accent/10' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FileText
                          size={14}
                          strokeWidth={1.75}
                          className={i === active ? 'text-accent' : 'text-faint'}
                          aria-hidden
                        />
                        <span className="text-ink truncate font-medium">
                          {hit.title || noteDisplayName(hit.path)}
                        </span>
                        {folder && <span className="text-faint truncate text-xs">· {folder}</span>}
                      </span>
                      {hit.snippet && (
                        <span className="text-muted line-clamp-2 pl-6 text-xs leading-relaxed">
                          {renderSnippet(hit.snippet)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
