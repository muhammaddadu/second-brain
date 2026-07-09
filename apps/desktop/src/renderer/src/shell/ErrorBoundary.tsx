/**
 * Catches render/runtime errors anywhere in the tree and shows a recoverable fallback instead of a
 * blank window. Without this, one throwing component (e.g. a stale preload missing a method during
 * dev HMR) unmounts the whole app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="text-ink flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="font-serif text-lg font-semibold">Something went wrong</p>
        <p className="text-muted max-w-sm text-sm">{error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="border-edge hover:bg-edge/50 rounded-lg border px-3 py-1.5 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }
}
