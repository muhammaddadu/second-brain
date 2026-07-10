import { describe, expect, it } from 'vitest';
import type { Route } from '../../../shared/route';
import { canGoBack, canGoForward, current, go, initHistory, push, replace } from './history';

const note = (path: string | null): Route => ({ name: 'note', path });

describe('nav history', () => {
  it('pushes, and back/forward walk the entries', () => {
    let h = initHistory(note(null));
    h = push(h, note('a'));
    h = push(h, note('b'));
    expect(current(h)).toEqual(note('b'));
    expect(canGoForward(h)).toBe(false);

    h = go(h, -1);
    expect(current(h)).toEqual(note('a'));
    expect(canGoBack(h)).toBe(true);
    expect(canGoForward(h)).toBe(true);

    h = go(h, -1);
    expect(current(h)).toEqual(note(null));
    expect(canGoBack(h)).toBe(false);
  });

  it('a new navigation truncates the forward stack (forking history)', () => {
    let h = initHistory(note('a'));
    h = push(h, note('b'));
    h = push(h, note('c'));
    h = go(h, -2); // back to a
    h = push(h, note('d')); // forks: b, c are dropped
    expect(h.entries.map((e) => (e.name === 'note' ? e.path : e.name))).toEqual(['a', 'd']);
    expect(canGoForward(h)).toBe(false);
  });

  it('ignores a repeat navigation to the same route', () => {
    let h = initHistory(note('a'));
    h = push(h, note('a'));
    expect(h.entries).toHaveLength(1);
  });

  it('go clamps at both ends', () => {
    let h = initHistory(note('a'));
    h = push(h, note('b'));
    expect(current(go(h, +5))).toEqual(note('b'));
    expect(current(go(h, -5))).toEqual(note('a'));
  });

  it('replace swaps the current entry without adding a step', () => {
    let h = initHistory(note('a'));
    h = push(h, note('b'));
    h = replace(h, note('b2'));
    expect(current(h)).toEqual(note('b2'));
    expect(h.entries).toHaveLength(2);
  });
});
