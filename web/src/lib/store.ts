// Storage for flights, memberships and settings, with a tiny subscription
// model for React. In the full app everything stays on the device
// (IndexedDB); on claude.ai it goes to the viewer's private page storage.
import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import type { Flight, FlightDraft, Membership, Settings } from './types.ts';
import { flightKey, sortFlights } from './flights.ts';
import { IS_ARTIFACT } from './platform.ts';
import { connectCloud, type CloudStore } from './cloudStore.ts';
import { trace } from './diag.ts';

export interface State {
  flights: Flight[];
  memberships: Membership[];
  settings: Settings;
  ready: boolean;
}

const DEFAULT_SETTINGS: Settings = { name: '', passport: 'Greece', cabin: '', homeAirport: '', calendarUrl: '' };

let state: State = { flights: [], memberships: [], settings: DEFAULT_SETTINGS, ready: false };
const listeners = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

let cloud: CloudStore | null = null;

async function persist() {
  if (cloud) {
    cloud.save({ flights: state.flights, memberships: state.memberships, settings: state.settings });
    return;
  }
  try {
    await Promise.all([
      set('flights', state.flights),
      set('memberships', state.memberships),
      set('settings', state.settings),
    ]);
  } catch (err) {
    console.warn('Could not save to device storage', err);
  }
}

export async function initStore() {
  if (IS_ARTIFACT) {
    try {
      cloud = await connectCloud();
      trace('storage', cloud ? 'claude.ai' : 'browser (no db)');
      if (cloud) {
        const data = await cloud.load();
        emit({
          flights: sortFlights(data.flights),
          memberships: data.memberships,
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          ready: true,
        });
        return;
      }
    } catch (err) {
      console.warn('Page storage unavailable, using this browser instead', err);
      cloud = null;
    }
  }
  try {
    const [flights, memberships, settings] = await Promise.all([
      get<Flight[]>('flights'), get<Membership[]>('memberships'), get<Settings>('settings'),
    ]);
    emit({
      flights: sortFlights(flights || []),
      memberships: memberships || [],
      settings: { ...DEFAULT_SETTINGS, ...settings },
      ready: true,
    });
  } catch {
    emit({ ready: true });
  }
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

export const getState = () => state;

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Add flights, merging with existing ones for the same flight number and date. */
export function addFlights(drafts: FlightDraft[], source: Flight['source']): { added: number; updated: number } {
  const byKey = new Map(state.flights.map((f) => [flightKey(f), f]));
  let added = 0;
  let updated = 0;
  for (const d of drafts) {
    const key = flightKey(d);
    const existing = byKey.get(key);
    const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if (existing) {
      byKey.set(key, { ...existing, ...clean, id: existing.id, createdAt: existing.createdAt });
      updated++;
    } else {
      byKey.set(key, { source, ...clean, id: uid(), createdAt: new Date().toISOString() } as Flight);
      added++;
    }
  }
  emit({ flights: sortFlights([...byKey.values()]) });
  persist();
  return { added, updated };
}

export function updateFlight(id: string, patch: Partial<Flight>) {
  emit({ flights: sortFlights(state.flights.map((f) => (f.id === id ? { ...f, ...patch } : f))) });
  persist();
}

export function deleteFlight(id: string) {
  emit({ flights: state.flights.filter((f) => f.id !== id) });
  persist();
}

export function saveMembership(m: Omit<Membership, 'id' | 'createdAt'> & { id?: string }) {
  const exists = m.id && state.memberships.some((x) => x.id === m.id);
  const memberships = exists
    ? state.memberships.map((x) => (x.id === m.id ? { ...x, ...m } as Membership : x))
    : [...state.memberships, { ...m, id: uid(), createdAt: new Date().toISOString() } as Membership];
  emit({ memberships });
  persist();
}

export function deleteMembership(id: string) {
  emit({ memberships: state.memberships.filter((m) => m.id !== id) });
  persist();
}

export function moveMembership(id: string, delta: number) {
  const list = [...state.memberships];
  const i = list.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  emit({ memberships: list });
  persist();
}

export function saveSettings(settings: Partial<Settings>) {
  emit({ settings: { ...state.settings, ...settings } });
  persist();
}

// ---------- backup ----------

export function exportBackup(): Blob {
  const { flights, memberships, settings } = state;
  const data = { app: 'my-travel', version: 1, exportedAt: new Date().toISOString(), flights, memberships, settings };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'my-travel') throw new Error('This is not a My Travel backup file');
  const result = addFlights(data.flights || [], 'backup');
  const known = new Set(state.memberships.map((m) => `${m.programId}|${m.memberNumber}`));
  const memberships = [...state.memberships];
  for (const m of data.memberships || []) {
    if (!known.has(`${m.programId}|${m.memberNumber}`)) memberships.push(m);
  }
  emit({ memberships, settings: { ...state.settings, ...data.settings } });
  persist();
  return result;
}
