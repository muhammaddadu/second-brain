/**
 * A small confirmation dialog for destructive actions — nothing in the app deletes without one.
 * Keyboard-first: the confirm button is focused on open (Enter confirms), Escape cancels, and Tab
 * is contained to the two buttons.
 */
import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on the dialog */}
      <div className="absolute inset-0 bg-black/25" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
        data-testid="confirm-dialog"
        className="border-edge bg-raised animate-pop relative w-full max-w-sm rounded-xl border p-5 shadow-md"
      >
        <h2 className="text-ink font-serif text-lg font-semibold">{title}</h2>
        <p className="text-muted mt-1.5 text-sm leading-relaxed">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-muted hover:text-ink px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            data-testid="confirm-action"
            className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
