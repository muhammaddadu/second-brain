import { useReveal } from '../lib/useReveal';
import { DayLoopDiagram } from './diagrams/DayLoopDiagram';

export function Vision() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section id="vision" ref={ref} className="border-t border-edge px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className={`reveal mx-auto max-w-2xl text-center ${visible ? 'is-visible' : ''}`}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            One loop. Every day.
          </h2>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Chat logs vanish. The vault is where the useful residue lands, and where the next agent
            starts.
          </p>
        </div>

        <div
          className={`reveal mt-12 ${visible ? 'is-visible' : ''}`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          <DayLoopDiagram />
        </div>
      </div>
    </section>
  );
}
