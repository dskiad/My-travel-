import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_CONTINUATIONS = 5;

let client;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export function hasClaude() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

class RefusalError extends Error {}

function textOf(message) {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// ---------------------------------------------------------------------------
// Boarding pass screenshot (e.g. from Google Wallet) → structured flight data
// ---------------------------------------------------------------------------

const BOARDING_PASS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['airline', 'flightNumber', 'date', 'from', 'to', 'passengerName', 'pnr', 'seat', 'cabin', 'boardingTime', 'gate', 'terminal', 'barcodeText'],
  properties: {
    airline: { type: 'string', description: 'IATA 2-letter airline code, e.g. A3' },
    flightNumber: { type: 'string', description: 'Digits only, e.g. 600' },
    date: { type: 'string', description: 'Departure date YYYY-MM-DD, empty if unknown' },
    from: { type: 'string', description: 'Departure IATA airport code' },
    to: { type: 'string', description: 'Arrival IATA airport code' },
    passengerName: { type: 'string' },
    pnr: { type: 'string', description: 'Booking reference' },
    seat: { type: 'string' },
    cabin: { type: 'string', description: 'First, Business, Premium Economy or Economy' },
    boardingTime: { type: 'string', description: 'HH:MM local, empty if not shown' },
    gate: { type: 'string' },
    terminal: { type: 'string' },
    barcodeText: { type: 'string', description: 'Empty unless the raw BCBP text is legible' },
  },
};

export async function extractBoardingPass({ imageBase64, mediaType }) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: BOARDING_PASS_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: `This is a boarding pass (possibly a Google Wallet or airline app screenshot). Extract the flight details. Today is ${new Date().toISOString().slice(0, 10)}; use it to infer the year if the pass omits it. Use empty strings for anything not visible.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new RefusalError('Could not read this image');
  return JSON.parse(textOf(response));
}

// ---------------------------------------------------------------------------
// Travel briefing: lounges, entry rules, strikes, ground transport
// ---------------------------------------------------------------------------

const BRIEFING_SYSTEM = `You are a meticulous travel concierge for a frequent business traveller. You research live, current information on the web and return a practical briefing for one specific flight.

Accuracy matters more than completeness: the traveller will walk to the lounge you name and rely on your entry-requirement advice at the border. Verify facts against official or recent sources (airport and airline websites, government travel advice, Timatic-style sources, recent news). When something cannot be confirmed, say so plainly in the relevant field rather than guessing.

What the traveller needs, in order of importance:
1. Departure details: airport local time zone, departure terminal and gate (if a live status was provided, trust it; otherwise find the usual terminal for this airline at this airport and note that the gate is not yet published), and the current flight status or delay.
2. Lounges: the lounges at the departure airport the traveller can use with this airline — the airline's own lounge first, then alliance partner and contract lounges. Rank them by walking distance from the departure gate (or from the terminal/pier if the gate is unknown), and state where each is (terminal, pier, airside/landside, near which gates), opening hours, and who gets in (cabin class, alliance status). Note passport control or security that has to be crossed to get from the lounge to the gate.
3. Entry requirements for the traveller's passport at the destination (and any transit point): visa, ETA/ETIAS/ESTA-type authorisations, passport validity, and anything else needed at arrival.
4. Disruptions: strikes (airport, airline, air traffic control, ground handling, public transport at the destination), severe weather, or other events around the travel date.
5. Ground transport from the arrival airport into the city: train/metro, bus, official taxi rank, and Uber/Bolt/ride-hailing pickup point — where to find each after landing, journey time, typical price in local currency, and a recommendation.
6. A few short, high-value tips for this trip.

Respond with only a JSON object (no prose before or after, no code fences) with this shape:
{
  "flight": {"airline": "", "airlineName": "", "alliance": "", "flight": "", "date": "YYYY-MM-DD",
    "from": {"iata": "", "name": "", "city": "", "country": "", "timeZone": "IANA zone"},
    "to": {"iata": "", "name": "", "city": "", "country": "", "timeZone": "IANA zone"},
    "departureTerminal": "", "departureGate": "", "scheduledDepartureLocal": "", "estimatedDepartureLocal": "",
    "arrivalTerminal": "", "scheduledArrivalLocal": "", "status": "", "delayMinutes": null, "notes": ""},
  "lounges": [{"name": "", "operator": "", "terminal": "", "location": "", "nearGates": "", "walkFromGate": "", "hours": "", "access": "", "notes": ""}],
  "entryRequirements": {"destinationCountry": "", "visaRequired": "yes | no | conditional", "summary": "", "requirements": [""], "officialLink": ""},
  "disruptions": [{"type": "strike | weather | airport | airline | other", "severity": "info | warning | critical", "title": "", "details": "", "dates": ""}],
  "groundTransport": [{"mode": "train | metro | bus | taxi | rideshare | shuttle | other", "name": "", "where": "", "duration": "", "price": "", "frequency": "", "notes": "", "recommended": false}],
  "tips": [""]
}
Use empty arrays when there is genuinely nothing to report (e.g. no strikes found — say so in tips).`;

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Briefing did not contain JSON');
  return JSON.parse(text.slice(start, end + 1));
}

function collectSources(content) {
  const seen = new Map();
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url && !seen.has(r.url)) seen.set(r.url, { title: r.title || r.url, url: r.url });
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c.url && !seen.has(c.url)) seen.set(c.url, { title: c.title || c.url, url: c.url });
    }
  }
  return [...seen.values()];
}

export async function buildBriefing({ flight, liveStatus, passport, cabin, status }) {
  const now = new Date().toISOString();
  const facts = {
    flight: flight.flight,
    airline: flight.airline,
    date: flight.date,
    from: flight.from || null,
    to: flight.to || null,
    seat: flight.seat || null,
    cabin: cabin || flight.cabin || null,
    frequentFlyerStatus: status || null,
    passportNationality: passport,
  };
  const userText = `Current time (UTC): ${now}

Flight details from the traveller's itinerary / boarding pass:
${JSON.stringify(facts, null, 2)}

${liveStatus
    ? `Live flight status from the flight-data provider (authoritative for terminal, gate and times):\n${JSON.stringify(liveStatus, null, 2)}`
    : 'No live flight-status feed is available, so look up the current status, terminal and gate yourself.'}

Prepare the briefing.`;

  const messages = [{ role: 'user', content: userText }];
  const pausedContent = [];
  let message;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system: BRIEFING_SYSTEM,
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 15 },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
      ],
      messages,
    });
    message = await stream.finalMessage();
    if (message.stop_reason !== 'pause_turn') break;
    // Server-side search loop hit its iteration limit: send the partial
    // assistant turn back and the API resumes where it left off.
    pausedContent.push(...message.content);
    messages.splice(1, 1, { role: 'assistant', content: [...pausedContent] });
  }

  if (message.stop_reason === 'refusal') throw new RefusalError('The briefing request was declined');
  if (message.stop_reason === 'pause_turn') throw new Error('Research took too long; please try again');

  const briefing = extractJson(textOf(message));
  briefing.sources = collectSources([...pausedContent, ...message.content]).slice(0, 25);
  briefing.generatedAt = now;
  return briefing;
}

export { RefusalError };
