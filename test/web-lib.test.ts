import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { setReferenceData, resolveAirport, resolveAirline, distanceKm, airport, searchAirports } from '../web/src/lib/geo.ts';
import { parseFlightCsv, parseDate } from '../web/src/lib/importers/csv.ts';
import { parsePassJson, parsePkpass } from '../web/src/lib/importers/pkpass.ts';
import { computeStats, durationMinutes, parseFlightCode, zonedToUtc } from '../web/src/lib/flights.ts';
import { membershipsForAirline, statusSummary } from '../web/src/lib/loyalty.ts';
import type { Flight, Membership } from '../web/src/lib/types.ts';

const data = (name: string) => JSON.parse(fs.readFileSync(`web/public/data/${name}`, 'utf8'));
setReferenceData(data('airports.json'), data('airlines.json'), data('airport-icao.json'));

const flight = (p: Partial<Flight>): Flight => ({
  id: Math.random().toString(), airline: 'A3', flightNumber: '600', date: '2025-05-01', from: 'ATH', to: 'LHR',
  source: 'manual', createdAt: '', ...p,
});

test('resolves airports and airlines from the formats other apps export', () => {
  assert.equal(resolveAirport('LHR'), 'LHR');
  assert.equal(resolveAirport('EGLL'), 'LHR');
  assert.equal(resolveAirport('EGLL/LHR'), 'LHR');
  assert.equal(resolveAirport('Athens / Athens International (ATH/LGAV)'), 'ATH');
  assert.equal(resolveAirline('A3'), 'A3');
  assert.equal(resolveAirline('AEE'), 'A3');
  assert.equal(resolveAirline('Aegean Airlines (A3/AEE)'), 'A3');
  assert.equal(resolveAirline('Lufthansa'), 'LH');
  assert.equal(searchAirports('athens')[0].iata, 'ATH');
});

test('flight codes and dates', () => {
  assert.deepEqual(parseFlightCode('a3 0600'), { airline: 'A3', flightNumber: '600' });
  assert.deepEqual(parseFlightCode('6E-123'), { airline: '6E', flightNumber: '123' });
  assert.equal(parseFlightCode('hello'), null);
  assert.equal(parseDate('2024-03-07 10:20'), '2024-03-07');
  assert.equal(parseDate('07/03/2024'), '2024-03-07');
  assert.equal(parseDate('03/27/2024'), '2024-03-27');
});

test('imports a myFlightradar24-style CSV', () => {
  const csv = [
    'Date,Flight number,From,To,Dep time,Arr time,Duration,Airline,Aircraft,Registration,Seat number,Seat type,Flight class,Flight reason,Note',
    '2024-06-01,A3600,Athens / Athens International (ATH/LGAV),London / Heathrow (LHR/EGLL),07:35:00,09:55:00,04:20:00,Aegean Airlines (A3/AEE),Airbus A321neo (A21N),SX-NAA,2A,1,2,1,Great views',
    '2024-06-05,,London / Heathrow (LHR/EGLL),Athens / Athens International (ATH/LGAV),,,,British Airways (BA/BAW),,,,,,,',
    '2024-06-09,XX1,Nowhere,Somewhere,,,,,,,,,,,',
  ].join('\n');
  const { flights, skipped } = parseFlightCsv(csv);
  assert.equal(flights.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(
    { a: flights[0].airline, n: flights[0].flightNumber, f: flights[0].from, t: flights[0].to, d: flights[0].depLocal, s: flights[0].seat, ac: flights[0].aircraft },
    { a: 'A3', n: '600', f: 'ATH', t: 'LHR', d: '07:35', s: '2A', ac: 'Airbus A321neo (A21N)' },
  );
  assert.equal(flights[1].airline, 'BA');
});

test('imports a Flighty-style CSV with ICAO airline codes', () => {
  const csv = 'Date,Airline,Flight,From,To,Gate Departure (Scheduled),Seat,Cabin Class\n2025-01-10,DLH,1283,FRA,ATH,2025-01-10T10:05,14C,ECONOMY';
  const [f] = parseFlightCsv(csv).flights;
  assert.equal(f.airline, 'LH');
  assert.equal(f.flightNumber, '1283');
  assert.equal(f.depLocal, '10:05');
  assert.equal(f.cabin, 'Economy');
});

test('reads Apple Wallet passes (barcode and visible fields)', async () => {
  const bcbp = 'M1PAPADOPOULOS/GEORGE EABC123 ATHLHRA3 0600 293C002A0012 300';
  assert.equal(parsePassJson({ barcodes: [{ message: bcbp }] })[0].flightNumber, '600');
  const fields = parsePassJson({
    relevantDate: '2026-11-02T22:15+02:00',
    boardingPass: { primaryFields: [{ key: 'origin', value: 'ATH' }, { key: 'destination', value: 'LHR' }], auxiliaryFields: [{ key: 'flightNumber', label: 'Flight', value: 'BA 633' }, { key: 'seat', value: '3A' }] },
  })[0];
  assert.deepEqual([fields.airline, fields.flightNumber, fields.from, fields.to, fields.date, fields.seat], ['BA', '633', 'ATH', 'LHR', '2026-11-02', '3A']);
  const zip = zipSync({ 'pass.json': strToU8(JSON.stringify({ barcode: { message: bcbp } })) });
  const file = { arrayBuffer: async () => zip.buffer } as unknown as File;
  assert.equal((await parsePkpass(file))[0].to, 'LHR');
});

test('time zones, durations and diary stats', () => {
  assert.equal(zonedToUtc('2026-07-01', '07:35', 'Europe/Athens').toISOString(), '2026-07-01T04:35:00.000Z');
  assert.equal(durationMinutes(flight({ depLocal: '07:35', arrLocal: '09:55', date: '2026-07-01' })), 260);
  assert.equal(durationMinutes(flight({ from: 'ATH', to: 'JFK', depLocal: '23:30', arrLocal: '04:00', date: '2026-07-01' })), 690);
  const stats = computeStats([flight({}), flight({ from: 'LHR', to: 'ATH', airline: 'BA', date: '2025-05-05' }), flight({ from: 'ATH', to: 'JFK', date: '2024-01-01' })]);
  assert.equal(stats.flights, 3);
  assert.equal(stats.countries, 3);
  assert.equal(stats.airports, 3);
  assert.equal(stats.longest?.to, 'JFK');
  assert.ok(Math.abs(distanceKm(airport('ATH'), airport('LHR')) - 2400) < 50);
});

test('picks the right membership to credit a flight to', () => {
  const m = (programId: string, tier?: string): Membership => ({ id: programId, programId, memberNumber: '1', tier, barcode: 'none', createdAt: '' });
  const wallet = [m('bonvoy', 'Gold Elite'), m('milesandmore', 'Frequent Traveller'), m('milesbonus', 'Gold'), m('flyingblue')];
  assert.deepEqual(membershipsForAirline('A3', wallet).map((x) => x.program.id), ['milesbonus', 'milesandmore']);
  assert.deepEqual(membershipsForAirline('OA', wallet).map((x) => x.program.id), ['milesbonus']);
  assert.deepEqual(membershipsForAirline('KL', wallet).map((x) => x.program.id), ['flyingblue']);
  assert.deepEqual(membershipsForAirline('FR', wallet), []);
  assert.equal(statusSummary(wallet), 'Miles & More Frequent Traveller (Star Alliance); Miles+Bonus Gold (Star Alliance)');
});
