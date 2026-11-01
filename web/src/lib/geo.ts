import { AIRLINES } from './airlines.ts';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  tz: string;
  size: number;
}

type AirportRow = [string, string, string, number, number, string, number];

let airports: Record<string, Airport> = {};
let airlineNames: Record<string, [string, string, string]> = {};
let airportByIcao: Record<string, string> = {};
let airlineByIcao: Record<string, string> = {};
let airlineByName: Record<string, string> = {};

/** Load bundled datasets (cached by the service worker after first use). */
export async function loadReferenceData(base = '/data') {
  // The claude.ai page version embeds the datasets in the page itself.
  const embedded = (globalThis as { __MT_DATA__?: { airports: Record<string, AirportRow>; airlines: Record<string, [string, string, string]>; icao: Record<string, string> } }).__MT_DATA__;
  if (embedded) {
    setReferenceData(embedded.airports, embedded.airlines, embedded.icao);
    return;
  }
  const json = (name: string) => fetch(`${base}/${name}`).then((r) => r.json());
  const [a, l, i] = await Promise.all([json('airports.json'), json('airlines.json'), json('airport-icao.json')]);
  setReferenceData(a, l, i);
}

export function setReferenceData(
  a: Record<string, AirportRow>,
  l: Record<string, [string, string, string]>,
  icao: Record<string, string> = {},
) {
  airports = Object.fromEntries(Object.entries(a).map(([iata, [name, city, country, lat, lon, tz, size]]) =>
    [iata, { iata, name, city, country, lat, lon, tz, size }]));
  airlineNames = l;
  airportByIcao = icao;
  airlineByIcao = {};
  airlineByName = {};
  for (const [iata, [name, , icaoCode]] of Object.entries(l)) {
    if (icaoCode) airlineByIcao[icaoCode] = iata;
    airlineByName[name.toLowerCase()] = iata;
  }
  for (const [iata, { name }] of Object.entries(AIRLINES)) airlineByName[name.toLowerCase()] = iata;
}

/** Resolve an airport given as IATA, ICAO, "EGLL/LHR" or "Name (LHR/EGLL)". */
export function resolveAirport(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(t) && airports[t]) return t;
  if (/^[A-Z]{4}$/.test(t)) return airportByIcao[t];
  // Codes in brackets ("Athens (ATH/LGAV)") are more reliable than loose words.
  const bracketed = t.match(/\(([^)]*)\)/)?.[1] || '';
  for (const source of [bracketed, t]) {
    for (const m of source.matchAll(/\b([A-Z]{3,4})\b/g)) {
      const code = m[1];
      if (code.length === 3 && airports[code]) return code;
      if (code.length === 4 && airportByIcao[code]) return airportByIcao[code];
    }
  }
  return undefined;
}

/** Resolve an airline given as IATA, ICAO, "Name (A3/AEE)" or its name. */
export function resolveAirline(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  const up = t.toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(up) && !/^\d\d$/.test(up)) return up;
  if (/^[A-Z]{3}$/.test(up) && airlineByIcao[up]) return airlineByIcao[up];
  const paren = up.match(/\(([A-Z0-9]{2})(?:\/[A-Z]{3})?\)/);
  if (paren) return paren[1];
  const icaoParen = up.match(/\(([A-Z]{3})\)/);
  if (icaoParen && airlineByIcao[icaoParen[1]]) return airlineByIcao[icaoParen[1]];
  return airlineByName[t.toLowerCase()] || airlineByName[t.replace(/\s*\(.*\)\s*/, '').toLowerCase()];
}

export const airport = (code?: string): Airport | undefined => (code ? airports[code.toUpperCase()] : undefined);

/** ICAO code of an airline (A3 → AEE), used by flight trackers. */
export const airlineIcao = (code: string): string => airlineNames[code]?.[2] || '';

export function airlineName(code: string): string {
  return AIRLINES[code]?.name || airlineNames[code]?.[0] || code;
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

export function countryName(code?: string): string {
  if (!code) return '';
  try { return regionNames?.of(code) || code; } catch { return code; }
}

export function flagEmoji(code?: string): string {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** Great-circle distance in km. */
export function distanceKm(a?: Airport, b?: Airport): number {
  if (!a || !b) return 0;
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Typical block time when the schedule is unknown: taxi + climb + cruise at ~800 km/h. */
export function estimateMinutes(km: number): number {
  return km ? Math.round(30 + (km / 800) * 60) : 0;
}

// Main airports of cities with several, so "London" suggests Heathrow first.
const HUBS = new Set([
  'LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'BCN', 'FCO', 'MXP', 'MUC', 'IST', 'ATH', 'DXB', 'DOH', 'JFK', 'EWR',
  'LAX', 'ORD', 'ATL', 'DFW', 'IAD', 'SFO', 'MIA', 'BOS', 'YYZ', 'YUL', 'GRU', 'GIG', 'EZE', 'MEX', 'NRT',
  'HND', 'ICN', 'PEK', 'PVG', 'HKG', 'SIN', 'BKK', 'KUL', 'DEL', 'BOM', 'SYD', 'MEL', 'JNB', 'CAI', 'TLV',
  'ZRH', 'VIE', 'CPH', 'ARN', 'OSL', 'HEL', 'LIS', 'DUB', 'BRU', 'WAW', 'PRG', 'BUD', 'OTP', 'SOF', 'SVO',
]);

/** Search airports by code, city or name; main and bigger airports first. */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = airports[q.toUpperCase()];
  const scored: [number, Airport][] = [];
  for (const a of Object.values(airports)) {
    if (a === exact) continue;
    const city = a.city.toLowerCase();
    const name = a.name.toLowerCase();
    let score = 0;
    if (city.startsWith(q)) score = 30;
    else if (name.startsWith(q)) score = 20;
    else if (city.includes(q) || name.includes(q)) score = 10;
    if (score) scored.push([score + a.size * 3 + (HUBS.has(a.iata) ? 5 : 0), a]);
  }
  scored.sort((x, y) => y[0] - x[0]);
  return [...(exact ? [exact] : []), ...scored.slice(0, limit).map(([, a]) => a)].slice(0, limit);
}

export function allAirports(): Airport[] {
  return Object.values(airports);
}
