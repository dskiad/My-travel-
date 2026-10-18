// Airport reference data shared with the web app (web/public/data).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'data');
let airports;

export function getAirport(code) {
  airports ??= JSON.parse(fs.readFileSync(path.join(dataDir, 'airports.json'), 'utf8'));
  const row = code && airports[code.toUpperCase()];
  return row ? { iata: code.toUpperCase(), name: row[0], city: row[1], country: row[2], tz: row[5] } : null;
}

/** Wall-clock parts of an instant in a time zone: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function localParts(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** The UTC instant of a wall-clock time ("YYYY-MM-DDTHH:MM:SS") in a time zone. */
export function zonedToUtc(local, timeZone) {
  const guess = new Date(`${local}Z`);
  const { date, time } = localParts(guess, timeZone);
  const asLocal = Date.parse(`${date}T${time}:00Z`);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
