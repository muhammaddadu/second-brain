/**
 * Inline "Importing…" indicator, driven by the main process's import progress. Shows that a
 * conversion/import is happening without blocking the UI, with a row count for big spreadsheets.
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ImportProgressStatus } from '../../../shared/ipc';

export function ImportProgress() {
  const [status, setStatus] = useState<ImportProgressStatus>({
    state: 'idle',
    done: 0,
    total: 0,
    label: '',
  });

  useEffect(() => window.vault.onImportStatus(setStatus), []);

  if (status.state !== 'importing') return null;

  return (
    <div
      role="status"
      data-testid="import-progress"
      className="border-edge bg-raised animate-pop fixed bottom-4 left-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-md"
    >
      <Loader2 size={15} className="text-accent shrink-0 animate-spin" aria-hidden />
      <span className="text-ink truncate text-sm">Importing… {status.label}</span>
      {status.total > 0 && (
        <span className="text-faint shrink-0 text-xs tabular-nums">
          {status.done}/{status.total}
        </span>
      )}
    </div>
  );
}
