/**
 * Right-panel note surface. Loads the selected note through the vault bridge and hands it to the
 * BlockNote editor (E2 — rich, editable). The live external-change conflict prompt is E3.
 */
import type { NoteEnvelope } from '@brain/core';
import { useEffect, useState } from 'react';
import { NoteEditor } from './NoteEditor';

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
        <p>Select a note from the tree to open it.</p>
      </div>
    );
  }
  if (error) {
    return <div className="text-muted px-10 py-8">Couldn’t open note: {error}</div>;
  }
  if (!note) {
    return <div className="text-muted px-10 py-8">Loading…</div>;
  }

  // key={path} remounts the editor with fresh content when the selection changes.
  return <NoteEditor key={path} path={path} note={note} />;
}
