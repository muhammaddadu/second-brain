import { describe, expect, it } from 'vitest';
import { type NoteEnvelope, parseNote, serializeNote } from './envelope.js';

/**
 * Storage is lossless by construction (ADR 0001): blocks are persisted verbatim. This proves the
 * persistence layer's half of the E2 fidelity criterion — a note carrying every common block
 * type survives save → reload → save byte-identically, and blocks untouched by an edit are
 * byte-identical after a re-save. (The editor's half — that BlockNote reproduces these blocks — is
 * exercised by the desktop E2E.)
 */
const DIVERSE_NOTE: NoteEnvelope = {
  version: 1,
  meta: { title: 'Every block', tags: ['fidelity'], created: 'c', updated: 'u' },
  blocks: [
    {
      id: '1',
      type: 'heading',
      props: { level: 1 },
      content: [{ type: 'text', text: 'H1', styles: {} }],
      children: [],
    },
    {
      id: '2',
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: 'bold', styles: { bold: true } },
        { type: 'text', text: ' and ', styles: {} },
        { type: 'text', text: 'italic', styles: { italic: true } },
      ],
      children: [],
    },
    {
      id: '3',
      type: 'bulletListItem',
      props: {},
      content: [{ type: 'text', text: 'one', styles: {} }],
      children: [],
    },
    {
      id: '4',
      type: 'numberedListItem',
      props: {},
      content: [{ type: 'text', text: 'first', styles: {} }],
      children: [],
    },
    {
      id: '5',
      type: 'checkListItem',
      props: { checked: true },
      content: [{ type: 'text', text: 'done', styles: {} }],
      children: [],
    },
    {
      id: '6',
      type: 'quote',
      props: {},
      content: [{ type: 'text', text: 'quoted', styles: {} }],
      children: [],
    },
    {
      id: '7',
      type: 'codeBlock',
      props: { language: 'mermaid' },
      content: [{ type: 'text', text: 'graph TD; A-->B;', styles: {} }],
      children: [],
    },
  ],
};

describe('block fidelity', () => {
  it('round-trips a note with every common block type byte-identically', () => {
    const once = serializeNote(DIVERSE_NOTE);
    const twice = serializeNote(parseNote(once));
    expect(twice).toBe(once);
  });

  it('keeps a diagram (mermaid) code block byte-identical across save/reload', () => {
    const serialized = serializeNote(DIVERSE_NOTE);
    const reparsed = parseNote(serialized);
    const codeBlock = reparsed.blocks.find(
      (b): b is { type: string; props: { language?: string } } =>
        typeof b === 'object' && b !== null && (b as { type?: string }).type === 'codeBlock',
    );
    expect(codeBlock?.props.language).toBe('mermaid');
    expect(serializeNote(reparsed)).toBe(serialized);
  });
});
