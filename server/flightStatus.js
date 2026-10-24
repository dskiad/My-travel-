// Live flight status (terminal, gate, delays, belt) from AeroDataBox.
// Get a key at https://rapidapi.com/aedbx-aedbx/api/aerodatabox and set
// AERODATABOX_API_KEY. Without a key the app falls back to the Claude briefing.

const HOST = 'aerodatabox.p.rapidapi.com';

function pickTime(t, key) {
  // AeroDataBox has used both { utc, local } objects and flat *Utc/*Local fields.
  if (!t) return null;
  return t[key] || null;
}

function normaliseSide(side) {
  if (!side) return null;
  const airport = side.airport || {};
  const scheduled = side.scheduledTime || { utc: side.scheduledTimeUtc, local: side.scheduledTimeLocal };
  const revised = side.revisedTime || side.predictedTime ||
    (side.actualTimeUtc ? { utc: side.actualTimeUtc, local: side.actualTimeLocal } : null);
  const scheduledUtc = pickTime(scheduled, 'utc');
  const revisedUtc = pickTime(revised, 'utc');
  let delayMinutes = null;
  if (scheduledUtc && revisedUtc) {
    const diff = (Date.parse(revisedUtc.replace(' ', 'T')) - Date.parse(scheduledUtc.replace(' ', 'T'))) / 60000;
    if (!Number.isNaN(diff)) delayMinutes = Math.round(diff);
  }
  return {
    airport: {
      iata: airport.iata || null,
      icao: airport.icao || null,
      name: airport.name || airport.shortName || null,
      city: airport.municipalityName || null,
      countryCode: airport.countryCode || null,
      timeZone: airport.timeZone || null,
    },
    scheduledUtc,
    scheduledLocal: pickTime(scheduled, 'local'),
    revisedUtc,
    revisedLocal: pickTime(revised, 'local'),
    delayMinutes,
    terminal: side.terminal || null,
    gate: side.gate || null,
    checkInDesk: side.checkInDesk || null,
    baggageBelt: side.baggageBelt || null,
  };
}

export function normaliseFlight(f) {
  return {
    source: 'AeroDataBox',
    number: f.number,
    status: f.status || 'Unknown',
    airline: f.airline ? { name: f.airline.name, iata: f.airline.iata, icao: f.airline.icao } : null,
    aircraft: f.aircraft?.model || null,
    departure: normaliseSide(f.departure),
    arrival: normaliseSide(f.arrival),
    codeshareStatus: f.codeshareStatus || null,
    lastUpdatedUtc: f.lastUpdatedUtc || null,
  };
}

export function hasFlightStatusProvider() {
  return Boolean(process.env.AERODATABOX_API_KEY);
}

export async function getFlightStatus({ flight, date, from }) {
  if (!hasFlightStatusProvider()) return null;
  const number = flight.replace(/\s+/g, '').toUpperCase();
  const url = `https://${HOST}/flights/number/${encodeURIComponent(number)}/${date}?withAircraftImage=false&withLocation=false`;
  const res = await fetch(url, {
    headers: { 'X-RapidAPI-Key': process.env.AERODATABOX_API_KEY, 'X-RapidAPI-Host': HOST },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Flight status provider returned HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list) || !list.length) return null;
  // A flight number can have several legs on the same day; prefer the one
  // leaving from the user's departure airport.
  const match = (from && list.find((f) => f.departure?.airport?.iata === from.toUpperCase())) || list[0];
  return normaliseFlight(match);
}
