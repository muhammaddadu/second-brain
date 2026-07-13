import type { ReactNode } from 'react';

/** Soft paper card used inside marketing diagrams. */
export function DiagramCard({
  children,
  className = '',
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div className={`diagram-card px-4 py-3.5 ${accent ? 'diagram-card-accent' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function FlowConnector({ vertical = false }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-1 py-2" aria-hidden="true">
        <div className="flow-dot" />
        <div className="h-6 w-px border-l border-dashed border-accent/45" />
      </div>
    );
  }
  return (
    <div className="hidden items-center gap-1 px-1.5 lg:flex" aria-hidden="true">
      <div className="h-px w-6 border-t border-dashed border-accent/45 sm:w-8" />
      <div className="flow-dot" />
      <div className="h-px w-6 border-t border-dashed border-accent/45 sm:w-8" />
    </div>
  );
}

/** Faint constellation behind a diagram panel. */
export function Constellation() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
      viewBox="0 0 400 360"
      aria-hidden="true"
    >
      <g stroke="var(--edge)" strokeWidth="1" fill="none">
        <path d="M40 60 L120 90 L90 160 L180 140" />
        <path d="M280 40 L340 100 L300 180 L360 220" />
        <path d="M60 260 L140 240 L200 300 L120 320" />
        <path
          d="M220 80 L260 160 L220 220"
          stroke="var(--accent)"
          strokeDasharray="3 4"
          opacity="0.5"
        />
      </g>
      <g fill="var(--faint)">
        <circle cx="40" cy="60" r="2.5" />
        <circle cx="120" cy="90" r="2" />
        <circle cx="90" cy="160" r="2.5" />
        <circle cx="180" cy="140" r="2" />
        <circle cx="280" cy="40" r="2" />
        <circle cx="340" cy="100" r="2.5" />
        <circle cx="300" cy="180" r="2" />
        <circle cx="200" cy="300" r="2.5" />
        <circle cx="260" cy="160" r="3" fill="var(--accent)" opacity="0.7" />
      </g>
    </svg>
  );
}
