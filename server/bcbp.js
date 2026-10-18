// Parser for IATA Bar Coded Boarding Pass (BCBP, Resolution 792) strings.
// This is the text encoded in the PDF417 / Aztec / QR barcode on every boarding
// pass, including the ones stored in Google Wallet and Apple Wallet.

const CABINS = {
  F: 'First', A: 'First', P: 'First', R: 'First',
  J: 'Business', C: 'Business', D: 'Business', I: 'Business', Z: 'Business',
  W: 'Premium Economy', E: 'Premium Economy', T: 'Premium Economy',
};

function cabinFromCompartment(code) {
  return CABINS[code] || 'Economy';
}

// BCBP stores only the day of year, so pick the year that puts the flight
// closest to "now" (boarding passes are issued shortly before departure).
export function julianToDate(dayOfYear, now = new Date()) {
  const day = parseInt(dayOfYear, 10);
  if (!day || day < 1 || day > 366) return null;
  const candidates = [-1, 0, 1].map((offset) => {
    const d = new Date(Date.UTC(now.getUTCFullYear() + offset, 0, 1));
    d.setUTCDate(day);
    return d;
  });
  candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
  return candidates[0].toISOString().slice(0, 10);
}

function parseLeg(str, start, now) {
  const f = (offset, len) => str.substr(start + offset, len).trim();
  const carrier = f(13, 3);
  const flightNumber = f(16, 5).replace(/^0+/, '').replace(/\s+/g, '');
  const compartment = f(24, 1);
  const seat = f(25, 4).replace(/^0+/, '');
  const varSize = parseInt(str.substr(start + 35, 2), 16) || 0;
  return {
    leg: {
      pnr: f(0, 7),
      from: f(7, 3),
      to: f(10, 3),
      airline: carrier,
      flightNumber,
      flight: `${carrier}${flightNumber}`,
      date: julianToDate(f(21, 3), now),
      compartment,
      cabin: cabinFromCompartment(compartment),
      seat,
      sequence: f(29, 5).replace(/^0+/, ''),
      passengerStatus: f(34, 1),
    },
    next: start + 37 + varSize,
  };
}

export function parseBCBP(raw, now = new Date()) {
  if (typeof raw !== 'string') throw new Error('Boarding pass data must be text');
  const str = raw.replace(/\r?\n/g, '');
  if (str[0] !== 'M' || str.length < 60) {
    throw new Error('Not a valid IATA boarding pass barcode (expected format "M")');
  }
  const legCount = parseInt(str[1], 10);
  if (!legCount) throw new Error('Boarding pass has no flight legs');

  const rawName = str.substr(2, 20).trim();
  const [last, first = ''] = rawName.split('/');
  const legs = [];
  let pos = 23;
  for (let i = 0; i < legCount && pos + 37 <= str.length; i++) {
    const { leg, next } = parseLeg(str, pos, now);
    legs.push(leg);
    pos = next;
  }

  return {
    passengerName: [first, last].filter(Boolean).join(' ').trim(),
    eTicket: str[22] === 'E',
    legs,
  };
}
