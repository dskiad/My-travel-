import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar } from '../server/calendar.js';

const ics = (...events) => ['BEGIN:VCALENDAR', ...events.flat(), 'END:VCALENDAR'].join('\r\n');

test('TripIt feed: flights grouped into the trip, times converted to airport local time', () => {
  const flights = parseCalendar(ics(
    ['BEGIN:VEVENT', 'UID:trip-1', 'SUMMARY:London\\, United Kingdom\\, October 2026',
      'DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261025', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:flight-1', 'SUMMARY:A3600 ATH to LHR',
      'DTSTART:20261020T043500Z', 'DTEND:20261020T075500Z',
      'DESCRIPTION:[Flight] 10/20/2026 Aegean Airlines(A3) #600 dep ATH 7:35am EEST\\; arr LHR 8:55am BST\\n',
      '  Confirmation #: ABC123\\nSeat: 2A', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:flight-2', 'SUMMARY:A3 601 LHR to ATH',
      'DTSTART:20261024T100000Z', 'DTEND:20261024T134000Z', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:hotel-1', 'SUMMARY:Check-in: The Savoy', 'DTSTART:20261020T140000Z', 'END:VEVENT'],
  ));
  assert.equal(flights.length, 2);
  const [out, back] = flights;
  assert.deepEqual(
    { airline: out.airline, flightNumber: out.flightNumber, from: out.from, to: out.to, date: out.date, depLocal: out.depLocal, arrLocal: out.arrLocal, pnr: out.pnr, seat: out.seat, trip: out.trip },
    { airline: 'A3', flightNumber: '600', from: 'ATH', to: 'LHR', date: '2026-10-20', depLocal: '07:35', arrLocal: '08:55', pnr: 'ABC123', seat: '2A', trip: 'London, United Kingdom, October 2026' },
  );
  assert.equal(back.airline + back.flightNumber, 'A3601');
  assert.equal(back.depLocal, '11:00');
});

test('Google Calendar style flight event with TZID and bracketed airports', () => {
  const [f] = parseCalendar(ics(
    ['BEGIN:VEVENT', 'SUMMARY:Flight to London (BA 633)',
      'DTSTART;TZID="Europe/Athens":20261102T221500', 'DTEND;TZID=Europe/London:20261103T001500',
      'LOCATION:Athens ATH', 'DESCRIPTION:British Airways flight 633\\nAthens (ATH) to London (LHR)\\nBooking reference: XK7P2Q',
      'END:VEVENT'],
  ));
  assert.equal(f.airline, 'BA');
  assert.equal(f.flightNumber, '633');
  assert.equal(f.from, 'ATH');
  assert.equal(f.to, 'LHR');
  assert.equal(f.date, '2026-11-02');
  assert.equal(f.depLocal, '22:15');
  assert.equal(f.arrLocal, '00:15');
  assert.equal(f.depUtc, '2026-11-02T20:15:00.000Z');
  assert.equal(f.pnr, 'XK7P2Q');
});

test('ignores events that are not flights', () => {
  assert.deepEqual(parseCalendar(ics(
    ['BEGIN:VEVENT', 'SUMMARY:Dinner at Nobu', 'DTSTART:20261020T190000Z', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'SUMMARY:Team meeting room B12', 'DTSTART:20261021T090000Z', 'END:VEVENT'],
  )), []);
});
