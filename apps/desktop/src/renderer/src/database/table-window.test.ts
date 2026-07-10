import { describe, expect, it } from 'vitest';
import { windowRange } from './table-window';

describe('windowRange', () => {
  const H = 33;

  it('renders the top slice with overscan and no top padding at scrollTop 0', () => {
    const w = windowRange(1000, H, 0, 330, 6); // ~10 visible rows
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
    expect(w.end).toBe(10 + 6); // visible + bottom overscan
    expect(w.padBottom).toBe((1000 - w.end) * H);
  });

  it('windows around the scroll position in the middle', () => {
    const w = windowRange(1000, H, 100 * H, 330, 6);
    expect(w.start).toBe(100 - 6);
    expect(w.end).toBe(100 + 10 + 6);
    expect(w.padTop).toBe(w.start * H);
    expect(w.padBottom).toBe((1000 - w.end) * H);
    // The padding + rendered rows always sum to the full scrollable height.
    expect(w.padTop + (w.end - w.start) * H + w.padBottom).toBe(1000 * H);
  });

  it('clamps at the bottom (no negative padding, end never exceeds rowCount)', () => {
    const w = windowRange(50, H, 10_000, 330, 6);
    expect(w.end).toBe(50);
    expect(w.padBottom).toBe(0);
    expect(w.start).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty window for zero rows', () => {
    expect(windowRange(0, H, 0, 330)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });

  it('is a no-op guard when rowHeight is unknown (0)', () => {
    expect(windowRange(100, 0, 500, 330)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 });
  });
});
