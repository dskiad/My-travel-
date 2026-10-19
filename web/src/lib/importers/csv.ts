// Imports flight logbooks exported from other apps as CSV: Flighty,
// myFlightradar24, OpenFlights, JetLovers, spreadsheets… Columns are matched
// by name, so any CSV with at least date, origin and destination works.
import Papa from 'papaparse';
import { parseFlightCode } from '../flights.ts';
import { resolveAirline, resolveAirport } from '../geo.ts';
import type { Cabin, FlightDraft } from '../types.ts';

const ALIASES: Record<string, string[]> = {
  date: ['date', 'flight date', 'departure date', 'dep date', 'local departure date'],
  flight: ['flight', 'flight number', 'flight_number', 'flight no', 'flight #', 'flightnumber', 'number', 'flight code'],
  airline: ['airline', 'carrier', 'airline code', 'operating airline', 'marketing airline'],
  from: ['from', 'origin', 'departure', 'departure airport', 'dep airport', 'from airport', 'origin airport', 'dep'],
  to: ['to', 'destination', 'arrival', 'arrival airport', 'arr airport', 'to airport', 'destination airport', 'arr'],
  dep: ['dep time', 'departure time', 'std', 'gate departure (scheduled)', 'scheduled departure', 'take off (scheduled)'],
  arr: ['arr time', 'arrival time', 'sta', 'gate arrival (scheduled)', 'scheduled arrival', 'landing (scheduled)'],
  seat: ['seat', 'seat number', 'seat no'],
  cabin: ['class', 'cabin', 'cabin class', 'flight class', 'travel class', 'seat class'],
  aircraft: ['aircraft', 'aircraft type', 'aircraft type name', 'plane', 'equipment'],
  pnr: ['pnr', 'booking reference', 'confirmation', 'record locator', 'booking ref', 'confirmation code'],
  notes: ['note', 'notes', 'comment', 'comments'],
};

function findColumns(headers: string[]) {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '));
  const cols: Record<string, string | undefined> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const i = norm.findIndex((h) => aliases.includes(h));
    cols[field] = i >= 0 ? headers[i] : undefined;
  }
  return cols;
}

/** ISO dates, plus European day-first dates (DD/MM/YYYY, DD.MM.YYYY). */
export function parseDate(value = ''): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    let [day, month] = [+m[1], +m[2]];
    if (month > 12 && day <= 12) [day, month] = [month, day]; // clearly US-style
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

export function parseTime(value = ''): string | undefined {
  const m = value.match(/(?:^|[ T])(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

export function parseCabin(value = ''): Cabin | undefined {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (v.includes('first') || v === 'f') return 'First';
  if (v.includes('premium') || v === 'w') return 'Premium Economy';
  if (v.includes('business') || v === 'c' || v === 'j') return 'Business';
  if (v.includes('economy') || v === 'y') return 'Economy';
  return undefined;
}

export interface CsvResult {
  flights: FlightDraft[];
  skipped: number;
  columns: Record<string, string | undefined>;
}

export function parseFlightCsv(text: string): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  const columns = findColumns(parsed.meta.fields || []);
  if (!columns.date || !columns.from || !columns.to) {
    throw new Error('The CSV needs at least Date, From/Origin and To/Destination columns');
  }
  const flights: FlightDraft[] = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const get = (k: string) => (columns[k] ? String(row[columns[k]!] ?? '').trim() : '');
    const date = parseDate(get('date'));
    const from = resolveAirport(get('from'));
    const to = resolveAirport(get('to'));
    const rawFlight = get('flight');
    const code = parseFlightCode(rawFlight);
    const airline = code?.airline || resolveAirline(get('airline'));
    const flightNumber = code?.flightNumber || rawFlight.replace(/\D/g, '');
    if (!date || !from || !to || !airline) { skipped++; continue; }
    flights.push({
      airline,
      flightNumber: flightNumber || '?',
      date,
      from,
      to,
      depLocal: parseTime(get('dep')),
      arrLocal: parseTime(get('arr')),
      seat: get('seat') || undefined,
      cabin: parseCabin(get('cabin')),
      aircraft: get('aircraft') || undefined,
      pnr: get('pnr') || undefined,
      notes: get('notes') || undefined,
      source: 'csv',
    });
  }
  return { flights, skipped, columns };
}
