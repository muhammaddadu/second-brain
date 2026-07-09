/**
 * Conflict diff: when a note changed on disk while you had unsaved edits, show what differs between
 * the on-disk version and yours (a line diff of the notes' text) so you can decide — reload theirs,
 * or keep yours — with eyes open. Uses a readable plain-text projection of the blocks (structure
 * isn't line-diffable, but the prose is what people compare).
 */
import { diffLines } from 'diff';
import { useEffect, useState } from 'react';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Flatten a BlockNote document to plain text — one line per block, children indented. */
function blocksToPlainText(blocks: unknown, depth = 0): string {
  if (!Array.isArray(blocks)) return '';
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const text = Array.isArray(block.content)
      ? block.content.map((n) => (isRecord(n) && typeof n.text === 'string' ? n.text : '')).join('')
      : '';
    lines.push(pad + text);
    if (Array.isArray(block.children) && block.children.length > 0) {
      lines.push(blocksToPlainText(block.children, depth + 1));
    }
  }
  return lines.join('\n');
}

export function ConflictDiff({
  path,
  mineBlocks,
  onReload,
  onKeepMine,
  onClose,
}: {
  path: string;
  mineBlocks: unknown[];
  onReload: () => void;
  onKeepMine: () => void;
  onClose: () => void;
}) {
  const [theirsText, setTheirsText] = useState<string | null>(null);
  const mineText = blocksToPlainText(mineBlocks);

  useEffect(() => {
    window.vault
      .readNote(path)
      .then((r) => setTheirsText(blocksToPlainText(r.note.blocks)))
      .catch(() => setTheirsText(''));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [path, onClose]);

  const parts = theirsText === null ? [] : diffLines(theirsText, mineText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: closes on outside click; Esc handled above */}
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="border-edge bg-raised animate-pop relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-md"
        data-testid="conflict-diff"
      >
        <div className="border-edge border-b px-5 py-3">
          <h2 className="font-serif text-lg font-semibold">This note changed on disk</h2>
          <p className="text-muted mt-0.5 text-xs">
            Green is yours; red is the version on disk. Choose which to keep.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {theirsText === null ? (
            <p className="text-muted text-sm">Comparing…</p>
          ) : parts.length === 1 && !parts[0]?.added && !parts[0]?.removed ? (
            <p className="text-muted text-sm">
              No textual differences (block structure may differ).
            </p>
          ) : (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {parts.map((part, i) => {
                const cls = part.added
                  ? 'bg-green-500/12 text-green-800 dark:text-green-300'
                  : part.removed
                    ? 'bg-red-500/12 text-red-800 dark:text-red-300'
                    : 'text-muted';
                const mark = part.added ? '+ ' : part.removed ? '- ' : '  ';
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff parts are positional
                  <div key={i} className={cls}>
                    {part.value
                      .replace(/\n$/, '')
                      .split('\n')
                      .map((line, j) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                        <div key={j}>{mark + line}</div>
                      ))}
                  </div>
                );
              })}
            </pre>
          )}
        </div>

        <div className="border-edge flex justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReload}
            className="border-edge hover:bg-surface rounded-lg border px-3 py-1.5 text-sm"
          >
            Reload (use disk)
          </button>
          <button
            type="button"
            onClick={onKeepMine}
            className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm"
          >
            Keep mine
          </button>
        </div>
      </div>
    </div>
  );
}
