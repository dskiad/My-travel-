import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchTripItTrips } from './tripit.js';
import { parseBCBP } from './bcbp.js';
import { getFlightStatus, hasFlightStatusProvider } from './flightStatus.js';
import { buildBriefing, extractBoardingPass, hasClaude, RefusalError } from './claude.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(here, '..', 'public')));

const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateFlight(body) {
  const flight = String(body.flight || `${body.airline || ''}${body.flightNumber || ''}`).replace(/\s+/g, '').toUpperCase();
  const date = String(body.date || '');
  if (!FLIGHT_RE.test(flight)) throw Object.assign(new Error('Enter a flight like A3600 or LH1283'), { status: 400 });
  if (!DATE_RE.test(date)) throw Object.assign(new Error('Enter the departure date as YYYY-MM-DD'), { status: 400 });
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

app.get('/api/config', route(async () => ({
  claude: hasClaude(),
  liveFlightStatus: hasFlightStatusProvider(),
})));

app.post('/api/tripit/trips', route(async (req) => {
  if (!req.body.feedUrl) throw Object.assign(new Error('Missing TripIt feed URL'), { status: 400 });
  return { trips: await fetchTripItTrips(req.body.feedUrl) };
}));

app.post('/api/boarding-pass/barcode', route(async (req) => {
  try {
    return parseBCBP(req.body.text || '');
  } catch (err) {
    throw Object.assign(err, { status: 400 });
  }
}));

app.post('/api/boarding-pass/image', route(async (req) => {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64 || !/^image\/(png|jpeg|webp|gif)$/.test(mediaType || '')) {
    throw Object.assign(new Error('Upload a PNG, JPEG, WebP or GIF image'), { status: 400 });
  }
  if (!hasClaude()) throw Object.assign(new Error('Set ANTHROPIC_API_KEY to read boarding pass images'), { status: 503 });
  return extractBoardingPass({ imageBase64, mediaType });
}));

app.post('/api/flight-status', route(async (req) => {
  const flight = validateFlight(req.body);
  return { status: await getFlightStatus(flight) };
}));

app.post('/api/briefing', route(async (req) => {
  const flight = validateFlight(req.body);
  if (!hasClaude()) throw Object.assign(new Error('Set ANTHROPIC_API_KEY to generate briefings'), { status: 503 });
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
    status: req.body.loyaltyStatus ? String(req.body.loyaltyStatus).slice(0, 60) : null,
  });
  return { briefing, liveStatus };
}));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`My Travel running on http://localhost:${port}`));
