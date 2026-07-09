/**
 * BlockNote editor host (E2 + E3). Loads the note's native blocks, edits richly, and autosaves
 * (debounced) via a *guarded* save: the write only lands if the file still matches the hash we
 * read (ADR 0002). If the note changed on disk — an agent, a git pull, another editor — the save
 * reports a conflict (or the watcher tells us), and we surface Reload / Keep-mine rather than
 * silently clobbering either version. Blocks are persisted verbatim (ADR 0001).
 */
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { NoteEnvelope } from '@brain/core';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { editorSchema } from './editorSchema';
import { TagEditor } from './TagEditor';

const AUTOSAVE_MS = 600;
const NOTE_EXTENSION = '.note.json';

const prefersDark =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

function filenameTitle(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.endsWith(NOTE_EXTENSION) ? base.slice(0, -NOTE_EXTENSION.length) : base;
}

interface NoteEditorProps {
  path: string;
  note: NoteEnvelope;
  initialHash: string;
  onReload: () => void;
}

export function NoteEditor({ path, note, initialHash, onReload }: NoteEditorProps) {
  const initialContent =
    Array.isArray(note.blocks) && note.blocks.length > 0
      ? (note.blocks as PartialBlock[])
      : undefined;
  const editor = useCreateBlockNote({
    schema: editorSchema,
    ...(initialContent ? { initialContent } : {}),
  });

  const hashRef = useRef(initialHash);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conflict, setConflict] = useState(false);

  // External change to *this* note (a different hash than our last known) → surface a conflict.
  useEffect(() => {
    const unsubscribe = window.vault.onVaultChange((change) => {
      if (change.path === path && change.hash && change.hash !== hashRef.current) {
        setConflict(true);
      }
    });
    return unsubscribe;
  }, [path]);

  function scheduleSave() {
    if (conflict) return; // don't overwrite until the user resolves the conflict
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const result = await window.vault.saveBlocks(path, editor.document, hashRef.current);
        if (result.status === 'saved') hashRef.current = result.hash;
        else setConflict(true);
      } catch (error) {
        // The note changed or vanished on disk mid-edit — surface it rather than silently losing work.
        console.error(error);
        setConflict(true);
      }
    }, AUTOSAVE_MS);
  }

  async function keepMine() {
    try {
      // Overwrite the on-disk version with ours (explicit, not silent): save against the latest hash.
      const latest = await window.vault.readNote(path);
      const result = await window.vault.saveBlocks(path, editor.document, latest.hash);
      if (result.status === 'saved') {
        hashRef.current = result.hash;
        setConflict(false);
      }
    } catch (error) {
      // The note is gone on disk; a reload will surface the missing-note state.
      console.error(error);
    }
  }

  const title =
    typeof note.meta.title === 'string' && note.meta.title ? note.meta.title : filenameTitle(path);
  const initialTags = Array.isArray(note.meta.tags)
    ? note.meta.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return (
    <article className="mx-auto max-w-3xl px-10 py-8">
      {conflict && (
        <div
          className="border-edge bg-surface mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
          data-testid="conflict-banner"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-accent shrink-0" aria-hidden />
            This note changed on disk.
          </span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onReload}
              className="border-edge hover:bg-edge/50 rounded-lg border px-2.5 py-1 text-xs"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => void keepMine()}
              className="bg-accent text-accent-ink rounded-lg px-2.5 py-1 text-xs"
            >
              Keep mine
            </button>
          </span>
        </div>
      )}
      <h1 className="font-serif text-3xl font-semibold" data-testid="note-title">
        {title}
      </h1>
      <TagEditor
        path={path}
        initial={initialTags}
        onSaved={(hash) => {
          hashRef.current = hash;
        }}
      />
      <div className="mt-6">
        <BlockNoteView
          editor={editor}
          theme={prefersDark ? 'dark' : 'light'}
          onChange={scheduleSave}
        />
      </div>
    </article>
  );
}
