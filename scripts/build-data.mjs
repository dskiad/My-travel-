// Regenerates the bundled airport and airline datasets used for search,
// local clocks, maps and diary statistics.
//   node scripts/build-data.mjs [downloadDir]
// Sources (open data):
//   OurAirports (public domain)            https://ourairports.com/data/
//   mwgg/Airports (MIT) for time zones     https://github.com/mwgg/Airports
//   OpenFlights airlines (ODbL)            https://openflights.org/data
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('web/public/data');
const dir = process.argv[2];

async function load(name, url) {
  if (dir) return fs.readFile(path.join(dir, name), 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const round = (n) => Math.round(n * 1000) / 1000;

const [ourCsv, mwggJson, airlinesDat] = await Promise.all([
  load('ourairports.csv', 'https://davidmegginson.github.io/ourairports-data/airports.csv'),
  load('airports.json', 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json'),
  load('airlines.dat', 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat'),
]);

const tzByIcao = new Map();
const tzByIata = new Map();
for (const a of Object.values(JSON.parse(mwggJson))) {
  if (a.icao) tzByIcao.set(a.icao, a.tz);
  if (a.iata) tzByIata.set(a.iata, a.tz);
}

// Municipality names that differ from the city travellers know.
const CITY = {
  ATH: 'Athens', MXP: 'Milan', LIN: 'Milan', BGY: 'Milan', SAW: 'Istanbul', IAD: 'Washington',
  DCA: 'Washington', BWI: 'Baltimore', OTP: 'Bucharest', BRU: 'Brussels', CRL: 'Brussels', NRT: 'Tokyo',
  KIX: 'Osaka', ITM: 'Osaka', LTN: 'London', STN: 'London', LCY: 'London', SEN: 'London', BVA: 'Paris',
  BER: 'Berlin', CIA: 'Rome', NAP: 'Naples', BLQ: 'Bologna', VCE: 'Venice', TSF: 'Venice', BSL: 'Basel',
  GVA: 'Geneva', NCE: 'Nice', LYS: 'Lyon', EIN: 'Eindhoven', DUS: 'Düsseldorf', CGN: 'Cologne',
  HAM: 'Hamburg', STR: 'Stuttgart', TXL: 'Berlin', SXF: 'Berlin', KEF: 'Reykjavík', AYT: 'Antalya',
  ADB: 'Izmir', ESB: 'Ankara', TFS: 'Tenerife', TFN: 'Tenerife', PMI: 'Palma de Mallorca', AGP: 'Málaga',
  ALC: 'Alicante', LPA: 'Gran Canaria', FAO: 'Faro', OPO: 'Porto', SYD: 'Sydney', AUH: 'Abu Dhabi',
  SHJ: 'Sharjah', DWC: 'Dubai', JED: 'Jeddah', RUH: 'Riyadh', HKT: 'Phuket', DMK: 'Bangkok', KUL: 'Kuala Lumpur',
  CGK: 'Jakarta', MNL: 'Manila', PKX: 'Beijing', SHA: 'Shanghai', CAN: 'Guangzhou', TPE: 'Taipei',
  GMP: 'Seoul', YVR: 'Vancouver', SJC: 'San Jose', OAK: 'Oakland', FLL: 'Fort Lauderdale', MDW: 'Chicago',
  JFK: 'New York', EWR: 'Newark', GIG: 'Rio de Janeiro', SDU: 'Rio de Janeiro', EZE: 'Buenos Aires',
  AEP: 'Buenos Aires', SCL: 'Santiago', LIM: 'Lima', BOG: 'Bogotá', JTR: 'Santorini', CFU: 'Corfu',
  EFL: 'Kefalonia', ZTH: 'Zakynthos', CHQ: 'Chania', KGS: 'Kos', JMK: 'Mykonos', PVK: 'Preveza',
  LGW: 'London', ORY: 'Paris', CDG: 'Paris', OSL: 'Oslo', HEL: 'Helsinki', MEL: 'Melbourne',
};
const cleanCity = (iata, city) => CITY[iata] || city.replace(/\s*\(.*\)\s*/g, '').replace(/,.*$/, '').trim();

const SIZE = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const airports = {};
const icaoToIata = {};
const lines = ourCsv.split('\n');
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const r = parseCsvLine(line);
  const iata = r[col.iata_code];
  const size = SIZE[r[col.type]];
  if (!/^[A-Z]{3}$/.test(iata) || !size) continue;
  if (r[col.scheduled_service] !== 'yes' && size < 3) continue;
  const tz = tzByIcao.get(r[col.icao_code] || r[col.ident]) || tzByIata.get(iata);
  if (!tz) continue;
  const icao = r[col.icao_code] || r[col.gps_code];
  if (/^[A-Z]{4}$/.test(icao)) icaoToIata[icao] = iata;
  const prev = airports[iata];
  if (prev && prev[6] >= size) continue;
  airports[iata] = [
    r[col.name], cleanCity(iata, r[col.municipality]), r[col.iso_country],
    round(+r[col.latitude_deg]), round(+r[col.longitude_deg]), tz, size,
  ];
}

const airlines = {};
for (const line of airlinesDat.split('\n')) {
  if (!line.trim()) continue;
  const [, name, , iata, icao, , country, active] = parseCsvLine(line);
  if (!/^[A-Z0-9]{2}$/.test(iata) || iata === '--') continue;
  const score = (active === 'Y' ? 2 : 0) + (icao && icao !== '\\N' ? 1 : 0);
  if (airlines[iata] && airlines[iata].score >= score) continue;
  airlines[iata] = { score, name, icao: /^[A-Z]{3}$/.test(icao) ? icao : '', country: country === '\\N' ? '' : country };
}

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'airports.json'), JSON.stringify(airports));
await fs.writeFile(path.join(OUT, 'airport-icao.json'), JSON.stringify(icaoToIata));
await fs.writeFile(path.join(OUT, 'airlines.json'), JSON.stringify(
  Object.fromEntries(Object.entries(airlines).map(([k, v]) => [k, [v.name, v.country, v.icao]])),
));
console.log(`airports: ${Object.keys(airports).length}, airlines: ${Object.keys(airlines).length}`);
