import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { initStore } from './lib/store.ts';
import { loadReferenceData } from './lib/geo.ts';
import { IS_ARTIFACT } from './lib/platform.ts';
import { trace } from './lib/diag.ts';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
if (IS_ARTIFACT) document.documentElement.classList.add('artifact');

// The claude.ai page lives inside a frame whose URL it doesn't own, so it keeps
// its screens in memory; the full app uses real URLs.
const Router = IS_ARTIFACT ? MemoryRouter : BrowserRouter;

root.render(
  <div className="splash" role="status">
    <span className="splash-mark">✈</span>
    <span>Loading your trips…</span>
  </div>,
);

Promise.allSettled([loadReferenceData(), initStore()]).then((r) => {
  trace('start', r.map((x) => x.status === 'fulfilled' ? 'ok' : String((x.reason as Error)?.message || x.reason)).join(' | '));
  root.render(
    <StrictMode>
      <Router>
        <App />
      </Router>
    </StrictMode>,
  );
});

if ('serviceWorker' in navigator && import.meta.env.PROD && !IS_ARTIFACT) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
