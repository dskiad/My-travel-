import type { Briefing, Flight, FlightDraft, LiveStatus } from './types.ts';
import { airport } from './geo.ts';

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
export const getConfig = () => request<ServerConfig>('/api/config');

export const importCalendar = (url: string) =>
  request<{ flights: FlightDraft[] }>('/api/import/calendar', { url });

export const importDocument = (input: { imageBase64?: string; mediaType?: string; pdfBase64?: string; text?: string }) =>
  request<{ passengerName: string; flights: FlightDraft[] }>('/api/import/document', input);

export const lookupFlight = (flight: string, date: string) =>
  request<{ found: boolean; provider?: boolean; flight?: Partial<FlightDraft>; status?: LiveStatus }>(
    '/api/flights/lookup', { flight, date });

const flightBody = (f: Flight) => ({
  flight: `${f.airline}${f.flightNumber}`, date: f.date, from: f.from, to: f.to, seat: f.seat, cabin: f.cabin,
});

export const getFlightStatus = (f: Flight) =>
  request<{ status: LiveStatus | null }>('/api/flight-status', flightBody(f));

export const getBriefing = (f: Flight, passport: string, loyaltyStatus: string) =>
  request<{ briefing: Briefing; liveStatus: LiveStatus | null }>('/api/briefing', { ...flightBody(f), passport, loyaltyStatus });

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
  if (!a) return Promise.resolve(null);
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
  if (!a || days < -1 || days > 15) return null;
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
