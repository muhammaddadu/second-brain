import { describe, expect, it } from 'vitest';
import { parseWikilinks, resolveWikilink, wikilinkTargets } from './wikilinks.js';

describe('parseWikilinks', () => {
  it('parses plain, aliased, and heading-fragment links', () => {
    const links = parseWikilinks(
      'See [[People/Robert Kohler]] and [[Ideas/Local first|why local]] plus [[Note#Section]].',
    );
    expect(links).toEqual([
      { target: 'People/Robert Kohler', alias: null, raw: '[[People/Robert Kohler]]', index: 4 },
      {
        target: 'Ideas/Local first',
        alias: 'why local',
        raw: '[[Ideas/Local first|why local]]',
        index: 33,
      },
      { target: 'Note', alias: null, raw: '[[Note#Section]]', index: 70 },
    ]);
  });

  it('ignores empty brackets and dedupes targets', () => {
    expect(parseWikilinks('[[]] and [[  ]]')).toEqual([]);
    expect(wikilinkTargets('[[A]] [[A]] [[B]] [[A|x]]')).toEqual(['A', 'B']);
  });
});

describe('resolveWikilink (path, then title)', () => {
  const notes = [
    { path: 'People/Robert Kohler.note.json', title: 'Robert Kohler' },
    { path: 'Ideas/Local first.note.json', title: 'Why local-first' },
    { path: 'Journal/2026-07-09.note.json', title: 'Monday' },
    { path: 'Archive/Robert Kohler.note.json', title: 'Robert (old)' }, // duplicate basename
  ];

  it('resolves an exact vault path (with or without extension)', () => {
    expect(resolveWikilink('People/Robert Kohler', notes)).toBe('People/Robert Kohler.note.json');
    expect(resolveWikilink('People/Robert Kohler.note.json', notes)).toBe(
      'People/Robert Kohler.note.json',
    );
    expect(resolveWikilink('ideas/local first', notes)).toBe('Ideas/Local first.note.json'); // CI
  });

  it('falls back to a unique filename or title', () => {
    expect(resolveWikilink('Monday', notes)).toBe('Journal/2026-07-09.note.json'); // by title
    expect(resolveWikilink('Local first', notes)).toBe('Ideas/Local first.note.json'); // by filename
  });

  it('returns null for missing or ambiguous targets', () => {
    expect(resolveWikilink('Nobody', notes)).toBeNull();
    // "Robert Kohler" is a basename in two folders → ambiguous, so the bare title does not resolve…
    expect(resolveWikilink('Robert Kohler', notes)).toBeNull();
    // …but the full path still resolves unambiguously.
    expect(resolveWikilink('Archive/Robert Kohler', notes)).toBe('Archive/Robert Kohler.note.json');
  });
});
