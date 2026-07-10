/**
 * Row windowing math for the database TableView. A large database (up to a couple thousand notes)
 * renders one editable `<tr>` per row, which is far too many DOM nodes; we instead render only the
 * rows inside the scroll viewport (plus an overscan margin) and pad the `<tbody>` with two spacer
 * rows so the scrollbar still reflects the full height. Kept pure so it's unit-tested without a DOM.
 */
export interface RowWindow {
  /** First row index to render (inclusive). */
  start: number;
  /** One past the last row index to render (exclusive). */
  end: number;
  /** Pixels of empty space to reserve above the rendered rows. */
  padTop: number;
  /** Pixels of empty space to reserve below the rendered rows. */
  padBottom: number;
}

/**
 * Which slice of `rowCount` rows is visible for a fixed `rowHeight`, given the scroll position and
 * viewport height. `overscan` rows are rendered beyond each edge so fast scrolls don't flash blank.
 */
export function windowRange(
  rowCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): RowWindow {
  if (rowCount <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(rowCount, first + visible + overscan);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (rowCount - end) * rowHeight,
  };
}
