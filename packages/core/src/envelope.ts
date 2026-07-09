/**
 * The note envelope: parse, serialise, and migrate the on-disk `.note.json` format.
 * Format spec (the source of truth) lives in docs/architecture/data-model.md § "Note format";
 * why JSON is canonical is docs/adr/0001. These functions are pure — no I/O, no clock.
 */
import { NoteParseError } from './errors.js';

/** Current envelope schema version. Core migrates older forward on read, never writes older. */
export const CURRENT_ENVELOPE_VERSION = 1;

/**
 * v1 metadata. The keys below are the documented set; `title` falls back to the filename,
 * `created` is set once, `updated` is touched on every write. Unknown keys are preserved
 * verbatim (owners/agents may add their own), which the index signature models.
 */
export interface NoteMeta {
  title?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

/** One parsed note: schema version, metadata, and the untransformed BlockNote document. */
export interface NoteEnvelope {
  version: number;
  meta: NoteMeta;
  /** BlockNote `editor.document`, stored exactly as produced (opaque to core). */
  blocks: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bring an older envelope up to {@link CURRENT_ENVELOPE_VERSION}. Only v1 exists today, so this
 * is currently identity; it is the seam future migrations slot into. Refuses envelopes newer
 * than we understand rather than silently mishandling them.
 */
function migrate(raw: NoteEnvelope): NoteEnvelope {
  if (raw.version > CURRENT_ENVELOPE_VERSION) {
    throw new NoteParseError(
      `note envelope version ${raw.version} is newer than supported (${CURRENT_ENVELOPE_VERSION})`,
    );
  }
  return raw;
}

/**
 * Parse a note file's text into an envelope, validating shape and migrating forward.
 * Preserves `meta` and `blocks` exactly as read (including unknown meta keys and key order),
 * so an unchanged note round-trips byte-identically through {@link serializeNote}.
 */
export function parseNote(text: string): NoteEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new NoteParseError('note is not valid JSON', { cause });
  }
  if (!isRecord(raw)) {
    throw new NoteParseError('note must be a JSON object');
  }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) {
    throw new NoteParseError('note.version must be an integer');
  }
  if (!isRecord(raw.meta)) {
    throw new NoteParseError('note.meta must be an object');
  }
  if (!Array.isArray(raw.blocks)) {
    throw new NoteParseError('note.blocks must be an array');
  }
  return migrate({ version: raw.version, meta: raw.meta as NoteMeta, blocks: raw.blocks });
}

/**
 * Serialise an envelope deterministically: fixed top-level key order (version, meta, blocks),
 * 2-space indent, trailing newline. An unchanged note produces a byte-identical file so git
 * diffs stay reviewable (data-model.md § "Deterministic serialization").
 */
export function serializeNote(note: NoteEnvelope): string {
  const ordered = { version: note.version, meta: note.meta, blocks: note.blocks };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Read tags from a note, normalising the absent case to an empty list. */
export function getTags(note: NoteEnvelope): string[] {
  return note.meta.tags ?? [];
}

/**
 * Return a copy of the note with its tags replaced. Pure — persisting and touching `updated`
 * is the vault layer's job (see writeNote).
 */
export function setTags(note: NoteEnvelope, tags: readonly string[]): NoteEnvelope {
  return { ...note, meta: { ...note.meta, tags: [...tags] } };
}
