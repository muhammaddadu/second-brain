/** Minimal "move to…" modal: pick a destination folder (or the vault root). Esc closes. */
import { useEffect } from 'react';

export function MoveDialog({
  noteName,
  folders,
  onPick,
  onClose,
}: {
  noteName: string;
  /** Vault-relative folder paths; the empty string represents the vault root. */
  folders: string[];
  onPick: (folder: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="border-edge bg-raised w-80 rounded-xl border p-4 shadow-md"
        data-testid="move-dialog"
      >
        <h2 className="font-serif text-lg font-semibold">Move “{noteName}”</h2>
        <p className="text-muted mt-1 text-xs">Choose a destination folder.</p>
        <ul className="border-edge mt-3 max-h-64 overflow-y-auto rounded border">
          {['', ...folders].map((folder) => (
            <li key={folder || '<root>'}>
              <button
                type="button"
                className="hover:bg-edge/60 block w-full px-3 py-1.5 text-left text-sm"
                onClick={() => onPick(folder)}
              >
                {folder === '' ? '/ (vault root)' : folder}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="text-muted hover:text-ink px-3 py-1 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
