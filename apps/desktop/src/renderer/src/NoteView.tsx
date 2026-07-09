/**
 * Right-panel note surface. Loads the selected note (and its content hash, the conflict-guard
 * baseline) through the vault bridge and hands it to the BlockNote editor. A reload counter lets
 * the editor request a fresh read after an external-change conflict is resolved (E3).
 */
import type { NoteEnvelope } from '@brain/core';
import { NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NoteEditor } from './NoteEditor';

export function NoteView({
  path,
  onRenamed,
}: {
  path: string | null;
  onRenamed: (newPath: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ note: NoteEnvelope; hash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional re-read trigger
  useEffect(() => {
    if (!path) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    setLoaded(null);
    setError(null);
    window.vault
      .readNote(path)
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  if (!path) {
    return (
      <div className="text-muted flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <NotebookPen size={28} strokeWidth={1.5} className="text-faint" aria-hidden />
        <p className="text-sm">Select a note from the tree to open it.</p>
      </div>
    );
  }
  if (error) {
    return <div className="text-muted px-10 py-8">Couldn’t open note: {error}</div>;
  }
  if (!loaded) {
    return <div className="text-muted px-10 py-8">Loading…</div>;
  }

  // key remounts the editor with fresh content on note switch or reload-after-conflict.
  return (
    <NoteEditor
      key={`${path}:${reloadKey}`}
      path={path}
      note={loaded.note}
      initialHash={loaded.hash}
      onReload={() => setReloadKey((k) => k + 1)}
      onRenamed={onRenamed}
    />
  );
}
