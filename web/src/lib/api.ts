import type { Briefing, Flight, FlightDraft, LiveStatus } from './types.ts';
import { airport } from './geo.ts';
import { IS_ARTIFACT, askClaudeJson, capability } from './platform.ts';

const NO_SERVER = 'This needs the full My Travel app (with its server). On this page, use a boarding pass, booking email or CSV instead.';

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface ServerConfig { claude: boolean; liveFlightStatus: boolean }
export async function getConfig(): Promise<ServerConfig> {
  if (IS_ARTIFACT) return { claude: Boolean(await capability('sample')), liveFlightStatus: false };
  return request<ServerConfig>('/api/config');
}

export function importCalendar(url: string) {
  if (IS_ARTIFACT) return Promise.reject(new Error(NO_SERVER));
  return request<{ flights: FlightDraft[] }>('/api/import/calendar', { url });
}

const DOC_PROMPT = `This is a travel document: a boarding pass, e-ticket, itinerary or booking confirmation (possibly a phone screenshot or a forwarded email). List every flight segment in it, in travel order. Today is ${new Date().toISOString().slice(0, 10)}; use it to infer the year when the document omits it.
Reply with only JSON in this shape:
{"passengerName": "", "flights": [{"airline": "IATA 2-character code, e.g. A3", "flightNumber": "digits only", "date": "YYYY-MM-DD local departure date", "from": "IATA airport", "to": "IATA airport", "depLocal": "HH:MM or empty", "arrLocal": "HH:MM or empty", "seat": "", "cabin": "First | Business | Premium Economy | Economy | empty", "pnr": "", "aircraft": ""}]}
Use empty strings for anything not shown, and an empty list if there are no flights.`;

/** Read flights from a boarding-pass image, an e-ticket PDF or pasted booking text. */
export async function readDocument(input: { file?: File; text?: string }): Promise<{ passengerName: string; flights: FlightDraft[] }> {
  if (IS_ARTIFACT) {
    if (input.file && !input.file.type.startsWith('image/')) {
      throw new Error('On this page, upload a screenshot of the ticket (PDF reading needs the full app).');
    }
    const res = await askClaudeJson<{ passengerName?: string; flights?: FlightDraft[] }>(
      input.text ? `${DOC_PROMPT}\n\n<document>\n${input.text.slice(0, 60000)}\n</document>` : DOC_PROMPT,
      input.file ? { images: [input.file] } : {},
    );
    const flights = (res.flights || [])
      .filter((f) => /^[A-Z0-9]{2}$/.test(f.airline) && /^\d{4}-\d{2}-\d{2}$/.test(f.date))
      .map((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as unknown as FlightDraft);
    return { passengerName: res.passengerName || '', flights };
  }
  const body: Record<string, string> = {};
  if (input.text) body.text = input.text;
  else if (input.file?.type.startsWith('image/')) Object.assign(body, { imageBase64: await fileToBase64(input.file), mediaType: input.file.type });
  else if (input.file) body.pdfBase64 = await fileToBase64(input.file);
  return request('/api/import/document', body);
}

export function lookupFlight(flight: string, date: string) {
  type R = { found: boolean; provider?: boolean; flight?: Partial<FlightDraft>; status?: LiveStatus };
  if (IS_ARTIFACT) return Promise.resolve<R>({ found: false, provider: false });
  return request<R>('/api/flights/lookup', { flight, date });
}

const flightBody = (f: Flight) => ({
  flight: `${f.airline}${f.flightNumber}`, date: f.date, from: f.from, to: f.to, seat: f.seat, cabin: f.cabin,
});

export function getFlightStatus(f: Flight) {
  if (IS_ARTIFACT) return Promise.resolve({ status: null as LiveStatus | null });
  return request<{ status: LiveStatus | null }>('/api/flight-status', flightBody(f));
}

export async function getBriefing(f: Flight, passport: string, loyaltyStatus: string) {
  if (IS_ARTIFACT) {
    const briefing = await askClaudeJson<Briefing>(briefingPrompt(f, passport, loyaltyStatus));
    return { briefing: { ...briefing, sources: [], generatedAt: new Date().toISOString(), offline: true } as Briefing, liveStatus: null };
  }
  return request<{ briefing: Briefing; liveStatus: LiveStatus | null }>('/api/briefing', { ...flightBody(f), passport, loyaltyStatus });
}

function briefingPrompt(f: Flight, passport: string, status: string) {
  const a = airport(f.from);
  const b = airport(f.to);
  return `You are a meticulous travel concierge preparing a briefing for one flight. You cannot browse, so answer from what you know and say plainly in "notes" fields when something may have changed (gates, opening hours, prices, strike plans). Never invent a gate.

Flight: ${f.airline}${f.flightNumber} on ${f.date}, ${f.from} (${a?.name || ''}, ${a?.city || ''}) to ${f.to} (${b?.name || ''}, ${b?.city || ''}). Departs ${f.depLocal || 'time unknown'} local.
Cabin: ${f.cabin || 'unknown'}. Seat: ${f.seat || 'unknown'}. Frequent-flyer statuses: ${status || 'none given'}. Passport: ${passport}.

Cover: the usual departure terminal for this airline at ${f.from}; lounges at ${f.from} this traveller can use (airline's own first, then alliance partners and contract lounges; where each is and which gates it is near; who gets in; opening hours); entry requirements at the destination for this passport (visa, ETA/ETIAS/ESTA-type authorisations, passport validity); known or typical disruption risks for these dates (e.g. regular strike patterns) flagged as unconfirmed; ground transport from ${f.to} into the city (train/metro, bus, taxi rank, Uber/Bolt pickup) with journey time and typical price; a few short tips.

Reply with only JSON in this shape:
{"flight": {"airlineName": "", "alliance": "", "departureTerminal": "", "status": "", "notes": ""},
 "lounges": [{"name": "", "terminal": "", "location": "", "nearGates": "", "walkFromGate": "", "hours": "", "access": "", "notes": ""}],
 "entryRequirements": {"destinationCountry": "", "visaRequired": "yes | no | conditional", "summary": "", "requirements": [""], "officialLink": ""},
 "disruptions": [{"type": "strike | weather | airport | airline | other", "severity": "info | warning | critical", "title": "", "details": "", "dates": ""}],
 "groundTransport": [{"mode": "train | metro | bus | taxi | rideshare | shuttle | other", "name": "", "where": "", "duration": "", "price": "", "frequency": "", "notes": "", "recommended": false}],
 "tips": [""]}`;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ---------- inspiration: destination photo and weather (free, no key) ----------

const photoCache = new Map<string, Promise<string | null>>();

export function destinationPhoto(iata: string): Promise<string | null> {
  const a = airport(iata);
  if (!a || IS_ARTIFACT) return Promise.resolve(null);
  if (!photoCache.has(a.city)) {
    photoCache.set(a.city, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(a.city)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const src: string | undefined = d?.thumbnail?.source || d?.originalimage?.source;
        return src ? src.replace(/\/\d+px-/, '/960px-') : null;
      })
      .catch(() => null));
  }
  return photoCache.get(a.city)!;
}

export interface DayWeather { date: string; code: number; max: number; min: number }

export async function forecast(iata: string, date: string): Promise<DayWeather | null> {
  const a = airport(iata);
  const days = (Date.parse(date) - Date.now()) / 864e5;
  if (!a || IS_ARTIFACT || days < -1 || days > 15) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${a.lat}&longitude=${a.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`;
  try {
    const d = await (await fetch(url)).json();
    return { date, code: d.daily.weather_code[0], max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]) };
  } catch {
    return null;
  }
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}
