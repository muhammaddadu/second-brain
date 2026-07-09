/**
 * The editor's block schema. We override BlockNote's built-in `codeBlock` with a custom renderer
 * that draws a diagram when the block's `language` has a registered renderer (E7), and a plain code
 * block otherwise. Crucially the block's *type and props are unchanged* (`codeBlock` +
 * `{ language }`), so on-disk storage and Markdown import/export stay exactly as before
 * (data-model.md § Diagrams) — only the rendering differs.
 */
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import { DiagramView } from './diagrams/DiagramView';
import { getDiagramRenderer } from './diagrams/registry';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Join a block's inline content into plain source text (for feeding the diagram renderer). */
function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.map((n) => (isRecord(n) && typeof n.text === 'string' ? n.text : '')).join('');
}

const codeBlock = createReactBlockSpec(
  {
    type: 'codeBlock',
    propSchema: { language: { default: 'text' } },
    content: 'inline',
  },
  {
    render: ({ block, contentRef }) => {
      const language = typeof block.props.language === 'string' ? block.props.language : 'text';
      const renderer = getDiagramRenderer(language);

      if (renderer) {
        const source = inlineText(block.content);
        return (
          <div
            className="border-edge my-2 overflow-hidden rounded border"
            data-testid="diagram-block"
          >
            <div contentEditable={false}>
              <DiagramView renderer={renderer} source={source} />
            </div>
            <div className="border-edge bg-surface border-t">
              <div className="text-muted px-3 pt-1 text-[10px] uppercase tracking-wide">
                {language} source
              </div>
              <pre className="overflow-x-auto px-3 py-2 font-mono text-xs">
                <code ref={contentRef} data-testid="diagram-source" />
              </pre>
            </div>
          </div>
        );
      }

      return (
        <pre className="bg-surface my-2 overflow-x-auto rounded p-3 font-mono text-sm">
          <code ref={contentRef} />
        </pre>
      );
    },
  },
);

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, codeBlock: codeBlock() },
});
