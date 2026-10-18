const $ = (sel) => document.querySelector(sel);
const STATUS_POLL_MS = 5 * 60 * 1000;

// ---------- local storage (per device, best effort) ----------
const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const settings = () => ({ passport: 'Greece', cabin: '', loyaltyStatus: '', ...store.get('settings', {}) });

let current = null; // { flight, briefing, liveStatus }
let pollTimer = null;
let clockTimer = null;

// ---------- helpers ----------
async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function setStatus(target, message, isError = false) {
  target.textContent = message || '';
  target.classList.toggle('error', isError);
}

function localTime(timeZone) {
  if (!timeZone) return '--:--';
  try {
    return new Intl.DateTimeFormat([], { timeZone, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).format(new Date());
  } catch { return '--:--'; }
}

function hhmm(local) {
  // "2026-10-20 07:35+03:00" → "07:35"
  const m = String(local || '').match(/[ T](\d{2}:\d{2})/);
  return m ? m[1] : local || '–';
}

// ---------- tabs ----------
document.querySelectorAll('[role=tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  });
});

// ---------- TripIt ----------
$('#tripit-url').value = store.get('tripitUrl', '');
$('#tripit-load').addEventListener('click', async () => {
  const feedUrl = $('#tripit-url').value.trim();
  if (!feedUrl) return setStatus($('#picker-status'), 'Paste your TripIt feed URL first', true);
  store.set('tripitUrl', feedUrl);
  setStatus($('#picker-status'), 'Loading trips from TripIt…');
  try {
    const { trips } = await api('/api/tripit/trips', { feedUrl });
    renderTrips(trips);
    setStatus($('#picker-status'), trips.length ? '' : 'No flights found in your TripIt feed');
  } catch (err) {
    setStatus($('#picker-status'), err.message, true);
  }
});

function renderTrips(trips) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => t.end >= today);
  $('#trips').replaceChildren(...(upcoming.length ? upcoming : trips).map((trip) =>
    el('div', { class: 'trip' },
      el('h3', {}, trip.name),
      trip.flights.map((f) => el('button', { class: 'flight-option', type: 'button', onclick: () => selectFlight(f) },
        el('b', {}, `${f.airline} ${f.flightNumber}`),
        ` ${f.from} → ${f.to} · ${new Date(f.departureUtc).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`)))));
}

// ---------- manual ----------
$('#manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  selectFlight({ ...data, flight: data.flight.replace(/\s+/g, '').toUpperCase() });
});
$('#manual-form [name=date]').valueAsDate = new Date();

// ---------- boarding pass ----------
function flightFromBarcode(parsed) {
  const leg = parsed.legs[0];
  return { ...leg, passengerName: parsed.passengerName };
}

async function readBarcodeText(text) {
  const parsed = await api('/api/boarding-pass/barcode', { text });
  selectFlight(flightFromBarcode(parsed));
}

$('#pass-parse').addEventListener('click', () =>
  readBarcodeText($('#pass-text').value.trim()).catch((err) => setStatus($('#picker-status'), err.message, true)));

async function detectBarcode(source) {
  if (!('BarcodeDetector' in window)) return null;
  const detector = new BarcodeDetector({ formats: ['pdf417', 'aztec', 'qr_code', 'data_matrix'] });
  const codes = await detector.detect(source);
  return codes.find((c) => c.rawValue?.startsWith('M'))?.rawValue || null;
}

$('#pass-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus($('#picker-status'), 'Reading boarding pass…');
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    const raw = bitmap && await detectBarcode(bitmap).catch(() => null);
    if (raw) return await readBarcodeText(raw);
    // No barcode reader on this browser (or barcode unreadable): let Claude read the image.
    const imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const pass = await api('/api/boarding-pass/image', { imageBase64, mediaType: file.type });
    selectFlight({ ...pass, flight: `${pass.airline}${pass.flightNumber}` });
  } catch (err) {
    setStatus($('#picker-status'), err.message, true);
  } finally {
    e.target.value = '';
  }
});

$('#pass-scan').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) {
    return setStatus($('#picker-status'), 'Live scanning is not supported in this browser — upload a screenshot instead', true);
  }
  const video = $('#scanner');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    setStatus($('#picker-status'), 'Point the camera at the boarding pass barcode…');
    const stop = () => { stream.getTracks().forEach((t) => t.stop()); video.hidden = true; };
    const started = Date.now();
    const tick = async () => {
      const raw = await detectBarcode(video).catch(() => null);
      if (raw) { stop(); return readBarcodeText(raw).catch((err) => setStatus($('#picker-status'), err.message, true)); }
      if (Date.now() - started > 30000) { stop(); return setStatus($('#picker-status'), 'No barcode found — try uploading a screenshot', true); }
      requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    setStatus($('#picker-status'), `Camera unavailable: ${err.message}`, true);
  }
});

