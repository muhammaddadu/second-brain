/**
 * BlockNote editor host (E2 + E3). Loads the note's native blocks, edits richly, and autosaves
 * (debounced) via a *guarded* save: the write only lands if the file still matches the hash we
 * read (ADR 0002). If the note changed on disk — an agent, a git pull, another editor — the save
 * reports a conflict (or the watcher tells us), and we surface Reload / Keep-mine rather than
 * silently clobbering either version. Blocks are persisted verbatim (ADR 0001).
 */
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { filterSuggestionItems, type PartialBlock } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import type { NoteEnvelope } from '@brain/core';
import { noteDisplayName } from '@brain/core/paths';
import type { NoteRef } from '@brain/core/wikilinks';
import { AlertTriangle, Workflow } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Backlinks } from './Backlinks';
import { ConflictDiff } from './ConflictDiff';
import { editorSchema } from './editorSchema';
import { RelatedNotes } from './RelatedNotes';
import { TagEditor } from './TagEditor';
import { WikilinkOverlay } from './WikilinkOverlay';

const STARTER_DIAGRAM = 'graph TD\n  A[Start] --> B[End]';

const AUTOSAVE_MS = 600;

const prefersDark =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

interface NoteEditorProps {
  path: string;
  note: NoteEnvelope;
  initialHash: string;
  /** Open another note (wikilink navigation). */
  onOpenNote: (path: string) => void;
  onReload: () => void;
  /** Called with the new path when editing the title renamed the note's file. */
  onRenamed: (newPath: string) => void;
}

export function NoteEditor({
  path,
  note,
  initialHash,
  onOpenNote,
  onReload,
  onRenamed,
}: NoteEditorProps) {
  const initialContent =
    Array.isArray(note.blocks) && note.blocks.length > 0
      ? (note.blocks as PartialBlock[])
      : undefined;
  const editor = useCreateBlockNote({
    schema: editorSchema,
    ...(initialContent ? { initialContent } : {}),
  });

  const hashRef = useRef(initialHash);
  // Every hash *we* wrote. A watcher event whose hash is in here is our own save (regardless of
  // event ordering / races) and must never be mistaken for an external conflict.
  const ownHashes = useRef<Set<string>>(new Set([initialHash]));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  // The vault's notes (path + title) for wikilink resolution and the [[ picker; refreshed live.
  const [noteRefs, setNoteRefs] = useState<NoteRef[]>([]);
  useEffect(() => {
    const load = () => window.vault.noteRefs().then(setNoteRefs).catch(console.error);
    load();
    return window.vault.onVaultChange(load);
  }, []);

  function rememberOwnWrite(hash: string) {
    hashRef.current = hash;
    ownHashes.current.add(hash);
  }

  // A change to *this* note whose hash we did not produce is a genuine external edit.
  useEffect(() => {
    const unsubscribe = window.vault.onVaultChange((change) => {
      if (change.path === path && change.hash && !ownHashes.current.has(change.hash)) {
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
        if (result.status === 'saved') rememberOwnWrite(result.hash);
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
        rememberOwnWrite(result.hash);
        setConflict(false);
      }
    } catch (error) {
      // The note is gone on disk; a reload will surface the missing-note state.
      console.error(error);
    }
  }

  const initialTitle =
    typeof note.meta.title === 'string' && note.meta.title
      ? note.meta.title
      : noteDisplayName(path);
  const [titleValue, setTitleValue] = useState(initialTitle);
  const initialTags = Array.isArray(note.meta.tags)
    ? note.meta.tags.filter((t): t is string => typeof t === 'string')
    : [];

  async function commitTitle() {
    const next = titleValue.trim();
    if (!next || next === initialTitle) {
      setTitleValue(initialTitle);
      return;
    }
    try {
      const result = await window.vault.setTitle(path, next);
      // The title write (and any rename) changed the file's bytes — record the new hash as our own
      // so the watcher event doesn't read as an external conflict. Editor stays mounted.
      rememberOwnWrite((await window.vault.readNote(result.path)).hash);
      if (result.path !== path) onRenamed(result.path);
    } catch (error) {
      console.error(error);
      setTitleValue(initialTitle);
    }
  }

  return (
    <article className="animate-fade mx-auto max-w-3xl px-10 py-8">
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
              onClick={() => setShowDiff(true)}
              className="border-edge hover:bg-edge/50 rounded-lg border px-2.5 py-1 text-xs"
            >
              View diff
            </button>
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
      {showDiff && (
        <ConflictDiff
          path={path}
          mineBlocks={editor.document}
          onClose={() => setShowDiff(false)}
          onReload={() => {
            setShowDiff(false);
            onReload();
          }}
          onKeepMine={() => {
            setShowDiff(false);
            void keepMine();
          }}
        />
      )}
      <input
        data-testid="note-title"
        aria-label="Note title"
        value={titleValue}
        onChange={(e) => setTitleValue(e.target.value)}
        onBlur={() => void commitTitle()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setTitleValue(initialTitle);
            e.currentTarget.blur();
          }
        }}
        placeholder="Untitled"
        className="text-ink placeholder:text-faint w-full border-none bg-transparent font-serif text-3xl font-semibold outline-none"
      />
      <TagEditor path={path} initial={initialTags} onSaved={(hash) => rememberOwnWrite(hash)} />
      <div className="mt-6">
        <BlockNoteView
          editor={editor}
          theme={prefersDark ? 'dark' : 'light'}
          onChange={scheduleSave}
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...getDefaultReactSlashMenuItems(editor),
                  {
                    title: 'Mermaid diagram',
                    subtext: 'Flowchart, sequence, and more',
                    aliases: ['mermaid', 'diagram', 'chart', 'graph', 'flowchart'],
                    group: 'Other',
                    icon: <Workflow size={18} />,
                    onItemClick: () => {
                      editor.insertBlocks(
                        [
                          {
                            type: 'codeBlock',
                            props: { language: 'mermaid' },
                            content: STARTER_DIAGRAM,
                          },
                        ],
                        editor.getTextCursorPosition().block,
                        'after',
                      );
                    },
                  },
                ],
                query,
              )
            }
          />
        </BlockNoteView>
        <WikilinkOverlay
          editor={editor}
          notes={noteRefs}
          onNavigate={onOpenNote}
          onCreateMissing={(target) => {
            void window.vault
              .createNoteFromLink(target)
              .then((newPath) => onOpenNote(newPath))
              .catch(console.error);
          }}
        />
      </div>
      <Backlinks path={path} onOpenNote={onOpenNote} />
      <RelatedNotes path={path} onOpenNote={onOpenNote} />
    </article>
  );
}
