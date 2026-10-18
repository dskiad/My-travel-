// Reads a TripIt private iCal feed (TripIt → Settings → Calendar Feeds →
// "Subscribe to your calendar") and turns it into trips with flights.

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
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`;
  return { date: iso, allDay: false };
}

export function parseEvents(ics) {
  const events = [];
  let current = null;
  for (const line of unfold(ics).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const params = paramParts.join(';');
    const value = line.slice(idx + 1);
    if (name === 'DTSTART' || name === 'DTEND') current[name] = parseIcsDate(value, params);
    else current[name] = unescapeText(value);
  }
  return events;
}

// TripIt flight summaries look like "AA100 JFK to LHR" or "A3 600 ATH to LHR".
const FLIGHT_RE = /\b([A-Z0-9]{2})\s?(\d{1,4})\b.*?\b([A-Z]{3})\s+to\s+([A-Z]{3})\b/;

export function parseFlight(event) {
  const summary = event.SUMMARY || '';
  const m = summary.match(FLIGHT_RE);
  if (!m || !event.DTSTART || event.DTSTART.allDay) return null;
  const description = event.DESCRIPTION || '';
  const conf = description.match(/Confirmation\s*(?:#|number|no\.?)?:?\s*([A-Z0-9]{5,8})/i);
  const seat = description.match(/Seat[s]?\s*:?\s*(\d{1,2}[A-K])\b/i);
  return {
    airline: m[1],
    flightNumber: m[2],
    flight: `${m[1]}${m[2]}`,
    from: m[3],
    to: m[4],
    departureUtc: event.DTSTART.date,
    arrivalUtc: event.DTEND?.date || null,
    date: event.DTSTART.date.slice(0, 10),
    pnr: conf ? conf[1] : null,
    seat: seat ? seat[1] : null,
    summary,
    location: event.LOCATION || null,
  };
}

export function buildTrips(ics) {
  const events = parseEvents(ics);
  const trips = events
    .filter((e) => e.DTSTART?.allDay)
    .map((e) => ({
      id: e.UID || e.SUMMARY,
      name: e.SUMMARY || 'Trip',
      start: e.DTSTART.date,
      end: e.DTEND?.date || e.DTSTART.date,
      url: e.URL || null,
      flights: [],
    }));

  const unassigned = [];
  for (const event of events) {
    const flight = parseFlight(event);
    if (!flight) continue;
    // Trip end dates in iCal are exclusive; compare by calendar day.
    const trip = trips.find((t) => flight.date >= t.start && flight.date <= t.end);
    (trip ? trip.flights : unassigned).push(flight);
  }
  if (unassigned.length) {
    trips.push({ id: 'other-flights', name: 'Other flights', start: unassigned[0].date, end: unassigned.at(-1).date, url: null, flights: unassigned });
  }
  for (const trip of trips) trip.flights.sort((a, b) => a.departureUtc.localeCompare(b.departureUtc));
  return trips
    .filter((t) => t.flights.length)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchTripItTrips(feedUrl) {
  const url = new URL(feedUrl.replace(/^webcal:/i, 'https:'));
  if (!/(^|\.)tripit\.com$/i.test(url.hostname)) {
    throw new Error('Please use your TripIt calendar feed URL (it is on tripit.com)');
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'MyTravelApp/1.0' } });
  if (!res.ok) throw new Error(`TripIt feed returned HTTP ${res.status}`);
  return buildTrips(await res.text());
}
