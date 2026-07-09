/**
 * Right-panel note view. E1 is read-only: fetch the selected note through the vault bridge and
 * render its title, tags, and body. In-place BlockNote editing + autosave is E2; the live
 * external-change conflict prompt is E3.
 */
import type { NoteEnvelope } from '@brain/core';
import { useEffect, useState } from 'react';
import { RenderBlocks } from './blocks/RenderBlocks';

const NOTE_EXTENSION = '.note.json';

function filenameTitle(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.endsWith(NOTE_EXTENSION) ? base.slice(0, -NOTE_EXTENSION.length) : base;
}

export function NoteView({ path }: { path: string | null }) {
  const [note, setNote] = useState<NoteEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setNote(null);
      return;
    }
    let cancelled = false;
    setNote(null);
    setError(null);
    window.vault
      .readNote(path)
      .then((n) => {
        if (!cancelled) setNote(n);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) {
    return (
      <div className="text-muted flex h-full items-center justify-center px-8 text-center">
        <p>Select a note from the tree to read it.</p>
      </div>
    );
  }
  if (error) {
    return <div className="text-muted px-10 py-8">Couldn’t open note: {error}</div>;
  }
  if (!note) {
    return <div className="text-muted px-10 py-8">Loading…</div>;
  }

  const title =
    typeof note.meta.title === 'string' && note.meta.title ? note.meta.title : filenameTitle(path);
  const tags = Array.isArray(note.meta.tags) ? note.meta.tags : [];

  return (
    <article className="mx-auto max-w-3xl px-10 py-8">
      <h1 className="font-serif text-3xl font-semibold" data-testid="note-title">
        {title}
      </h1>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="bg-surface text-muted rounded-full px-2 py-0.5 text-xs">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-6">
        <RenderBlocks blocks={note.blocks} />
      </div>
    </article>
  );
}
