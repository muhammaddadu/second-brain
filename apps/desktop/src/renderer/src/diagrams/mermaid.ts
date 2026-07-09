/**
 * Mermaid renderer — the v1 registry entry (PRD §3.7). Importing this module registers `mermaid`
 * so a code block tagged `mermaid` renders as a diagram. Errors are returned, never thrown, so the
 * editor shows them next to the intact source.
 */
import mermaid from 'mermaid';
import { type DiagramRenderer, registerDiagramRenderer } from './registry';

// Theme the diagram to the warm-paper palette (transparent canvas, warm node fills) so it reads as
// part of the note rather than a black box. Uses the "base" theme with explicit variables so it is
// consistent regardless of OS light/dark.
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'strict',
  themeVariables: {
    background: 'transparent',
    primaryColor: '#efe8da',
    primaryTextColor: '#2c2822',
    primaryBorderColor: '#b5623a',
    secondaryColor: '#f6f1e7',
    tertiaryColor: '#fbf8f1',
    lineColor: '#857c6d',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '15px',
  },
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
