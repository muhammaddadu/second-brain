/**
 * App-level undo/redo for **structural vault actions** (trash, move, rename) — distinct from the
 * editor's own text undo. Each action records how to reverse and replay itself; ⌘Z / ⌘⇧Z drive the
 * stacks, but only when focus isn't in a text field or the editor (so BlockNote's undo still works
 * while typing). A bounded stack keeps "undo N steps" honest without growing forever.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoAction {
  /** Human label for the toast, e.g. 'Deleted "Ideas"'. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_UNDO = 50;

function inTextField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

/** `onAfter` runs after any undo/redo so the caller can refresh the tree. */
export function useUndo(onAfter: () => void) {
  const undoStack = useRef<UndoAction[]>([]);
  const redoStack = useRef<UndoAction[]>([]);
  const [toast, setToast] = useState<{ text: string; canUndo: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, canUndo: boolean) => {
    setToast({ text, canUndo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const record = useCallback(
    (action: UndoAction) => {
      undoStack.current.push(action);
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
      redoStack.current = [];
      flash(action.label, true);
    },
    [flash],
  );

  const undo = useCallback(async () => {
    const action = undoStack.current.pop();
    if (!action) return;
    try {
      await action.undo();
      redoStack.current.push(action);
      flash(`Undone — ${action.label}`, false);
      onAfter();
    } catch (error) {
      console.error('undo failed', error);
      flash("Couldn't undo that", false);
    }
  }, [flash, onAfter]);

  const redo = useCallback(async () => {
    const action = redoStack.current.pop();
    if (!action) return;
    try {
      await action.redo();
      undoStack.current.push(action);
      flash(`Redone — ${action.label}`, true);
      onAfter();
    } catch (error) {
      console.error('redo failed', error);
    }
  }, [flash, onAfter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if (inTextField()) return; // let the editor / inputs handle their own undo while typing
      e.preventDefault();
      void (e.shiftKey ? redo() : undo());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { record, undo, redo, toast, dismiss: () => setToast(null) };
}
