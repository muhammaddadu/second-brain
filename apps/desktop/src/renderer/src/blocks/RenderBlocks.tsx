/**
 * Minimal read-only renderer for the BlockNote document. E1 only needs to *display* a note; rich
 * in-place editing (and the real BlockNote editor) arrives in E2. `blocks` is opaque to core
 * (`unknown[]`), so we narrow defensively here rather than trusting a cast — unknown block types
 * degrade to their inline text instead of throwing.
 */
import type { JSX, ReactNode } from 'react';

interface Block {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value.filter((b): b is Block => isRecord(b) && typeof b.type === 'string');
}

function renderInline(content: unknown, keyPrefix: string): ReactNode {
  if (!Array.isArray(content)) return null;
  return content.map((raw, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!isRecord(raw)) return null;
    if (raw.type === 'link') {
      return (
        <span key={key} className="text-accent underline">
          {renderInline(raw.content, key)}
        </span>
      );
    }
    if (typeof raw.text !== 'string') return null;
    const s = isRecord(raw.styles) ? raw.styles : {};
    let className = '';
    if (s.bold) className += ' font-semibold';
    if (s.italic) className += ' italic';
    if (s.underline) className += ' underline';
    if (s.strike) className += ' line-through';
    if (s.code) className += ' font-mono text-[0.9em] bg-surface px-1 rounded';
    return className ? (
      <span key={key} className={className.trim()}>
        {raw.text}
      </span>
    ) : (
      <span key={key}>{raw.text}</span>
    );
  });
}

function headingLevel(props: Record<string, unknown> | undefined): 1 | 2 | 3 {
  const level = props?.level;
  return level === 1 || level === 2 || level === 3 ? level : 1;
}

function renderBlock(block: Block, key: string): ReactNode {
  const inline = renderInline(block.content, key);
  const children = asBlocks(block.children);
  const childNodes =
    children.length > 0 ? (
      <div className="ml-5 mt-1 flex flex-col gap-2">
        {children.map((c, i) => renderBlock(c, `${key}-${i}`))}
      </div>
    ) : null;

  switch (block.type) {
    case 'heading': {
      const level = headingLevel(block.props);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      const sizes = { 1: 'text-2xl', 2: 'text-xl', 3: 'text-lg' } as const;
      return (
        <div key={key}>
          <Tag className={`font-serif font-semibold ${sizes[level]}`}>{inline}</Tag>
          {childNodes}
        </div>
      );
    }
    case 'bulletListItem':
      return (
        <div key={key}>
          <div className="flex gap-2">
            <span className="text-muted select-none">•</span>
            <span>{inline}</span>
          </div>
          {childNodes}
        </div>
      );
    case 'numberedListItem':
    case 'checkListItem':
      return (
        <div key={key}>
          <div className="flex gap-2">
            <span className="text-muted select-none">
              {block.type === 'checkListItem' ? (block.props?.checked ? '☑' : '☐') : '–'}
            </span>
            <span>{inline}</span>
          </div>
          {childNodes}
        </div>
      );
    case 'quote':
      return (
        <blockquote key={key} className="border-edge border-l-2 pl-3 text-muted italic">
          {inline}
          {childNodes}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="bg-surface overflow-x-auto rounded p-3 font-mono text-sm">
          <code>{renderPlainText(block.content)}</code>
        </pre>
      );
    default:
      return (
        <div key={key}>
          <p>{inline}</p>
          {childNodes}
        </div>
      );
  }
}

function renderPlainText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((raw) => (isRecord(raw) && typeof raw.text === 'string' ? raw.text : ''))
    .join('');
}

export function RenderBlocks({ blocks }: { blocks: unknown[] }): JSX.Element {
  const parsed = asBlocks(blocks);
  if (parsed.length === 0) {
    return <p className="text-muted italic">This note is empty.</p>;
  }
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {parsed.map((block, i) => renderBlock(block, `b-${i}`))}
    </div>
  );
}
