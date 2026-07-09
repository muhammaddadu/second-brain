/**
 * Vault-wide wikilink relationships (ADR 0010) — derived by reading the notes, never stored: which
 * note links to which, plus the reverse (backlinks), and any targets that don't resolve. Feeds the
 * backlinks panel and the knowledge-graph link edges. Rebuildable from the files at any time.
 */
import { blocksToText } from './search.js';
import { collectNotePaths, listTree } from './tree.js';
import { readNote, type Vault } from './vault.js';
import { type NoteRef, resolveWikilink, wikilinkTargets } from './wikilinks.js';

/** A resolved link between two notes (vault paths). */
export interface VaultLink {
  from: string;
  to: string;
}

export interface VaultLinks {
  /** Every resolved note→note link. */
  links: VaultLink[];
  /** Links whose target matched no (unique) note — for surfacing "create it?" affordances. */
  unresolved: Array<{ from: string; target: string }>;
  /** All notes with titles, so callers can render refs without re-reading. */
  notes: NoteRef[];
}

/** Read every note once, extract + resolve its wikilinks. O(n) reads — fine for a personal vault. */
export async function collectVaultLinks(vault: Vault): Promise<VaultLinks> {
  const paths = collectNotePaths(await listTree(vault.root));
  const notes: NoteRef[] = [];
  const targetsByNote: Array<{ from: string; targets: string[] }> = [];
  for (const path of paths) {
    try {
      const note = await readNote(vault, path);
      const title = typeof note.meta.title === 'string' ? note.meta.title : undefined;
      notes.push({ path, title });
      targetsByNote.push({ from: path, targets: wikilinkTargets(blocksToText(note.blocks)) });
    } catch {
      // A note that fails to read simply contributes no links.
    }
  }
  const links: VaultLink[] = [];
  const unresolved: Array<{ from: string; target: string }> = [];
  for (const { from, targets } of targetsByNote) {
    for (const target of targets) {
      const to = resolveWikilink(target, notes);
      if (to && to !== from) links.push({ from, to });
      else if (!to) unresolved.push({ from, target });
    }
  }
  return { links, unresolved, notes };
}

/** Notes that link *to* `notePath` (its backlinks), with titles, sorted by path. */
export async function getBacklinks(vault: Vault, notePath: string): Promise<NoteRef[]> {
  const { links, notes } = await collectVaultLinks(vault);
  const titleOf = new Map(notes.map((n) => [n.path, n.title]));
  const sources = new Set(links.filter((l) => l.to === notePath).map((l) => l.from));
  return [...sources].sort().map((path) => ({ path, title: titleOf.get(path) }));
}
