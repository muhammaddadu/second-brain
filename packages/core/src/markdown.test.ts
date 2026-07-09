import { describe, expect, it } from 'vitest';
import { blocksToMarkdown, markdownToBlocks } from './markdown.js';

describe('markdown conversion', () => {
  it('parses Markdown into BlockNote blocks', async () => {
    const blocks = await markdownToBlocks('# Title\n\nA paragraph with **bold**.\n');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
    const first = blocks[0] as { type?: string };
    expect(first.type).toBe('heading');
  });

  it('degrades unrecognised syntax to text instead of throwing', async () => {
    // A dangling/odd construct must not error the import.
    await expect(markdownToBlocks('::: weird {custom} :::\n')).resolves.toBeInstanceOf(Array);
  });

  it('round-trips prose back to readable Markdown', async () => {
    const source = '# Hello\n\nSome text and a list:\n\n- one\n- two\n';
    const markdown = await blocksToMarkdown(await markdownToBlocks(source));
    expect(markdown).toContain('# Hello');
    expect(markdown).toContain('Some text');
    expect(markdown).toContain('one');
    expect(markdown).toContain('two');
  });

  it('maps a ```mermaid fence to a codeBlock and back (diagram storage stays a code block)', async () => {
    const blocks = await markdownToBlocks('```mermaid\ngraph TD; A-->B;\n```\n');
    const diagram = blocks[0] as { type?: string; props?: { language?: string } };
    expect(diagram.type).toBe('codeBlock'); // stored as a plain code block, not a bespoke type
    expect(diagram.props?.language).toBe('mermaid');

    const back = await blocksToMarkdown(blocks);
    expect(back).toContain('```mermaid');
    expect(back).toContain('graph TD; A-->B;');
  });
});
