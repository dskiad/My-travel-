// The app runs in two places:
//  - "server": the full deployment (Render etc.) with the Node API for live
//    status, calendar feeds and web-researched briefings.
//  - "artifact": a page published on claude.ai. There is no server; Claude is
//    reached through the viewer's own account (`sample`), data is saved to the
//    viewer's private store (`db`), and the page cannot load outside images or
//    call other websites.

export const IS_ARTIFACT = import.meta.env?.VITE_TARGET === 'artifact';

interface ClaudeHost { use(name: string): Promise<unknown> }

function host(): ClaudeHost | undefined {
  return (globalThis as unknown as { claude?: ClaudeHost }).claude;
}

const cache = new Map<string, Promise<unknown>>();

/** A claude.ai page capability, or null where it isn't available. */
export function capability<T>(name: string): Promise<T | null> {
  if (!IS_ARTIFACT) return Promise.resolve(null);
  if (!cache.has(name)) {
    const h = host();
    cache.set(name, h ? h.use(name).catch(() => null) : Promise.resolve(null));
  }
  return cache.get(name) as Promise<T | null>;
}

export interface SampleFn {
  (input: string, opts?: Record<string, unknown>): Promise<{ text: string; truncated: boolean }>;
  json<T>(input: string, opts?: Record<string, unknown>): Promise<T>;
  limits(): Promise<{ images?: { mediaTypes: string[] } }>;
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: 'Allow this page to use Claude to read tickets and prepare briefings.',
  sampling_disabled: 'Claude is not available for your account.',
  rate_limited: 'Claude is busy or your usage limit was reached. Try again in a little while.',
  image_rejected: 'That image could not be read. Try a clearer screenshot (JPEG or PNG).',
  images_unavailable: 'Image reading is not available here. Paste the booking text instead.',
  invalid_json: 'Claude’s answer could not be read. Please try again.',
  refused: 'Claude could not help with that request.',
  session_expired: 'Please sign in to claude.ai again.',
};

export async function askClaudeJson<T>(prompt: string, opts: Record<string, unknown> = {}): Promise<T> {
  const sample = await capability<SampleFn>('sample');
  if (!sample) throw new Error('Open this page on claude.ai to use Claude here.');
  try {
    return await sample.json<T>(prompt, opts);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    throw new Error(SAMPLE_ERRORS[code] || 'Claude could not answer just now. Please try again.');
  }
}
