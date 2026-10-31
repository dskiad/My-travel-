import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCalendar } from './calendar.js';
import { parseBCBP } from './bcbp.js';
import { getFlightStatus, hasFlightStatusProvider } from './flightStatus.js';
import { buildBriefing, extractCards, extractFlights, hasClaude, RefusalError } from './claude.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
const app = express();

app.get('/healthz', (req, res) => res.send('ok'));

// Optional password so a public deployment can't spend your API credits.
// The browser asks once; any username works.
if (process.env.APP_PASSWORD) {
  const expected = Buffer.from(process.env.APP_PASSWORD);
  app.use((req, res, next) => {
    const [scheme, encoded = ''] = (req.headers.authorization || '').split(' ');
    const password = Buffer.from(Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':'));
    if (scheme === 'Basic' && password.length === expected.length && crypto.timingSafeEqual(password, expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="My Travel"').status(401).send('Password required');
  });
}

app.use(express.json({ limit: '15mb' }));

const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function validateFlight(body) {
  const flight = String(body.flight || `${body.airline || ''}${body.flightNumber || ''}`).replace(/\s+/g, '').toUpperCase();
  const date = String(body.date || '');
  if (!FLIGHT_RE.test(flight)) throw badRequest('Enter a flight like A3600 or LH1283');
  if (!DATE_RE.test(date)) throw badRequest('Enter the departure date as YYYY-MM-DD');
  return {
    flight,
    airline: flight.slice(0, 2),
    date,
    from: body.from ? String(body.from).toUpperCase().slice(0, 3) : null,
    to: body.to ? String(body.to).toUpperCase().slice(0, 3) : null,
    seat: body.seat ? String(body.seat).slice(0, 4) : null,
    cabin: body.cabin ? String(body.cabin).slice(0, 20) : null,
  };
}

const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    const status = err.status || (err instanceof RefusalError ? 422 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message });
  }
};

function requireClaude() {
  if (!hasClaude()) throw Object.assign(new Error('Set ANTHROPIC_API_KEY on the server to use this'), { status: 503 });
}

app.get('/api/config', route(async () => ({
  claude: hasClaude(),
  liveFlightStatus: hasFlightStatusProvider(),
})));

// ---------- importing flights ----------

app.post('/api/import/calendar', route(async (req) => {
  if (!req.body.url) throw badRequest('Paste your calendar link');
  try {
    return { flights: await fetchCalendar(req.body.url) };
  } catch (err) {
    throw Object.assign(err, { status: err.status || 400 });
  }
}));

app.post('/api/import/barcode', route(async (req) => {
  try {
    return parseBCBP(req.body.text || '');
  } catch (err) {
    throw badRequest(err.message);
  }
}));

app.post('/api/import/cards', route(async (req) => {
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 10) : [];
  if (images.some((i) => !/^image\/(png|jpeg|webp|gif)$/.test(i?.mediaType || '') || typeof i.base64 !== 'string')) {
    throw badRequest('Upload PNG, JPEG, WebP or GIF screenshots');
  }
  const text = req.body.text ? String(req.body.text).slice(0, 60000) : undefined;
  if (!images.length && !text) throw badRequest('Add a screenshot of the card');
  requireClaude();
  return extractCards({ images, text });
}));

app.post('/api/import/document', route(async (req) => {
  const { imageBase64, mediaType, pdfBase64, text } = req.body;
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 10) : [];
  const isImage = (t) => /^image\/(png|jpeg|webp|gif)$/.test(t || '');
  if (imageBase64 && !isImage(mediaType)) throw badRequest('Upload a PNG, JPEG, WebP or GIF image');
  if (images.some((i) => !isImage(i?.mediaType) || typeof i.base64 !== 'string')) throw badRequest('Upload PNG, JPEG, WebP or GIF screenshots');
  if (!imageBase64 && !images.length && !pdfBase64 && !String(text || '').trim()) throw badRequest('Add a file or paste the email text');
  if (text && text.length > 100_000) throw badRequest('That text is too long; paste just the booking email');
  requireClaude();
  return extractFlights({ imageBase64, mediaType, images, pdfBase64, text: text ? String(text) : undefined });
}));

const timeOf = (local) => String(local || '').match(/[ T](\d{2}:\d{2})/)?.[1];
function isoOf(utc) {
  const d = new Date(String(utc || '').replace(' ', 'T').replace(/Z?$/, 'Z'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

app.post('/api/flights/lookup', route(async (req) => {
  const flight = validateFlight(req.body);
  const status = await getFlightStatus(flight);
  if (!status) return { found: false, provider: hasFlightStatusProvider() };
  const dep = status.departure || {};
  const arr = status.arrival || {};
  return {
    found: true,
    flight: {
      from: dep.airport?.iata || undefined,
      to: arr.airport?.iata || undefined,
      depLocal: timeOf(dep.scheduledLocal),
      arrLocal: timeOf(arr.scheduledLocal),
      depUtc: isoOf(dep.scheduledUtc),
      arrUtc: isoOf(arr.scheduledUtc),
      aircraft: status.aircraft || undefined,
    },
    status,
  };
}));

// ---------- live status and briefing ----------

app.post('/api/flight-status', route(async (req) => {
  const flight = validateFlight(req.body);
  return { status: await getFlightStatus(flight) };
}));

app.post('/api/briefing', route(async (req) => {
  const flight = validateFlight(req.body);
  requireClaude();
  let liveStatus = null;
  try {
    liveStatus = await getFlightStatus(flight);
  } catch (err) {
    console.warn('Live flight status unavailable:', err.message);
  }
  const briefing = await buildBriefing({
    flight,
    liveStatus,
    passport: String(req.body.passport || 'Greece').slice(0, 60),
    cabin: flight.cabin,
    status: req.body.loyaltyStatus ? String(req.body.loyaltyStatus).slice(0, 500) : null,
  });
  return { briefing, liveStatus };
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- web app ----------

if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  // Client-side routes (/diary, /wallet, …) all load the app shell.
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Run "npm run build" to build the web app, or "npm run dev:web" for development.'));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`My Travel running on http://localhost:${port}`));
