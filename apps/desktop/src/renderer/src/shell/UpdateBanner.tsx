/**
 * A quiet toast shown when auto-update has downloaded a newer version. The owner restarts on their
 * own terms (no surprise relaunch) — or dismisses and it installs on next quit. Only ever appears
 * in packaged builds, where the updater runs.
 */
import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../../shared/ipc';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return window.vault.onUpdateStatus((s) => {
      setStatus(s);
      if (s.state === 'ready') setDismissed(false);
    });
  }, []);

  if (status.state !== 'ready' || dismissed) return null;

  return (
    <div
      role="status"
      data-testid="update-banner"
      className="border-edge bg-raised animate-pop fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-md"
    >
      <Sparkles size={16} className="text-accent shrink-0" aria-hidden />
      <span className="text-ink text-sm">
        {status.version ? `Version ${status.version} is ready.` : 'An update is ready.'}
      </span>
      <button
        type="button"
        onClick={() => void window.vault.installUpdate()}
        className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-xs font-medium"
      >
        Restart to update
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="Later"
        aria-label="Dismiss"
        className="text-faint hover:text-ink shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}
