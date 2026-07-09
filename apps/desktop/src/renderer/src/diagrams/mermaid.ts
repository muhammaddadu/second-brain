/**
 * Mermaid renderer — the v1 registry entry (PRD §3.7). Importing this module registers `mermaid`
 * so a code block tagged `mermaid` renders as a diagram. Errors are returned, never thrown, so the
 * editor shows them next to the intact source.
 */
import mermaid from 'mermaid';
import { type DiagramRenderer, registerDiagramRenderer } from './registry';

const prefersDark =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

mermaid.initialize({
  startOnLoad: false,
  theme: prefersDark ? 'dark' : 'neutral',
  securityLevel: 'strict',
});

let renderCount = 0;

export const mermaidRenderer: DiagramRenderer = {
  language: 'mermaid',
  async render(source) {
    const trimmed = source.trim();
    if (!trimmed) return { ok: false, error: 'Empty diagram.' };
    try {
      renderCount += 1;
      const { svg } = await mermaid.render(`brain-mermaid-${renderCount}`, trimmed);
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

registerDiagramRenderer(mermaidRenderer);
