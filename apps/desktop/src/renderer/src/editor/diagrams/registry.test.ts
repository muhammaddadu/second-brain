import { afterEach, describe, expect, it } from 'vitest';
import {
  type DiagramRenderer,
  getDiagramRenderer,
  isDiagramLanguage,
  registerDiagramRenderer,
} from './registry';

const dummy: DiagramRenderer = {
  language: 'dummy',
  async render(source) {
    return { ok: true, svg: `<svg data-src="${source}"></svg>` };
  },
};

describe('diagram renderer registry', () => {
  afterEach(() => {
    // Registry is module-global; nothing to reset here since tests use a unique language.
  });

  it('an unregistered language has no renderer', () => {
    expect(isDiagramLanguage('nope')).toBe(false);
    expect(getDiagramRenderer('nope')).toBeUndefined();
  });

  it('registering a renderer requires only a registry entry (proves the extensibility seam)', async () => {
    registerDiagramRenderer(dummy);
    expect(isDiagramLanguage('dummy')).toBe(true);
    const renderer = getDiagramRenderer('dummy');
    expect(renderer).toBeDefined();
    await expect(renderer?.render('x')).resolves.toEqual({
      ok: true,
      svg: '<svg data-src="x"></svg>',
    });
  });
});
