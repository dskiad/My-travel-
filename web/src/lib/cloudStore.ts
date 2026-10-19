// claude.ai page storage: each viewer's flights, cards and settings live in
// their own private subtree of the page's database (data/users/<id>/…), which
// nobody else can read, the page owner included.
import { capability } from './platform.ts';
import type { Flight, Membership, Settings } from './types.ts';

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): CollRef;
}
interface CollRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: { id: string; data(): Record<string, unknown> | undefined }[] }>;
}
interface Db { doc(path: string): DocRef }
interface User { id(): Promise<string | null> }

export interface CloudData { flights: Flight[]; memberships: Membership[]; settings?: Partial<Settings> }

export interface CloudStore {
  load(): Promise<CloudData>;
  save(data: CloudData): void;
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 120) || 'x';

export async function connectCloud(): Promise<CloudStore | null> {
  const [db, user] = await Promise.all([capability<Db>('db'), capability<User>('user')]);
  if (!db || !user) return null;
  const uid = await user.id().catch(() => null);
  if (!uid) return null;

  const profile = db.doc(`data/users/${uid}/profile`);
  const flightsCol = profile.collection('flights');
  // What the store holds, so each save writes only what changed.
  const saved = new Map<string, string>();
  let savedProfile = '';
  let queue = Promise.resolve();

  return {
    async load() {
      const [p, f] = await Promise.all([profile.get(), flightsCol.get()]);
      const pd = (p.exists ? p.data() : undefined) as { settings?: Settings; memberships?: Membership[] } | undefined;
      const flights = f.docs.map((d) => d.data() as unknown as Flight).filter(Boolean);
      for (const fl of flights) saved.set(safeId(fl.id), JSON.stringify(fl));
      savedProfile = JSON.stringify({ settings: pd?.settings, memberships: pd?.memberships || [] });
      return { flights, memberships: pd?.memberships || [], settings: pd?.settings };
    },
    save(data) {
      // Writes run one after another so a document never has two in flight.
      queue = queue.then(async () => {
        const nextProfile = JSON.stringify({ settings: data.settings, memberships: data.memberships });
        if (nextProfile !== savedProfile) {
          await profile.set(JSON.parse(nextProfile));
          savedProfile = nextProfile;
        }
        const current = new Set<string>();
        for (const fl of data.flights) {
          const id = safeId(fl.id);
          current.add(id);
          const json = JSON.stringify(fl);
          if (saved.get(id) === json) continue;
          await flightsCol.doc(id).set(JSON.parse(json));
          saved.set(id, json);
        }
        for (const id of [...saved.keys()]) {
          if (current.has(id)) continue;
          await flightsCol.doc(id).delete();
          saved.delete(id);
        }
      }).catch((err) => console.warn('Could not save to your claude.ai storage', err));
    },
  };
}
