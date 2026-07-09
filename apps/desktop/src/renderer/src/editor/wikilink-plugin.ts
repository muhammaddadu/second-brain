/**
 * Non-destructive wikilink rendering for the BlockNote editor (ADR 0010). A ProseMirror plugin
 * decorates every `[[target]]` in the document as a clickable link **without changing the document**
 * — so the note stays plain `[[...]]` text on disk (no round-trip, no data-loss risk), and an
 * agent's raw `[[...]]` renders identically. Resolution runs client-side against a live note list
 * (paths + titles), so resolved and unresolved links are styled differently and clicks route.
 */
import type { NoteRef } from '@brain/core/wikilinks';
import { parseWikilinks, resolveWikilink } from '@brain/core/wikilinks';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const wikilinkPluginKey = new PluginKey<DecorationSet>('second-brain-wikilinks');

export interface WikilinkHandlers {
  /** A live view of the vault's notes for resolution; read fresh on every decoration pass. */
  getNotes: () => readonly NoteRef[];
  /** Resolved link clicked → open that note. */
  onNavigate: (path: string) => void;
  /** Unresolved link clicked → offer to create a note at `target`. */
  onCreateMissing: (target: string) => void;
}

/** Decorations for every `[[...]]` run in the document, resolved vs unresolved. */
function buildDecorations(doc: PMNode, notes: readonly NoteRef[]): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const link of parseWikilinks(node.text)) {
      const from = pos + link.index;
      const to = from + link.raw.length;
      const resolved = resolveWikilink(link.target, notes) !== null;
      decorations.push(
        Decoration.inline(from, to, {
          class: resolved ? 'wikilink' : 'wikilink wikilink-unresolved',
          'data-target': link.target,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

export function wikilinkPlugin(handlers: WikilinkHandlers): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: wikilinkPluginKey,
    state: {
      init: (_config, state) => buildDecorations(state.doc, handlers.getNotes()),
      apply(tr, old, _oldState, newState) {
        // Recompute on a doc edit or a forced refresh (the note list changed); else reuse.
        if (!tr.docChanged && tr.getMeta(wikilinkPluginKey) === undefined) return old;
        return buildDecorations(newState.doc, handlers.getNotes());
      },
    },
    props: {
      decorations(state) {
        return wikilinkPluginKey.getState(state);
      },
      handleClickOn(_view, _pos, _node, _nodePos, event) {
        const el = (event.target as HTMLElement | null)?.closest('.wikilink');
        const target = el instanceof HTMLElement ? el.dataset.target : undefined;
        if (!target) return false;
        const resolved = resolveWikilink(target, handlers.getNotes());
        if (resolved) handlers.onNavigate(resolved);
        else handlers.onCreateMissing(target);
        return true; // consume the click (don't drop the caret inside the link)
      },
    },
  });
}
