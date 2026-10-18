import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { initStore } from './lib/store.ts';
import { loadReferenceData } from './lib/geo.ts';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

Promise.allSettled([loadReferenceData(), initStore()]).then(() => {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
