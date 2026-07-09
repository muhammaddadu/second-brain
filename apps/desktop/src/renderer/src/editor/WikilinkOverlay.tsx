/**
 * Wires wikilink behaviour onto a BlockNote editor and renders the `[[` autocomplete popover.
 * Registers the non-destructive decoration plugin (clickable links; ADR 0010) and watches the
 * caret for an open `[[query` to suggest notes — selecting one inserts `[[Folder/Note]]` as plain
 * text. Rendering-only: it never mutates stored content except the explicit insert the user picks.
 */

import { NOTE_EXTENSION, noteDisplayName } from '@brain/core/paths';
import type { NoteRef } from '@brain/core/wikilinks';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { wikilinkPlugin, wikilinkPluginKey } from './wikilink-plugin';

const MAX_SUGGESTIONS = 8;
const OPEN_QUERY_RE = /\[\[([^\][\n]*)$/;

interface OpenState {
  query: string;
  /** Document range of `[[query` (replaced on select). */
  from: number;
  to: number;
  coords: { left: number; bottom: number };
}

/** The link target we write for a note: its vault path without the extension (e.g. People/Robert). */
function targetFor(path: string): string {
  return path.endsWith(NOTE_EXTENSION) ? path.slice(0, -NOTE_EXTENSION.length) : path;
}

export function WikilinkOverlay({
  editor,
  notes,
  onNavigate,
  onCreateMissing,
}: {
  editor: { _tiptapEditor: TiptapEditor };
  notes: readonly NoteRef[];
  onNavigate: (path: string) => void;
  onCreateMissing: (target: string) => void;
}) {
  const notesRef = useRef<readonly NoteRef[]>(notes);
  notesRef.current = notes;
  const handlers = useRef({ onNavigate, onCreateMissing });
  handlers.current = { onNavigate, onCreateMissing };

  const [open, setOpen] = useState<OpenState | null>(null);
  const [active, setActive] = useState(0);

  // Register the decoration/click plugin once; it reads notes + handlers through the refs.
  useEffect(() => {
    const tt = editor._tiptapEditor;
    const plugin = wikilinkPlugin({
      getNotes: () => notesRef.current,
      onNavigate: (p) => handlers.current.onNavigate(p),
      onCreateMissing: (t) => handlers.current.onCreateMissing(t),
    });
    tt.registerPlugin(plugin);
    return () => {
      tt.unregisterPlugin(wikilinkPluginKey);
    };
  }, [editor]);

  // Re-decorate when the note list changes (links may resolve/unresolve without a doc edit).
  useEffect(() => {
    const view = editor._tiptapEditor.view;
    if (view.isDestroyed) return;
    view.dispatch(view.state.tr.setMeta(wikilinkPluginKey, 'refresh'));
  }, [editor]);

  // Track an open `[[query` at the caret to drive the picker.
  useEffect(() => {
    const tt = editor._tiptapEditor;
    const check = () => {
      const view = tt.view;
      const { selection } = view.state;
      if (!selection.empty) return setOpen(null);
      const $from = selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const match = OPEN_QUERY_RE.exec(before);
      if (!match) return setOpen(null);
      const caret = selection.from;
      const coords = view.coordsAtPos(caret);
      setActive(0);
      setOpen({
        query: match[1] ?? '',
        from: caret - match[0].length,
        to: caret,
        coords: { left: coords.left, bottom: coords.bottom },
      });
    };
    tt.on('update', check);
    tt.on('selectionUpdate', check);
    return () => {
      tt.off('update', check);
      tt.off('selectionUpdate', check);
    };
  }, [editor]);

  const query = open?.query.toLowerCase() ?? '';
  const suggestions = open
    ? notes
        .filter(
          (n) =>
            !query ||
            n.path.toLowerCase().includes(query) ||
            (n.title ?? '').toLowerCase().includes(query),
        )
        .slice(0, MAX_SUGGESTIONS)
    : [];

  function choose(note: NoteRef) {
    if (!open) return;
    const view = editor._tiptapEditor.view;
    view.dispatch(view.state.tr.insertText(`[[${targetFor(note.path)}]]`, open.from, open.to));
    view.focus();
    setOpen(null);
  }

  // Keyboard: capture arrows/enter/escape before ProseMirror while the picker is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-bind when suggestions/active change
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && suggestions[active]) {
        e.preventDefault();
        e.stopPropagation();
        choose(suggestions[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, active, suggestions]);

  if (!open || suggestions.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Link to a note"
      data-testid="wikilink-menu"
      className="border-edge bg-raised animate-pop fixed z-50 max-h-64 w-72 overflow-y-auto rounded-lg border py-1 shadow-md"
      style={{ left: open.coords.left, top: open.coords.bottom + 4 }}
    >
      {suggestions.map((note, i) => {
        const folder = note.path.includes('/')
          ? note.path.slice(0, note.path.lastIndexOf('/'))
          : '';
        return (
          <button
            key={note.path}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault(); // keep editor focus/selection so the insert range stays valid
              choose(note);
            }}
            onMouseMove={() => setActive(i)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
              i === active ? 'bg-accent/10' : ''
            }`}
          >
            <FileText
              size={14}
              className={i === active ? 'text-accent' : 'text-faint'}
              aria-hidden
            />
            <span className="text-ink truncate">{note.title || noteDisplayName(note.path)}</span>
            {folder && <span className="text-faint ml-auto shrink-0 text-xs">{folder}</span>}
          </button>
        );
      })}
    </div>
  );
}
