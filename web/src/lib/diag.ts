// Step log for troubleshooting the claude.ai page: the last 60 events of the
// Add-flight flow (and any error) go to the viewer's own private storage,
// where only they (and Claude, when they ask for help) can read them.
import { IS_ARTIFACT, capability } from './platform.ts';

interface Db { doc(path: string): { set(d: Record<string, unknown>): Promise<void> } }
interface User { id(): Promise<string | null> }

const events: { t: string; e: string; d?: string }[] = [];
let timer: number | undefined;
let writing = false;

async function flush() {
  if (writing) { timer = window.setTimeout(flush, 1500); return; }
  writing = true;
  try {
    const [db, user] = await Promise.all([capability<Db>('db'), capability<User>('user')]);
    const uid = await user?.id().catch(() => null);
    if (db && uid) {
      await db.doc(`data/users/${uid}/diag`).set({
        events: events.slice(-60), ua: navigator.userAgent, size: `${innerWidth}x${innerHeight}`, at: new Date().toISOString(),
      });
    }
  } catch { /* best effort */ } finally { writing = false; }
}

export function trace(e: string, detail?: unknown) {
  if (!IS_ARTIFACT) return;
  let d: string | undefined;
  try { d = detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300); } catch { d = String(detail); }
  events.push({ t: new Date().toISOString().slice(11, 23), e, d });
  if (events.length > 80) events.splice(0, events.length - 80);
  clearTimeout(timer);
  timer = window.setTimeout(flush, 800);
}

if (IS_ARTIFACT && typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => trace('error', `${ev.message} @${ev.lineno}:${ev.colno} | ${String((ev.error as Error)?.stack || '').split('\n').slice(0, 5).join(' / ')}`));
  window.addEventListener('unhandledrejection', (ev) => trace('rejection', String((ev.reason as Error)?.message || ev.reason)));
  // Every tap: what was under the finger.
  document.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement | null;
    const b = el?.closest('button, a, input, label, select') as HTMLElement | null;
    trace('tap', `${(b || el)?.tagName} "${((b || el)?.innerText || (b as HTMLInputElement)?.placeholder || '').trim().slice(0, 40)}" @${Math.round(ev.clientX)},${Math.round(ev.clientY)}`);
  }, true);
}