// ---------- briefing ----------
async function selectFlight(flight) {
  const s = settings();
  const request = { ...flight, cabin: flight.cabin || s.cabin, passport: s.passport, loyaltyStatus: s.loyaltyStatus };
  current = { flight: request, briefing: null, liveStatus: null };
  store.set('lastFlight', request);
  $('#picker').hidden = true;
  $('#dashboard').hidden = false;
  renderDashboard();
  await loadBriefing();
}

async function loadBriefing() {
  const status = $('#dash-status');
  setStatus(status, 'Researching lounges, entry rules, strikes and transport… this can take a minute.');
  $('#refresh').disabled = true;
  try {
    const { briefing, liveStatus } = await api('/api/briefing', current.flight);
    Object.assign(current, { briefing, liveStatus, lastAnnounced: liveStatus?.status });
    store.set('lastBriefing', current);
    renderDashboard();
    setStatus(status, '');
    schedulePolling();
  } catch (err) {
    setStatus(status, err.message, true);
  } finally {
    $('#refresh').disabled = false;
  }
}

function schedulePolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const { status } = await api('/api/flight-status', current.flight);
      if (!status) return;
      const before = current.liveStatus?.departure;
      const after = status.departure;
      current.liveStatus = status;
      store.set('lastBriefing', current);
      renderDashboard();
      if (before) {
        const changes = [];
        if (after.gate && after.gate !== before.gate) changes.push(`Gate is now ${after.gate}`);
        if (after.terminal && after.terminal !== before.terminal) changes.push(`Terminal is now ${after.terminal}`);
        if ((after.delayMinutes || 0) !== (before.delayMinutes || 0)) changes.push(`Delay: ${after.delayMinutes || 0} min`);
        if (status.status !== current.lastAnnounced) changes.push(`Status: ${status.status}`);
        if (changes.length) notify(`${current.flight.flight} update`, changes.join(' · '));
      }
      current.lastAnnounced = status.status;
    } catch { /* keep the last known state */ }
  }, STATUS_POLL_MS);
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: 'icon.svg' }))
      .catch(() => new Notification(title, { body }));
  }
  setStatus($('#dash-status'), `${title}: ${body}`);
}

$('#notify').addEventListener('click', async () => {
  if (!('Notification' in window)) return setStatus($('#dash-status'), 'Notifications are not supported here', true);
  const perm = await Notification.requestPermission();
  setStatus($('#dash-status'), perm === 'granted'
    ? 'You will be alerted about gate, terminal, delay and status changes while the app is open.'
    : 'Notifications were not allowed', perm !== 'granted');
});

$('#refresh').addEventListener('click', loadBriefing);
$('#change-flight').addEventListener('click', () => {
  clearInterval(pollTimer);
  $('#dashboard').hidden = true;
  $('#picker').hidden = false;
  setStatus($('#picker-status'), '');
});

