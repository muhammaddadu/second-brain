/**
 * Right-panel note surface. Loads the selected note (and its content hash, the conflict-guard
 * baseline) through the vault bridge and hands it to the BlockNote editor.
 *
 * Two path changes are treated differently so the UI stays smooth:
 * - Switching to a *different* note, or resolving a conflict → reload + remount (fresh editor).
 * - A title-driven **rename** of the *current* note → the path changes but the content is the same,
 *   so we keep the editor mounted and just let the new path flow in (no blank, no flash).
 */
import type { NoteEnvelope } from '@brain/core';
import { NotebookPen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  // Bumped only on a real switch / reload — the editor is keyed by it, so a rename never remounts.
  const [mountKey, setMountKey] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  // When a rename is in flight, this holds the path we expect next so we can skip the reload.
  const renamedTo = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadNonce is an intentional re-read trigger
  useEffect(() => {
    if (!path) {
      setLoaded(null);
      return;
    }
    if (renamedTo.current === path) {
      // A rename of the current note: same content, new filename. Keep the editor mounted.
      renamedTo.current = null;
      return;
    }
    let cancelled = false;
    setError(null);
    setLoaded(null);
    setMountKey((k) => k + 1);
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
  }, [path, reloadNonce]);

  if (!path) {
    return (
      <div
        className="text-muted flex h-full flex-col items-center justify-center gap-3 px-8 text-center"
        data-testid="note-empty"
      >
        <NotebookPen size={28} strokeWidth={1.5} className="text-faint" aria-hidden />
        <p className="text-sm">Select a note from the tree to open it.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-muted mx-auto max-w-3xl px-10 py-8">Couldn’t open note: {error}</div>
    );
  }
  if (!loaded) {
    // Same container as the article so content doesn't jump in when it loads; a quiet placeholder.
    return <div className="mx-auto max-w-3xl px-10 py-8" aria-hidden />;
  }

  return (
    <NoteEditor
      key={mountKey}
      path={path}
      note={loaded.note}
      initialHash={loaded.hash}
      onReload={() => setReloadNonce((n) => n + 1)}
      onRenamed={(newPath) => {
        renamedTo.current = newPath; // skip the reload the route change would otherwise trigger
        onRenamed(newPath);
      }}
    />
  );
}
