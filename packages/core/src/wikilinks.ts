/**
 * Wikilinks — `[[target]]` / `[[target|alias]]` references between notes (like Obsidian). They live
 * as **plain text inside the note document** (ADR 0010): agents write them with no schema
 * knowledge, they survive Markdown export unchanged, and the app recognizes and renders them.
 * Nothing here touches the filesystem — parsing and resolution are pure so every surface (editor
 * decoration, backlinks, graph) resolves links identically.
 */
import { NOTE_EXTENSION, noteDisplayName } from './paths.js';

/** One parsed reference: `target` is the link body; `alias` the optional display text after `|`. */
export interface WikiLink {
  /** The link target as written (path or title), with any `#heading` fragment stripped. */
  target: string;
  /** Display text (after `|`), or null when the link shows its target. */
  alias: string | null;
  /** The full matched source including brackets, e.g. `[[People/Robert Kohler|Rob]]`. */
  raw: string;
  /** Character offset of `raw` within the scanned string. */
  index: number;
}

/** A note as far as resolution cares: its vault path and (optional) display title. */
export interface NoteRef {
  path: string;
  title?: string | undefined;
}

// [[ ... ]] with no nested brackets. Group 1 is the inner body (target[|alias]).
const WIKILINK_RE = /\[\[([^\][]+)\]\]/g;

/** Extract every wikilink from a string, in order. */
export function parseWikilinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of text.matchAll(WIKILINK_RE)) {
    const body = match[1] ?? '';
    const pipe = body.indexOf('|');
    const rawTarget = (pipe === -1 ? body : body.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : body.slice(pipe + 1).trim() || null;
    // A `#heading` fragment isn't part of note resolution (headings aren't addressable yet).
    const target = rawTarget.split('#')[0]?.trim() ?? '';
    if (!target) continue;
    links.push({ target, alias, raw: match[0], index: match.index ?? 0 });
  }
  return links;
}

/** The vault path a target points at, `null` if nothing (or nothing unique) matches. */
export function resolveWikilink(target: string, notes: readonly NoteRef[]): string | null {
  const clean = target.trim().replace(/^\.?\//, '');
  if (!clean) return null;

  // 1. Exact vault path (with or without the .note.json suffix), case-insensitive as a fallback.
  const asPath = clean.endsWith(NOTE_EXTENSION) ? clean : `${clean}${NOTE_EXTENSION}`;
  const exact = notes.find((n) => n.path === asPath);
  if (exact) return exact.path;
  const exactCI = notes.find((n) => n.path.toLowerCase() === asPath.toLowerCase());
  if (exactCI) return exactCI.path;

  // 2. By title or filename (the last path segment), when it's unique. Case-insensitive.
  const needle = (clean.split('/').pop() ?? clean).toLowerCase();
  const byName = notes.filter((n) => {
    const filename = noteDisplayName(n.path).toLowerCase();
    const title = (n.title ?? '').toLowerCase();
    return filename === needle || title === needle;
  });
  return byName.length === 1 ? (byName[0]?.path ?? null) : null;
}

/** Distinct link targets found in a chunk of note text (deduplicated, order preserved). */
export function wikilinkTargets(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of parseWikilinks(text)) {
    if (!seen.has(link.target)) {
      seen.add(link.target);
      out.push(link.target);
    }
  }
  return out;
}