function renderDashboard() {
  const { flight, briefing, liveStatus } = current;
  const b = briefing?.flight || {};
  const dep = liveStatus?.departure || {};
  const arr = liveStatus?.arrival || {};
  const fromCode = dep.airport?.iata || b.from?.iata || flight.from || '?';
  const toCode = arr.airport?.iata || b.to?.iata || flight.to || '?';

  $('#f-number').textContent = `${flight.flight.slice(0, 2)} ${flight.flight.slice(2)}`;
  $('#f-status').textContent = liveStatus?.status || b.status || 'Checking…';
  $('#f-route').textContent = `${dep.airport?.city || b.from?.city || fromCode} (${fromCode}) → ${arr.airport?.city || b.to?.city || toCode} (${toCode}) · ${flight.date}`;
  $('#f-terminal').textContent = dep.terminal || b.departureTerminal || '–';
  $('#f-gate').textContent = dep.gate || b.departureGate || 'Not yet';
  $('#f-dep').textContent = hhmm(dep.revisedLocal || dep.scheduledLocal || b.estimatedDepartureLocal || b.scheduledDepartureLocal);
  $('#f-seat').textContent = flight.seat || '–';

  const delay = dep.delayMinutes ?? b.delayMinutes;
  $('#f-delay').hidden = !(delay > 0);
  $('#f-delay').textContent = delay > 0 ? `Delayed about ${delay} minutes` : '';

  const fromTz = dep.airport?.timeZone || b.from?.timeZone;
  const toTz = arr.airport?.timeZone || b.to?.timeZone;
  $('#c-from-code').textContent = fromCode;
  $('#c-to-code').textContent = toCode;
  const tickClocks = () => { $('#c-from').textContent = localTime(fromTz); $('#c-to').textContent = localTime(toTz); };
  tickClocks();
  clearInterval(clockTimer);
  clockTimer = setInterval(tickClocks, 15000);

  $('#passport-label').textContent = `(${flight.passport} passport)`;
  if (!briefing) {
    for (const id of ['#lounges', '#disruptions', '#entry', '#transport', '#tips', '#sources']) $(id).replaceChildren();
    return;
  }

  $('#lounges').replaceChildren(...listOr(briefing.lounges, 'No accessible lounge found', (l, i) =>
    el('div', { class: `item${i === 0 ? ' best' : ''}` },
      el('h3', {}, l.name, i === 0 ? el('span', { class: 'pill good' }, 'Closest') : ''),
      el('p', {}, [l.terminal, l.location, l.nearGates && `near gates ${l.nearGates}`].filter(Boolean).join(' · ')),
      l.walkFromGate && el('p', {}, `🚶 ${l.walkFromGate}`),
      l.hours && el('p', {}, `🕒 ${l.hours}`),
      l.access && el('p', {}, `🎫 ${l.access}`),
      l.notes && el('p', { class: 'muted' }, l.notes))));

  $('#disruptions').replaceChildren(...listOr(briefing.disruptions, 'No strikes or disruptions reported for your travel dates ✅', (d) =>
    el('div', { class: `item sev-${d.severity}` },
      el('h3', {}, d.title), d.dates && el('p', { class: 'muted' }, d.dates), el('p', {}, d.details))));

  const e = briefing.entryRequirements || {};
  const visaClass = { no: 'good', yes: 'bad', conditional: 'warn' }[String(e.visaRequired).toLowerCase()] || '';
  $('#entry').replaceChildren(
    el('p', {}, el('span', { class: `pill ${visaClass}` }, `Visa: ${e.visaRequired || 'unknown'}`), ` ${e.destinationCountry || ''}`),
    el('p', {}, e.summary || ''),
    el('ul', {}, (e.requirements || []).filter(Boolean).map((r) => el('li', {}, r))),
    e.officialLink ? el('a', { href: e.officialLink, target: '_blank', rel: 'noopener' }, 'Official source') : '');

  $('#transport').replaceChildren(...listOr(briefing.groundTransport, 'No transport information found', (t) =>
    el('div', { class: `item${t.recommended ? ' best' : ''}` },
      el('h3', {}, `${modeIcon(t.mode)} ${t.name}`, t.recommended ? el('span', { class: 'pill good' }, 'Recommended') : ''),
      t.where && el('p', {}, `📍 ${t.where}`),
      el('p', {}, [t.duration && `⏱ ${t.duration}`, t.price && `💶 ${t.price}`, t.frequency && `🔁 ${t.frequency}`].filter(Boolean).join('  ')),
      t.notes && el('p', { class: 'muted' }, t.notes))));

  $('#tips').replaceChildren(...(briefing.tips || []).filter(Boolean).map((t) => el('li', {}, t)));
  $('#sources').replaceChildren(...(briefing.sources || []).map((s) =>
    el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title))));
  $('#generated').textContent = `Briefing generated ${new Date(briefing.generatedAt).toLocaleString()}. Always confirm gate changes on airport screens.`;
}

function listOr(items, emptyText, render) {
  const list = (items || []).filter(Boolean);
  return list.length ? list.map(render) : [el('p', { class: 'muted' }, emptyText)];
}

function modeIcon(mode) {
  return { train: '🚆', metro: '🚇', bus: '🚌', taxi: '🚕', rideshare: '🚗', shuttle: '🚐' }[mode] || '➡️';
}

// ---------- settings ----------
$('#settings-btn').addEventListener('click', () => {
  const s = settings();
  $('#s-passport').value = s.passport;
  $('#s-cabin').value = s.cabin;
  $('#s-status').value = s.loyaltyStatus;
  $('#settings').showModal();
});
$('#s-save').addEventListener('click', () => {
  store.set('settings', {
    passport: $('#s-passport').value.trim() || 'Greece',
    cabin: $('#s-cabin').value,
    loyaltyStatus: $('#s-status').value.trim(),
  });
});

// ---------- startup ----------
(async () => {
  const saved = store.get('lastBriefing');
  if (saved?.flight && saved.flight.date >= new Date(Date.now() - 864e5).toISOString().slice(0, 10)) {
    current = saved;
    $('#picker').hidden = true;
    $('#dashboard').hidden = false;
    renderDashboard();
    if (saved.liveStatus) schedulePolling();
  }
  try {
    const config = await api('/api/config');
    if (!config.claude) setStatus($('#picker-status'), 'Server is missing ANTHROPIC_API_KEY — briefings are disabled.', true);
  } catch { /* offline: show cached briefing */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
