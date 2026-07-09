/**
 * BlockNote editor host (E2). Loads the note's native blocks as initial content, edits richly,
 * and autosaves (debounced) back to the file via the vault bridge — blocks are persisted verbatim
 * (ADR 0001), so there is no conversion in the save path. Title is shown read-only (it falls back
 * to the filename); tags are editable via {@link TagEditor}.
 */
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import type { PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { NoteEnvelope } from '@brain/core';
import { useRef } from 'react';
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

export function NoteEditor({ path, note }: { path: string; note: NoteEnvelope }) {
  // useCreateBlockNote consumes initialContent only on mount; the parent remounts this component
  // (via `key={path}`) when the selection changes, so computing it each render is correct.
  const initialContent =
    Array.isArray(note.blocks) && note.blocks.length > 0
      ? (note.blocks as PartialBlock[])
      : undefined;
  const editor = useCreateBlockNote({
    schema: editorSchema,
    ...(initialContent ? { initialContent } : {}),
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void window.vault.saveBlocks(path, editor.document);
    }, AUTOSAVE_MS);
  }

  const title =
    typeof note.meta.title === 'string' && note.meta.title ? note.meta.title : filenameTitle(path);
  const initialTags = Array.isArray(note.meta.tags)
    ? note.meta.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return (
    <article className="mx-auto max-w-3xl px-10 py-8">
      <h1 className="font-serif text-3xl font-semibold" data-testid="note-title">
        {title}
      </h1>
      <TagEditor path={path} initial={initialTags} />
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
