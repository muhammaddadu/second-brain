import { describe, expect, it } from 'vitest';
import { boolFlag, listFlag, parseArgs, stringFlag } from './args.js';

describe('parseArgs', () => {
  it('separates positionals from --flag value / --flag=value / boolean flags', () => {
    const a = parseArgs(['search', 'my query', '--limit', '5', '--json', '--vault=/tmp/v']);
    expect(a.positionals).toEqual(['search', 'my query']);
    expect(stringFlag(a, 'limit')).toBe('5');
    expect(stringFlag(a, 'vault')).toBe('/tmp/v');
    expect(boolFlag(a, 'json')).toBe(true);
  });

  it('treats known booleans as flags even when followed by a value', () => {
    const a = parseArgs(['read', 'a.note.json', '--json', 'extra']);
    expect(a.positionals).toEqual(['read', 'a.note.json', 'extra']); // --json didn't swallow "extra"
    expect(boolFlag(a, 'json')).toBe(true);
  });

  it('parses comma lists and ignores missing flags', () => {
    const a = parseArgs(['tag', 'x', '--set', 'a, b ,c']);
    expect(listFlag(a, 'set')).toEqual(['a', 'b', 'c']);
    expect(listFlag(a, 'add')).toBeUndefined();
    expect(boolFlag(a, 'nope')).toBe(false);
  });
});
