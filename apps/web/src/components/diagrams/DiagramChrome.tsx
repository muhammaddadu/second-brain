import type { CSSProperties, ReactNode } from 'react';

/** Soft paper card used inside marketing diagrams. */
export function DiagramCard({
  children,
  className = '',
  accent = false,
  hub = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  /** Soft breathing ring — use on the vault hub. */
  hub?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`diagram-card px-4 py-3.5 ${accent ? 'diagram-card-accent' : ''} ${hub ? 'diagram-card-hub' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** Animated dashed connector with a traveling accent bead. */
export function FlowConnector({ vertical = false }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flow-rail flow-rail-v relative h-10 w-full" aria-hidden="true">
        <svg
          className="h-full w-full"
          viewBox="0 0 20 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line className="flow-rail-line" x1="10" y1="2" x2="10" y2="38" />
        </svg>
        <span className="flow-bead" />
      </div>
    );
  }
  return (
    <div
      className="flow-rail flow-rail-h relative mx-1 hidden w-10 shrink-0 self-center lg:block"
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 40 20"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line className="flow-rail-line" x1="2" y1="10" x2="38" y2="10" />
      </svg>
      <span className="flow-bead" />
    </div>
  );
}

/** Faint constellation behind a diagram panel — nodes twinkle gently. */
export function Constellation() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.45]"
      viewBox="0 0 400 420"
      aria-hidden="true"
    >
      <g stroke="var(--edge)" strokeWidth="1" fill="none">
        <path d="M36 52 L118 88 L92 168 L186 148" />
        <path d="M286 36 L348 96 L308 178 L368 228" />
        <path d="M48 278 L142 252 L208 318 L118 348" />
        <path
          d="M214 72 L268 158 L222 228"
          stroke="var(--accent)"
          strokeDasharray="3 5"
          opacity="0.55"
          className="flow-rail-line"
        />
      </g>
      <g fill="var(--faint)">
        <circle
          className="constellation-node"
          cx="36"
          cy="52"
          r="2.4"
          style={{ animationDelay: '0s' }}
        />
        <circle
          className="constellation-node"
          cx="118"
          cy="88"
          r="2"
          style={{ animationDelay: '0.6s' }}
        />
        <circle
          className="constellation-node"
          cx="92"
          cy="168"
          r="2.4"
          style={{ animationDelay: '1.1s' }}
        />
        <circle
          className="constellation-node"
          cx="186"
          cy="148"
          r="2"
          style={{ animationDelay: '1.7s' }}
        />
        <circle
          className="constellation-node"
          cx="286"
          cy="36"
          r="2"
          style={{ animationDelay: '0.3s' }}
        />
        <circle
          className="constellation-node"
          cx="348"
          cy="96"
          r="2.4"
          style={{ animationDelay: '0.9s' }}
        />
        <circle
          className="constellation-node"
          cx="308"
          cy="178"
          r="2"
          style={{ animationDelay: '1.4s' }}
        />
        <circle
          className="constellation-node"
          cx="208"
          cy="318"
          r="2.4"
          style={{ animationDelay: '2s' }}
        />
        <circle
          className="constellation-node"
          cx="268"
          cy="158"
          r="3.2"
          fill="var(--accent)"
          style={{ animationDelay: '0.5s' }}
        />
      </g>
    </svg>
  );
}
