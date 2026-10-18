import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrips } from '../server/tripit.js';

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:trip-1',
  'SUMMARY:London\\, United Kingdom\\, October 2026',
  'DTSTART;VALUE=DATE:20261020',
  'DTEND;VALUE=DATE:20261025',
  'URL:https://www.tripit.com/trip/show/id/1',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:flight-1',
  'SUMMARY:A3600 ATH to LHR',
  'DTSTART:20261020T043500Z',
  'DTEND:20261020T085500Z',
  'DESCRIPTION:[Flight] 10/20/2026 Aegean Airlines(A3) #600 dep ATH 7:35am EEST\; arr LHR 8:55am BST\\n',
  '  Confirmation #: ABC123\\nSeat: 2A',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:flight-2',
  'SUMMARY:A3 601 LHR to ATH',
  'DTSTART:20261024T100000Z',
  'DTEND:20261024T134000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:hotel-1',
  'SUMMARY:Check-in: The Savoy',
  'DTSTART:20261020T140000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('groups TripIt flights under their trip', () => {
  const trips = buildTrips(ics);
  assert.equal(trips.length, 1);
  assert.equal(trips[0].name, 'London, United Kingdom, October 2026');
  assert.equal(trips[0].flights.length, 2);
  const [out, back] = trips[0].flights;
  assert.equal(out.flight, 'A3600');
  assert.equal(out.from, 'ATH');
  assert.equal(out.to, 'LHR');
  assert.equal(out.pnr, 'ABC123');
  assert.equal(out.seat, '2A');
  assert.equal(out.date, '2026-10-20');
  assert.equal(back.flight, 'A3601');
});
