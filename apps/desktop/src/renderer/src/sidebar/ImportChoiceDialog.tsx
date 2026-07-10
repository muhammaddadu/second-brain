/**
 * Asked when spreadsheet files (CSV/XLSX) are dropped: import them as a **database** (a folder of
 * rows you can sort/filter/board) or as a **note** (a table). The recommendation comes from the
 * data shape (small table → database, large dump → note); the owner decides. Keyboard: Esc cancels.
 */

import { Database, FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FileImportPlan } from '../../../shared/ipc';

export function ImportChoiceDialog({
  plans,
  onChoose,
  onCancel,
}: {
  plans: FileImportPlan[];
  onChoose: (mode: 'database' | 'note') => void;
  onCancel: () => void;
}) {
  const recommend = plans[0]?.recommendation ?? 'database';
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-recommended="true"]')?.focus();
    return () => prev?.focus?.();
  }, []);

  const Option = ({
    mode,
    icon,
    title,
    blurb,
  }: {
    mode: 'database' | 'note';
    icon: React.ReactNode;
    title: string;
    blurb: string;
  }) => (
    <button
      type="button"
      data-recommended={mode === recommend}
      data-testid={`import-as-${mode}`}
      onClick={() => onChoose(mode)}
      className={`flex flex-1 flex-col gap-1 rounded-xl border p-3 text-left ${
        mode === recommend ? 'border-accent bg-accent/5' : 'border-edge hover:border-accent/40'
      }`}
    >
      <span className="text-ink flex items-center gap-2 text-sm font-medium">
        {icon} {title}
        {mode === recommend && (
          <span className="text-accent ml-auto text-[10px] uppercase">Recommended</span>
        )}
      </span>
      <span className="text-muted text-xs leading-relaxed">{blurb}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc handled on the dialog */}
      <div className="absolute inset-0 bg-black/25" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import spreadsheet"
        data-testid="import-choice"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="border-edge bg-raised animate-pop relative w-full max-w-md rounded-xl border p-5 shadow-md"
      >
        <h2 className="text-ink font-serif text-lg font-semibold">
          Import {plans.length > 1 ? `${plans.length} spreadsheets` : 'spreadsheet'}
        </h2>
        <p className="text-muted mt-1 text-xs leading-relaxed">{plans[0]?.reason}</p>
        <div className="mt-4 flex gap-3">
          <Option
            mode="database"
            icon={<Database size={15} className="text-accent" />}
            title="Database"
            blurb="A folder of rows you can sort, filter, and view as a board. Best for lists you'll work with."
          />
          <Option
            mode="note"
            icon={<FileText size={15} className="text-accent" />}
            title="Note"
            blurb="A single note with a table. Fast, tidy, and best for large or reference data."
          />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-muted hover:text-ink px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
