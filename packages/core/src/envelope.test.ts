import { describe, expect, it } from 'vitest';
import {
  CURRENT_ENVELOPE_VERSION,
  getTags,
  parseNote,
  serializeNote,
  setTags,
} from './envelope.js';
import { NoteParseError } from './errors.js';

// A canonical note with an unknown meta key ("pinned") to prove preservation. This exact string
// is what serializeNote must reproduce byte-for-byte.
const CANONICAL = `{
  "version": 1,
  "meta": {
    "title": "Hello",
    "tags": [
      "a",
      "b"
    ],
    "created": "2026-07-09T12:00:00.000Z",
    "updated": "2026-07-09T12:00:00.000Z",
    "pinned": true
  },
  "blocks": [
    {
      "type": "paragraph",
      "content": []
    }
  ]
}
`;

describe('parseNote / serializeNote', () => {
  it('parses to {version, meta, blocks}', () => {
    const note = parseNote(CANONICAL);
    expect(note.version).toBe(1);
    expect(note.meta.title).toBe('Hello');
    expect(note.blocks).toHaveLength(1);
  });

  it('round-trips a canonical note byte-identically, preserving unknown meta keys', () => {
    const note = parseNote(CANONICAL);
    expect(note.meta.pinned).toBe(true); // unknown key survives parse
    expect(serializeNote(note)).toBe(CANONICAL); // ...and survives serialise, byte for byte
  });

  it('serialises with fixed key order, 2-space indent, and a trailing newline', () => {
    const out = serializeNote({
      version: CURRENT_ENVELOPE_VERSION,
      meta: { updated: 'u', created: 'c', tags: [] }, // deliberately out of documented order
      blocks: [],
    });
    expect(out.startsWith('{\n  "version": 1,\n  "meta": {')).toBe(true);
    expect(out.endsWith('}\n')).toBe(true);
  });

  it('rejects malformed input with NoteParseError', () => {
    expect(() => parseNote('not json')).toThrow(NoteParseError);
    expect(() => parseNote('{"version": 1, "meta": {}}')).toThrow(NoteParseError); // no blocks
    expect(() => parseNote('{"version": 1, "blocks": []}')).toThrow(NoteParseError); // no meta
  });

  it('refuses an envelope newer than the supported version', () => {
    expect(() => parseNote('{"version": 999, "meta": {}, "blocks": []}')).toThrow(NoteParseError);
  });
});

describe('getTags / setTags', () => {
  it('reads tags, defaulting absent to empty', () => {
    expect(getTags({ version: 1, meta: {}, blocks: [] })).toEqual([]);
    expect(getTags({ version: 1, meta: { tags: ['x'] }, blocks: [] })).toEqual(['x']);
  });

  it('replaces tags without mutating the input', () => {
    const original = { version: 1, meta: { tags: ['old'] }, blocks: [] };
    const updated = setTags(original, ['new', 'tags']);
    expect(getTags(updated)).toEqual(['new', 'tags']);
    expect(getTags(original)).toEqual(['old']); // unchanged
  });
});
