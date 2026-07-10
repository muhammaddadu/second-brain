/**
 * Database views (E8, ADR 0004): a folder with a `database.json` renders as a table (columns =
 * properties, rows = notes, inline cell editing) or a board (grouped by a select property, cards
 * draggable between columns). Rows are ordinary notes — clicking one opens its page. All writes go
 * through core via IPC; this component owns only presentation state.
 */
import type { DatabaseRow, DatabaseSchema, PropertyDef, PropertyType } from '@brain/core';
import { Columns3, Plus, Table2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { windowRange } from './table-window';

// Fixed row height (px) so the table can virtualize by row index. Rows are single-line and clip
// overflow to keep this honest; if the row styling changes, keep this in sync.
const ROW_HEIGHT = 33;
// Below this many rows, virtualization isn't worth the spacer rows / scroll bookkeeping.
const VIRTUALIZE_THRESHOLD = 100;

const PROPERTY_TYPE_OPTIONS: Array<{ value: PropertyType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multiSelect', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
];

/** The column a board card belongs to (a select value, or the "none" bucket). */
const UNGROUPED = '__none__';

export function DatabaseView({
  folder,
  onOpenNote,
}: {
  folder: string;
  onOpenNote: (path: string) => void;
}) {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [rows, setRows] = useState<DatabaseRow[]>([]);
  const [view, setView] = useState<'table' | 'board'>('table');
  const [addingProperty, setAddingProperty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef<string | null>(null); // row path being dragged (board)

  const refresh = useCallback(async () => {
    try {
      setSchema(await window.vault.getDatabase(folder));
      setRows(await window.vault.listRows(folder));
    } catch (err) {
      console.error(err);
    }
  }, [folder]);

  useEffect(() => {
    void refresh();
    // Rows are notes — external/agent edits arrive via the watcher like everywhere else.
    return window.vault.onVaultChange(() => void refresh());
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const groupBy =
    schema?.properties.find(
      (p) => p.id === schema.views.find((v) => v.type === 'board')?.groupBy,
    ) ?? schema?.properties.find((p) => p.type === 'select');

  if (!schema) {
    return (
      <div className="text-muted flex h-full items-center justify-center text-sm">
        Not a database (no database.json).
      </div>
    );
  }

  return (
    <div className="animate-fade flex h-full flex-col" data-testid="database-view">
      <div className="border-edge flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <h1 className="font-serif text-xl font-semibold">{folder.split('/').pop() || folder}</h1>
        <div className="border-edge bg-surface flex gap-1 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setView('table')}
            aria-current={view === 'table'}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${view === 'table' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            <Table2 size={13} /> Table
          </button>
          <button
            type="button"
            onClick={() => setView('board')}
            aria-current={view === 'board'}
            data-testid="board-toggle"
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${view === 'board' ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            <Columns3 size={13} /> Board
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddingProperty(true)}
            data-testid="add-property"
            className="border-edge text-muted hover:text-ink hover:border-accent/40 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
          >
            <Plus size={13} /> Property
          </button>
          <button
            type="button"
            onClick={() => void run(() => window.vault.newNote(folder))}
            data-testid="add-row"
            className="bg-accent text-accent-ink flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
          >
            <Plus size={13} /> New row
          </button>
        </div>
      </div>

      {error && (
        <div className="text-accent border-edge border-b px-6 py-2 text-xs" role="alert">
          {error}
        </div>
      )}

      {addingProperty && (
        <AddPropertyForm
          onCancel={() => setAddingProperty(false)}
          onAdd={(name, type, options) =>
            void run(async () => {
              await window.vault.addProperty(folder, name, type, options);
              setAddingProperty(false);
            })
          }
        />
      )}

      <div className={`min-h-0 flex-1 ${view === 'table' ? '' : 'overflow-auto px-6 py-4'}`}>
        {view === 'table' ? (
          <TableView
            schema={schema}
            rows={rows}
            onOpenNote={onOpenNote}
            onSetValue={(path, propertyId, value) =>
              void run(() => window.vault.setRowProperty(folder, path, propertyId, value))
            }
          />
        ) : groupBy ? (
          <BoardView
            groupBy={groupBy}
            rows={rows}
            onOpenNote={onOpenNote}
            dragging={dragging}
            onMove={(path, value) =>
              void run(() => window.vault.setRowProperty(folder, path, groupBy.id, value))
            }
          />
        ) : (
          <p className="text-muted text-sm">
            Add a <strong>select</strong> property to group the board by.
          </p>
        )}
      </div>
    </div>
  );
}

function AddPropertyForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, type: PropertyType, options?: string[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType>('text');
  const [options, setOptions] = useState('');
  const needsOptions = type === 'select' || type === 'multiSelect';
  return (
    <div className="border-edge bg-surface/60 flex flex-wrap items-end gap-3 border-b px-6 py-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted font-medium">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="property-name"
          className="border-edge bg-raised text-ink rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted font-medium">Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType)}
          data-testid="property-type"
          className="border-edge bg-raised text-ink rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        >
          {PROPERTY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {needsOptions && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted font-medium">Options (comma-separated)</span>
          <input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="Todo, Doing, Done"
            data-testid="property-options"
            className="border-edge bg-raised text-ink rounded-lg border px-2.5 py-1.5 text-sm outline-none"
          />
        </label>
      )}
      <button
        type="button"
        disabled={!name.trim() || (needsOptions && !options.trim())}
        onClick={() =>
          onAdd(
            name.trim(),
            type,
            needsOptions
              ? options
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
          )
        }
        data-testid="property-save"
        className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted hover:text-ink px-2 py-1.5 text-sm"
      >
        Cancel
      </button>
    </div>
  );
}

function TableView({
  schema,
  rows,
  onOpenNote,
  onSetValue,
}: {
  schema: DatabaseSchema;
  rows: DatabaseRow[];
  onOpenNote: (path: string) => void;
  onSetValue: (path: string, propertyId: string, value: unknown) => void;
}) {
  // Own the scroll container so we can virtualize: track scrollTop + viewport height and render
  // only the rows in view. Small tables skip windowing entirely (start=0, end=rows.length).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const virtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const win = virtualize
    ? windowRange(rows.length, ROW_HEIGHT, scrollTop, viewportH)
    : { start: 0, end: rows.length, padTop: 0, padBottom: 0 };
  const visible = rows.slice(win.start, win.end);
  const colSpan = schema.properties.length + 1;

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => virtualize && setScrollTop(e.currentTarget.scrollTop)}
      className="h-full overflow-auto px-6 py-4"
      data-testid="database-scroll"
    >
      <table className="w-full border-collapse text-sm" data-testid="database-table">
        <thead>
          <tr className="border-edge border-b">
            <th className="text-faint px-2 py-1.5 text-left text-xs font-medium tracking-wide uppercase">
              Title
            </th>
            {schema.properties.map((p) => (
              <th
                key={p.id}
                className="text-faint px-2 py-1.5 text-left text-xs font-medium tracking-wide uppercase"
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {win.padTop > 0 && (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: win.padTop, padding: 0 }} />
            </tr>
          )}
          {visible.map((row) => (
            <tr
              key={row.path}
              className="border-edge/60 hover:bg-surface/50 border-b"
              style={{ height: ROW_HEIGHT }}
            >
              <td className="px-2 py-1">
                <button
                  type="button"
                  onClick={() => onOpenNote(row.path)}
                  className="text-ink hover:text-accent block max-w-[16rem] truncate text-left font-medium"
                >
                  {row.title}
                </button>
              </td>
              {schema.properties.map((p) => (
                <td key={p.id} className="px-2 py-1">
                  <Cell
                    def={p}
                    value={row.properties[p.id]}
                    onChange={(value) => onSetValue(row.path, p.id, value)}
                  />
                </td>
              ))}
            </tr>
          ))}
          {win.padBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: win.padBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One editable cell, rendered per property type; commits on change/blur. */
function Cell({
  def,
  value,
  onChange,
}: {
  def: PropertyDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [local, setLocal] = useState(value == null ? '' : String(value));
  useEffect(
    () => setLocal(value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value)),
    [value],
  );

  switch (def.type) {
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-accent h-3.5 w-3.5"
        />
      );
    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="border-edge bg-transparent text-ink w-full rounded border-none py-0.5 text-sm outline-none"
          data-testid={`cell-${def.name}`}
        >
          <option value="">—</option>
          {(def.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      // text / url / number / date / multiSelect (CSV) — commit on blur or Enter.
      return (
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const trimmed = local.trim();
            if (
              trimmed ===
              (value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value))
            )
              return;
            if (!trimmed) return onChange(null);
            if (def.type === 'multiSelect') {
              return onChange(
                trimmed
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
            }
            onChange(def.type === 'number' ? Number(trimmed) : trimmed);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="—"
          data-testid={`cell-${def.name}`}
          className="text-ink placeholder:text-faint w-full bg-transparent py-0.5 text-sm outline-none"
        />
      );
  }
}

function BoardView({
  groupBy,
  rows,
  onOpenNote,
  onMove,
  dragging,
}: {
  groupBy: PropertyDef;
  rows: DatabaseRow[];
  onOpenNote: (path: string) => void;
  onMove: (path: string, value: string | null) => void;
  dragging: React.MutableRefObject<string | null>;
}) {
  const columns = [...(groupBy.options ?? []), UNGROUPED];
  const inColumn = (col: string) =>
    rows.filter((r) =>
      col === UNGROUPED ? r.properties[groupBy.id] == null : r.properties[groupBy.id] === col,
    );
  return (
    <div className="flex min-h-full items-start gap-4" data-testid="database-board">
      {columns.map((col) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: drop target column
        <div
          key={col}
          data-testid={`board-column-${col === UNGROUPED ? 'none' : col}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging.current) onMove(dragging.current, col === UNGROUPED ? null : col);
            dragging.current = null;
          }}
          className="border-edge bg-surface/40 w-56 shrink-0 rounded-xl border p-2"
        >
          <div className="text-faint mb-2 px-1 text-xs font-medium tracking-wide uppercase">
            {col === UNGROUPED ? `No ${groupBy.name}` : col}
            <span className="ml-1.5">{inColumn(col).length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {inColumn(col).map((row) => (
              <button
                key={row.path}
                type="button"
                draggable
                onDragStart={() => {
                  dragging.current = row.path;
                }}
                onClick={() => onOpenNote(row.path)}
                className="border-edge bg-raised text-ink hover:border-accent/40 cursor-grab rounded-lg border px-2.5 py-2 text-left text-sm shadow-sm"
              >
                {row.title}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
