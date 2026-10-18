import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBCBP, julianToDate } from '../server/bcbp.js';

// Build a leg the way airlines encode it, so field widths are exact.
const pad = (s, n) => s.padEnd(n, ' ');
function leg({ pnr, from, to, carrier, flight, day, cls, seat, seq, varData = '' }) {
  return pad(pnr, 7) + from + to + pad(carrier, 3) + flight.padStart(4, '0').padEnd(5, ' ') +
    String(day).padStart(3, '0') + cls + seat.padStart(4, '0') + seq.padStart(4, '0').padEnd(5, ' ') + '3' +
    varData.length.toString(16).toUpperCase().padStart(2, '0') + varData;
}

const now = new Date('2026-10-18T10:00:00Z');

test('parses a single-leg Aegean boarding pass', () => {
  const raw = 'M1' + pad('PAPADOPOULOS/GEORGE', 20) + 'E' +
    leg({ pnr: 'ABC123', from: 'ATH', to: 'LHR', carrier: 'A3', flight: '600', day: 293, cls: 'C', seat: '2A', seq: '12' });
  const pass = parseBCBP(raw, now);
  assert.equal(pass.passengerName, 'GEORGE PAPADOPOULOS');
  assert.equal(pass.eTicket, true);
  assert.equal(pass.legs.length, 1);
  assert.deepEqual(
    { ...pass.legs[0], passengerStatus: undefined },
    { pnr: 'ABC123', from: 'ATH', to: 'LHR', airline: 'A3', flightNumber: '600', flight: 'A3600',
      date: '2026-10-20', compartment: 'C', cabin: 'Business', seat: '2A', sequence: '12', passengerStatus: undefined },
  );
});

test('parses a two-leg pass with conditional data', () => {
  const raw = 'M2' + pad('DOE/JANE', 20) + 'E' +
    leg({ pnr: 'XYZ789', from: 'ATH', to: 'FRA', carrier: 'LH', flight: '1283', day: 300, cls: 'Y', seat: '23C', seq: '5', varData: '>5180' }) +
    leg({ pnr: 'XYZ789', from: 'FRA', to: 'JFK', carrier: 'LH', flight: '400', day: 300, cls: 'Y', seat: '41K', seq: '7' });
  const pass = parseBCBP(raw, now);
  assert.equal(pass.legs.length, 2);
  assert.equal(pass.legs[1].flight, 'LH400');
  assert.equal(pass.legs[1].from, 'FRA');
  assert.equal(pass.legs[1].seat, '41K');
  assert.equal(pass.legs[0].cabin, 'Economy');
});

test('julian dates roll over to the nearest year', () => {
  assert.equal(julianToDate('005', new Date('2026-12-28T00:00:00Z')), '2027-01-05');
  assert.equal(julianToDate('360', new Date('2027-01-03T00:00:00Z')), '2026-12-26');
});

test('rejects non-BCBP text', () => {
  assert.throws(() => parseBCBP('hello'), /Not a valid/);
});
