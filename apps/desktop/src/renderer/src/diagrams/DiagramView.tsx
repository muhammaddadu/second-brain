/**
 * Renders a diagram's live preview from its source text. Re-renders as the source changes; on an
 * error, shows the message (the source itself stays intact and editable in the code block). This
 * is the non-editable preview half of the custom code block; the editable source is the block's
 * own inline content.
 */
import { useEffect, useState } from 'react';
import type { DiagramRenderer, DiagramResult } from './registry';

export function DiagramView({ renderer, source }: { renderer: DiagramRenderer; source: string }) {
  const [result, setResult] = useState<DiagramResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderer.render(source).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [renderer, source]);

  if (result === null) {
    return <div className="text-muted p-3 text-sm">Rendering diagram…</div>;
  }
  if (!result.ok) {
    return (
      <div
        className="border-edge text-muted rounded border border-dashed p-3 text-sm"
        data-testid="diagram-error"
      >
        Diagram error: {result.error}
      </div>
    );
  }
  return (
    // Safe: SVG is produced by the local mermaid renderer (securityLevel: 'strict'); no remote input.
    <div
      className="flex justify-center overflow-x-auto p-2"
      data-testid="diagram-preview"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: locally-rendered mermaid SVG, strict mode
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
