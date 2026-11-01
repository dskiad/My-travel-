import { Component, type ReactNode } from 'react';
import { trace } from '../lib/diag.ts';

/** If a screen crashes, say so (instead of freezing) and log which part failed. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    trace('screen-crash', `${error?.message} | ${(info.componentStack || '').trim().split('\n').slice(0, 6).map((l) => l.trim()).join(' < ')} | ${(error?.stack || '').split('\n').slice(0, 4).join(' / ')}`);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <div className="card empty" style={{ marginTop: 24 }}>
          <div className="big">🛠️</div>
          <h2>This screen hit a problem</h2>
          <p className="small muted">It has been recorded so it can be fixed. Your flights and cards are safe.</p>
          <p className="tiny faint" style={{ wordBreak: 'break-word' }}>{this.state.error.message}</p>
          <a className="btn primary" href="#" onClick={(e) => { e.preventDefault(); this.setState({ error: null }); window.dispatchEvent(new CustomEvent('mt-go-home')); }}>Back to Trips</a>
        </div>
      </main>
    );
  }
}
