import { airport, distanceKm, estimateMinutes } from './geo.ts';
import type { Flight, FlightDraft } from './types.ts';

export const flightCode = (f: Pick<Flight, 'airline' | 'flightNumber'>) => `${f.airline}${f.flightNumber}`;
export const flightKey = (f: Pick<Flight, 'airline' | 'flightNumber' | 'date'>) =>
  `${f.airline.toUpperCase()}${String(f.flightNumber).replace(/^0+/, '')}|${f.date}`;

/** Sortable departure instant: real UTC when known, else local date + time. */
export function departureSortKey(f: Pick<Flight, 'date' | 'depUtc' | 'depLocal'>) {
  return f.depUtc || `${f.date}T${f.depLocal || '00:00'}`;
}

export function sortFlights(list: Flight[]): Flight[] {
  return [...list].sort((a, b) => departureSortKey(a).localeCompare(departureSortKey(b)));
}

/** Convert a local wall-clock time at an airport to a UTC Date. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(guess);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

export function departureDate(f: Flight): Date {
  if (f.depUtc) return new Date(f.depUtc);
  const tz = airport(f.from)?.tz;
  return tz ? zonedToUtc(f.date, f.depLocal || '12:00', tz) : new Date(`${f.date}T${f.depLocal || '12:00'}:00`);
}

export function durationMinutes(f: Flight): number {
  if (f.depUtc && f.arrUtc) {
    const m = (Date.parse(f.arrUtc) - Date.parse(f.depUtc)) / 60000;
    if (m > 0 && m < 24 * 60) return Math.round(m);
  }
  const tzFrom = airport(f.from)?.tz;
  const tzTo = airport(f.to)?.tz;
  if (f.depLocal && f.arrLocal && tzFrom && tzTo) {
    const dep = zonedToUtc(f.date, f.depLocal, tzFrom).getTime();
    let arr = zonedToUtc(f.date, f.arrLocal, tzTo).getTime();
    while (arr <= dep) arr += 864e5; // overnight arrival
    const minutes = (arr - dep) / 60000;
    if (minutes < 24 * 60) return Math.round(minutes);
  }
  return estimateMinutes(distanceKm(airport(f.from), airport(f.to)));
}

export const isPast = (f: Flight, now = Date.now()) => departureDate(f).getTime() + durationMinutes(f) * 60000 < now;

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Normalise loosely-typed input ("a3 0600", "A3600") into airline + number. */
export function parseFlightCode(input: string): { airline: string; flightNumber: string } | null {
  const m = input.toUpperCase().replace(/[\s-]+/g, '').match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/);
  if (!m || /^\d\d$/.test(m[1])) return null;
  return { airline: m[1], flightNumber: m[2].replace(/^0+(?=\d)/, '') };
}

export function draftIsComplete(d: FlightDraft) {
  return Boolean(d.airline && d.flightNumber && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.from && d.to);
}

export interface DiaryStats {
  flights: number;
  km: number;
  minutes: number;
  airports: number;
  countries: number;
  airlines: number;
  longest?: Flight;
  topAirline?: [string, number];
  topRoute?: [string, number];
  byYear: Record<string, number>;
}

export function computeStats(list: Flight[]): DiaryStats {
  const airports = new Set<string>();
  const countries = new Set<string>();
  const airlineCount = new Map<string, number>();
  const routeCount = new Map<string, number>();
  const byYear: Record<string, number> = {};
  let km = 0;
  let minutes = 0;
  let longest: Flight | undefined;
  let longestKm = 0;
  for (const f of list) {
    const a = airport(f.from);
    const b = airport(f.to);
    const d = distanceKm(a, b);
    km += d;
    minutes += durationMinutes(f);
    if (d > longestKm) { longestKm = d; longest = f; }
    [f.from, f.to].forEach((c) => c && airports.add(c));
    [a?.country, b?.country].forEach((c) => c && countries.add(c));
    airlineCount.set(f.airline, (airlineCount.get(f.airline) || 0) + 1);
    const route = [f.from, f.to].sort().join('–');
    routeCount.set(route, (routeCount.get(route) || 0) + 1);
    const y = f.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1])[0];
  return {
    flights: list.length, km, minutes, airports: airports.size, countries: countries.size,
    airlines: airlineCount.size, longest, topAirline: top(airlineCount), topRoute: top(routeCount), byYear,
  };
}
