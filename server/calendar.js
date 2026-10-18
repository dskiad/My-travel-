// Imports flights from any iCalendar (.ics) feed: TripIt, Google Calendar
// (flights Gmail adds automatically), Outlook/Microsoft 365, Kayak Trips,
// TripCase, Flighty calendar sync and most airline "add to calendar" files.
import dns from 'node:dns/promises';
import net from 'node:net';
import { getAirport, localParts, zonedToUtc } from './airports.js';

function unfold(ics) {
  // RFC 5545: lines starting with a space or tab continue the previous line.
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(value, params = '') {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) {
    return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7]) return { utc: new Date(`${local}Z`), allDay: false };
  const tzid = params.match(/TZID=("?)([^";:]+)\1/)?.[2];
  try {
    if (tzid) return { utc: zonedToUtc(local, tzid), allDay: false };
  } catch { /* unknown TZID: treat as floating time below */ }
  return { floating: local, allDay: false };
}

// The first ':' that is not inside a quoted parameter (TZID="…:…").
function nameValueSeparator(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) return i;
  }
  return -1;
}

export function parseEvents(ics) {
  const events = [];
  let current = null;
  for (const line of unfold(ics).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const idx = nameValueSeparator(line);
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const params = paramParts.join(';');
    const value = line.slice(idx + 1);
    if (name === 'DTSTART' || name === 'DTEND') current[name] = parseIcsDate(value, params);
    else current[name] = unescapeText(value);
  }
  return events;
}

const FLIGHT_CODE = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b/;

function findAirports(event) {
  const summary = event.SUMMARY || '';
  const text = [summary, event.DESCRIPTION || '', event.LOCATION || ''].join('\n');
  // "ATH to LHR", "ATH → LHR", "ATH-LHR"
  const pair = text.match(/\b([A-Z]{3})\s*(?:to|→|->|–|-|>)\s*([A-Z]{3})\b/);
  if (pair && getAirport(pair[1]) && getAirport(pair[2])) return [pair[1], pair[2]];
  // "Athens (ATH) … London (LHR)"
  const bracketed = [...text.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]).filter((c) => getAirport(c));
  const found = [...new Set(bracketed)];
  if (found.length >= 2) return found.slice(0, 2);
  // Last resort: known airport codes anywhere, location (usually the origin) first.
  const words = [...`${event.LOCATION || ''} ${summary} ${event.DESCRIPTION || ''}`.matchAll(/\b([A-Z]{3})\b/g)]
    .map((m) => m[1]).filter((c) => getAirport(c));
  const unique = [...new Set(words)];
  return unique.length >= 2 ? unique.slice(0, 2) : null;
}

export function parseFlight(event) {
  if (!event.DTSTART || event.DTSTART.allDay) return null;
  const summary = event.SUMMARY || '';
  const description = event.DESCRIPTION || '';
  const code = summary.match(/\(([A-Z0-9]{2})\s?(\d{1,4})\)/) || summary.match(FLIGHT_CODE) || description.match(FLIGHT_CODE);
  const airports = findAirports(event);
  if (!code || !airports) return null;
  const [from, to] = airports;
  const origin = getAirport(from);
  const dest = getAirport(to);

  const start = event.DTSTART;
  const end = event.DTEND;
  const dep = start.utc ? localParts(start.utc, origin.tz) : { date: start.floating.slice(0, 10), time: start.floating.slice(11, 16) };
  const arr = end?.utc ? localParts(end.utc, dest.tz) : end?.floating ? { time: end.floating.slice(11, 16) } : null;

  const conf = description.match(/(?:Confirmation|Booking reference|Record locator|PNR)[^A-Z0-9]{0,15}([A-Z0-9]{6})\b/i);
  const seat = description.match(/Seat[s]?\s*:?\s*(\d{1,2}[A-K])\b/i);
  return {
    airline: code[1],
    flightNumber: code[2].replace(/^0+(?=\d)/, ''),
    date: dep.date,
    from,
    to,
    depLocal: dep.time,
    arrLocal: arr?.time,
    depUtc: start.utc?.toISOString(),
    arrUtc: end?.utc?.toISOString(),
    pnr: conf ? conf[1].toUpperCase() : undefined,
    seat: seat ? seat[1] : undefined,
  };
}

export function parseCalendar(ics) {
  const events = parseEvents(ics);
  // TripIt (and some others) add an all-day event spanning each trip.
  const trips = events
    .filter((e) => e.DTSTART?.allDay)
    .map((e) => ({ name: e.SUMMARY || 'Trip', start: e.DTSTART.date, end: e.DTEND?.date || e.DTSTART.date }));
  const flights = [];
  for (const event of events) {
    const flight = parseFlight(event);
    if (!flight) continue;
    const trip = trips.find((t) => flight.date >= t.start && flight.date <= t.end);
    if (trip) flight.trip = trip.name;
    flights.push(flight);
  }
  return flights.sort((a, b) => (a.depUtc || a.date).localeCompare(b.depUtc || b.date));
}

// ---------- fetching (with protection against reaching internal services) ----------

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') ||
    (v6.startsWith('::ffff:') && isPrivateAddress(v6.slice(7)));
}

async function assertPublicUrl(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Calendar link must start with https://');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That calendar address is not reachable from the internet');
  }
}

export async function fetchCalendar(feedUrl, maxBytes = 5_000_000) {
  let url = new URL(String(feedUrl).trim().replace(/^webcals?:/i, 'https:'));
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'MyTravelApp/2.0', Accept: 'text/calendar,*/*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new Error(`The calendar returned HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > maxBytes) throw new Error('This calendar is too large to import');
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That link is not an iCalendar (.ics) feed');
    return parseCalendar(text);
  }
  throw new Error('Too many redirects');
}
