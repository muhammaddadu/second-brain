/**
 * Language-tag → diagram-renderer registry (the app-layer seam from data-model.md § Diagrams).
 * A diagram is stored as an ordinary code block whose `language` selects a renderer here; adding
 * a new text-based diagram language ([PRD §7.4]) is a registry entry, and touches no storage code.
 * Pure and DOM-free so it is unit-testable on its own; concrete renderers (which need the DOM)
 * register into it at startup.
 */

/** Outcome of rendering diagram source: an SVG string, or a human-readable error. */
export type DiagramResult = { ok: true; svg: string } | { ok: false; error: string };

export interface DiagramRenderer {
  /** The code-block language tag this renderer handles, e.g. `"mermaid"`. */
  readonly language: string;
  /** Render source text to SVG; must resolve (never throw) so callers can show the error inline. */
  render(source: string): Promise<DiagramResult>;
}

const registry = new Map<string, DiagramRenderer>();

/** Register (or replace) the renderer for a language tag. */
export function registerDiagramRenderer(renderer: DiagramRenderer): void {
  registry.set(renderer.language, renderer);
}

/** The renderer for a language tag, or undefined if unregistered (→ render as a plain code block). */
export function getDiagramRenderer(language: string): DiagramRenderer | undefined {
  return registry.get(language);
}

/** Whether a language tag has a registered diagram renderer. */
export function isDiagramLanguage(language: string): boolean {
  return registry.has(language);
}
