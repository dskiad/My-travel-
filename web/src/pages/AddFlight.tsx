import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AirportInput } from '../components/AirportInput.tsx';
import { AirlineLogo } from '../components/AirlineLogo.tsx';
import { formatDate } from '../components/FlightCard.tsx';
import { Field, toast } from '../components/ui.tsx';
import { addFlights, getState, saveSettings, useStore } from '../lib/store.ts';
import { draftIsComplete, parseFlightCode } from '../lib/flights.ts';
import { airlineName, airport } from '../lib/geo.ts';
import { importCalendar, lookupFlight, readDocument } from '../lib/api.ts';
import { IS_ARTIFACT } from '../lib/platform.ts';
import { GmailPicker } from '../components/GmailPicker.tsx';
import { emailText, gmailErrorText, TRIPIT_ADDRESS } from '../lib/gmail.ts';
import { parseFlightCsv } from '../lib/importers/csv.ts';
import { draftsFromBarcode, parsePkpass } from '../lib/importers/pkpass.ts';
import type { Cabin, FlightDraft, FlightSource } from '../lib/types.ts';

type SourceId = 'gmail' | 'number' | 'tripit' | 'scan' | 'email' | 'calendar' | 'csv';

const SOURCES: { id: SourceId; ico: string; title: string; text: string }[] = [
  ...(IS_ARTIFACT ? [{ id: 'gmail' as const, ico: '📬', title: 'From my Gmail', text: 'Pick a booking email, we read the flights' }] : []),
  { id: 'number', ico: '⌨️', title: 'Flight number', text: 'Type A3 600 + date, we fill in the rest' },
  { id: 'tripit', ico: '🧳', title: 'TripIt screenshots', text: 'Screenshot your trip in the TripIt app' },
  { id: 'scan', ico: '🎫', title: 'Boarding pass & tickets', text: IS_ARTIFACT ? 'Google/Apple Wallet, airline app screenshots' : 'Google/Apple Wallet, airline app, e-ticket PDF' },
  { id: 'calendar', ico: '🗓️', title: 'TripIt & calendars', text: 'TripIt, Google, Outlook, Kayak — keeps syncing' },
  { id: 'email', ico: '✉️', title: 'Booking email', text: 'Paste any airline or agency confirmation' },
  { id: 'csv', ico: '📒', title: 'Flight logbook', text: 'Flighty, myFlightradar24, OpenFlights CSV' },
];

function How({ title, children }: { title: string; children: ReactNode }) {
  return <details className="how"><summary>{title}</summary>{children}</details>;
}

export default function AddFlight() {
  const [source, setSource] = useState<SourceId>('number');
  const formRef = useRef<HTMLElement>(null);
  // Bring the form into view on every tap of a source (it sits below the tiles),
  // after the new form has rendered.
  const [scrollTick, setScrollTick] = useState(0);
  useEffect(() => {
    if (scrollTick) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollTick]);
  const [review, setReview] = useState<{ drafts: FlightDraft[]; source: FlightSource; note?: string } | null>(null);
  const navigate = useNavigate();

  const onFound = (drafts: FlightDraft[], src: FlightSource, note?: string) => {
    if (!drafts.length) { toast('No flights found there'); return; }
    setReview({ drafts, source: src, note });
  };

  if (review) {
    return (
      <Review
        {...review}
        onCancel={() => setReview(null)}
        onSaved={(id) => navigate(id ? `/flight/${id}` : '/diary')}
      />
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <div><div className="eyebrow">Add flights</div><h1>Bring your trips in</h1></div>
      </header>
      <div className="source-grid">
        {SOURCES.filter((s) => !(IS_ARTIFACT && s.id === 'calendar')).map((s) => (
          <button key={s.id} className="source" aria-pressed={source === s.id} onClick={() => { setSource(s.id); setScrollTick((n) => n + 1); }}
            style={s.id === SOURCES[0].id ? { gridColumn: '1 / -1', minHeight: 0 } : undefined}>
            <span className="s-ico">{s.ico}</span><b>{s.title}</b><span>{s.text}</span>
          </button>
        ))}
      </div>
      <section className="section card" ref={formRef}>
        {source === 'number' && <ByNumber onFound={onFound} />}
        {source === 'scan' && <ByScan onFound={onFound} />}
        {source === 'calendar' && <ByCalendar onFound={onFound} />}
        {source === 'email' && <ByEmail onFound={onFound} />}
        {source === 'gmail' && <ByGmail onFound={onFound} />}
        {source === 'tripit' && <ByTripItScreens onFound={onFound} />}
        {source === 'csv' && <ByCsv onFound={onFound} />}
      </section>
    </main>
  );
}

type FoundFn = (drafts: FlightDraft[], src: FlightSource, note?: string) => void;

// ---------------------------------------------------------------- number

function ByNumber({ onFound }: { onFound: FoundFn }) {
  const { settings } = useStore();
  const [code, setCode] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<FlightDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const look = async () => {
    const parsed = parseFlightCode(code);
    if (!parsed) { setMsg('Enter a flight like A3 600, LH1283 or BA 633'); return; }
    setBusy(true); setMsg('');
    const base: FlightDraft = { ...parsed, date, from: '', to: '', cabin: settings.cabin, source: 'manual' };
    try {
      const res = await lookupFlight(`${parsed.airline}${parsed.flightNumber}`, date);
      if (res.found) setDraft({ ...base, ...res.flight });
      else {
        setDraft(base);
        setMsg(res.provider === false ? 'Add the airports below (live schedule lookup is not set up on the server).' : 'Schedule not found — add the airports below.');
      }
    } catch (e) {
      setDraft(base);
      setMsg(`${(e as Error).message}. Add the details below.`);
    } finally {
      setBusy(false);
    }
  };

  if (draft) return <DraftForm draft={draft} note={msg} onBack={() => setDraft(null)} onDone={(d) => onFound([d], 'manual')} />;

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); look(); }}>
      <div className="grid-2">
        <Field label="Flight"><input className="input code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="A3 600" autoCapitalize="characters" required /></Field>
        <Field label="Departure date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      {msg && <div className="notice warn">{msg}</div>}
      <button className="btn primary" disabled={busy}>{busy ? 'Looking up schedule…' : 'Find flight'}</button>
    </form>
  );
}

function DraftForm({ draft, note, onBack, onDone }: { draft: FlightDraft; note?: string; onBack: () => void; onDone: (d: FlightDraft) => void }) {
  const [d, setD] = useState(draft);
  const [missing, setMissing] = useState('');
  const set = (patch: Partial<FlightDraft>) => { setMissing(''); setD((x) => ({ ...x, ...patch })); };
  const submit = () => {
    const need = [!d.from && 'departure airport', !d.to && 'arrival airport'].filter(Boolean);
    if (need.length) { setMissing(`Choose the ${need.join(' and ')} from the suggestions.`); return; }
    if (draftIsComplete(d)) onDone(d);
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="row">
        <AirlineLogo code={d.airline} />
        <div className="grow"><b>{airlineName(d.airline)} {d.flightNumber}</b><div className="small muted">{formatDate(d.date, { dateStyle: 'full' } as Intl.DateTimeFormatOptions)}</div></div>
        <button type="button" className="btn ghost sm" onClick={onBack}>Change</button>
      </div>
      {note && <div className="notice warn small">{note}</div>}
      <div className="grid-2">
        <Field label="From"><AirportInput value={d.from || ''} onChange={(from) => set({ from })} placeholder="ATH" /></Field>
        <Field label="To"><AirportInput value={d.to || ''} onChange={(to) => set({ to })} placeholder="LHR" /></Field>
        <Field label="Departs (local)"><input className="input" type="time" value={d.depLocal || ''} onChange={(e) => set({ depLocal: e.target.value })} /></Field>
        <Field label="Arrives (local)"><input className="input" type="time" value={d.arrLocal || ''} onChange={(e) => set({ arrLocal: e.target.value })} /></Field>
        <Field label="Seat"><input className="input code" value={d.seat || ''} onChange={(e) => set({ seat: e.target.value.toUpperCase() })} placeholder="2A" /></Field>
        <Field label="Cabin">
          <select className="input" value={d.cabin || ''} onChange={(e) => set({ cabin: e.target.value as Cabin })}>
            <option value="">—</option><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option>
          </select>
        </Field>
        <Field label="Booking ref (PNR)"><input className="input code" value={d.pnr || ''} onChange={(e) => set({ pnr: e.target.value.toUpperCase() })} /></Field>
        <Field label="Aircraft"><input className="input" value={d.aircraft || ''} onChange={(e) => set({ aircraft: e.target.value })} placeholder="Airbus A321neo" /></Field>
      </div>
      {missing && <div className="notice error small" role="alert">{missing}</div>}
      <button className="btn primary">Save flight</button>
    </form>
  );
}

// ---------------------------------------------------------------- scan / upload

async function detectBarcode(source: ImageBitmapSource): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BD) return null;
  const codes = await new BD({ formats: ['pdf417', 'aztec', 'qr_code', 'data_matrix'] }).detect(source).catch(() => []);
  return codes.find((c) => c.rawValue?.startsWith('M'))?.rawValue || null;
}

function ByScan({ onFound }: { onFound: FoundFn }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    setError('');
    try {
      if (/\.pkpass$/i.test(file.name) || file.type === 'application/vnd.apple.pkpass') {
        setBusy('Reading Apple Wallet pass…');
        return onFound(await parsePkpass(file), 'wallet-pass');
      }
      if (file.type.startsWith('image/')) {
        setBusy('Looking for the boarding-pass barcode…');
        const bitmap = await createImageBitmap(file).catch(() => null);
        const raw = bitmap && await detectBarcode(bitmap);
        if (raw) return onFound(draftsFromBarcode(raw), 'boarding-pass');
        setBusy('Reading the pass with AI…');
        const res = await readDocument({ file });
        return onFound(res.flights.map((f) => ({ ...f, source: 'document' })), 'document');
      }
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        setBusy('Reading your e-ticket…');
        const res = await readDocument({ file });
        return onFound(res.flights, 'document');
      }
      throw new Error('Use a screenshot/photo, a PDF e-ticket or an Apple Wallet .pkpass file');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const scan = async () => {
    setError('');
    if (!('BarcodeDetector' in window)) { setError('Live scanning needs Chrome on Android — upload a screenshot instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const stop = () => { stream.getTracks().forEach((t) => t.stop()); setScanning(false); };
      const started = Date.now();
      const tick = async () => {
        const raw = await detectBarcode(video);
        if (raw) { stop(); try { onFound(draftsFromBarcode(raw), 'boarding-pass'); } catch (e) { setError((e as Error).message); } return; }
        if (Date.now() - started > 30000) { stop(); setError('No barcode found — try uploading a screenshot.'); return; }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError(`Camera unavailable: ${(e as Error).message}`);
    }
  };

  return (
    <div className="stack">
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      >
        <span style={{ fontSize: '2rem' }}>📤</span>
        <b>{busy || 'Upload boarding pass, ticket or Wallet pass'}</b>
        <span className="small muted">{IS_ARTIFACT ? 'Screenshot · photo · .pkpass' : 'Screenshot · photo · PDF e-ticket · .pkpass'}</span>
        <input ref={input} type="file" hidden accept="image/*,application/pdf,.pdf,.pkpass,application/vnd.apple.pkpass"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ''; }} />
      </div>
      {!IS_ARTIFACT && <button className="btn" onClick={scan} disabled={!!busy || scanning}>📷 Scan a barcode with the camera</button>}
      <video ref={videoRef} playsInline muted hidden={!scanning} style={{ width: '100%', borderRadius: 16 }} />
      {error && <div className="notice error">{error}</div>}
      <How title="From Google Wallet">
        <ol><li>Open Google Wallet and tap the boarding pass.</li><li>Take a screenshot.</li><li>Upload it here — the barcode is read on your phone, or by AI if it can't be scanned.</li></ol>
        <p className="tiny" style={{ marginTop: 6 }}>Google doesn't let other apps read Wallet directly, so a screenshot is the fastest route.</p>
      </How>
      <How title="From Apple Wallet">
        <ol><li>Open the pass, tap ••• → Share pass.</li><li>Save to Files, then upload the .pkpass here. A screenshot works too.</li></ol>
      </How>
      <How title="From an airline app or email">
        <ol><li>Download the e-ticket / itinerary PDF, or screenshot the trip page.</li><li>Upload it — every flight in the booking is found, including returns and connections.</li></ol>
      </How>
    </div>
  );
}

// ---------------------------------------------------------------- calendar

function ByCalendar({ onFound }: { onFound: FoundFn }) {
  const { settings } = useStore();
  const [url, setUrl] = useState(settings.calendarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sync = async () => {
    setBusy(true); setError('');
    try {
      const { flights } = await importCalendar(url);
      saveSettings({ calendarUrl: url });
      onFound(flights.map((f) => ({ ...f, source: 'calendar' as const })), 'calendar', 'Saved: tap “Sync calendar” on your Profile to pull new trips any time.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); sync(); }}>
      <Field label="Private calendar link (.ics)">
        <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tripit.com/feed/ical/private/…" required />
      </Field>
      {error && <div className="notice error">{error}</div>}
      <button className="btn primary" disabled={busy}>{busy ? 'Reading calendar…' : 'Import flights'}</button>
      <p className="tiny muted">The link is kept on this device only. Anyone with it can see the calendar, so don't share it.</p>
      <How title="TripIt">
        <ol><li>On tripit.com go to Settings → Calendar Feeds.</li><li>Choose “Subscribe to calendar” and copy the link.</li><li>Paste it above.</li></ol>
      </How>
      <How title="Google Calendar (flights Gmail adds automatically)">
        <ol><li>On calendar.google.com open Settings → your calendar → Integrate calendar.</li><li>Copy “Secret address in iCal format”.</li><li>Paste it above.</li></ol>
      </How>
      <How title="Outlook / Microsoft 365">
        <ol><li>Outlook on the web → Settings → Calendar → Shared calendars.</li><li>Under “Publish a calendar”, publish and copy the ICS link.</li></ol>
      </How>
      <How title="Kayak, TripCase, Flighty and others">
        <ol><li>Look for “Calendar sync”, “Subscribe” or “iCal feed” in the app's settings.</li><li>Copy the link (it often starts with webcal:// — that works too).</li></ol>
      </How>
    </form>
  );
}

// ---------------------------------------------------------------- email

function ByTripItScreens({ onFound }: { onFound: FoundFn }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const read = async (files: File[]) => {
    setError(''); setBusy(`Reading ${files.length} screenshot${files.length === 1 ? '' : 's'}…`);
    try {
      const res = await readDocument({ files });
      onFound(res.flights.map((f) => ({ ...f, source: 'document' as const })), 'document');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="stack">
      <label className="dropzone">
        <span style={{ fontSize: '2rem' }}>🧳</span>
        <b>{busy || 'Upload TripIt screenshots'}</b>
        <span className="small muted">Pick all the screenshots of one trip at once (up to 10)</span>
        <input type="file" accept="image/*" multiple hidden disabled={!!busy}
          onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) read(files); }} />
      </label>
      {error && <div className="notice error small" role="alert">{error}</div>}
      <How title="How to take them in TripIt">
        <ol><li>Open the TripIt app and tap the trip.</li><li>Screenshot the plan list (scroll and take more if the trip is long), or open each flight and screenshot its details.</li><li>Upload them all here. Each flight is listed once, even if it’s on several screenshots.</li></ol>
      </How>
    </div>
  );
}

function ByGmail({ onFound }: { onFound: FoundFn }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pick = async (threadId: string) => {
    setError(''); setBusy('Reading the email…');
    try {
      const { text, messageId } = await emailText(threadId);
      setBusy('Finding the flights in it…');
      const res = await readDocument({ text });
      onFound(res.flights.map((f) => ({ ...f, gmailMessageId: messageId, source: 'gmail' as const })), 'gmail',
        `Tip: open a flight and tap “Send to TripIt” to add it to your TripIt too.`);
    } catch (e) {
      setError((e as { code?: string }).code ? gmailErrorText(e) : (e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="stack">
      <p className="small muted">Finds airline and travel-agency booking emails in your Gmail. Nothing is read until you pick one, and the first time claude.ai asks you to allow Gmail for this page.</p>
      <GmailPicker searchLabel="Find my booking emails" pickLabel="Import" busy={busy} onPick={(t) => pick(t.threadId)} />
      {error && <div className="notice error small" role="alert">{error}</div>}
      <How title="Also add them to TripIt">
        <ol><li>Open an imported flight and tap <b>Send to TripIt</b>. Its booking email is forwarded from your Gmail to {TRIPIT_ADDRESS}.</li><li>TripIt only accepts emails from addresses on your TripIt account: check TripIt → Settings → Email addresses.</li></ol>
      </How>
    </div>
  );
}

function ByEmail({ onFound }: { onFound: FoundFn }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const read = async () => {
    setBusy(true); setError('');
    try {
      const res = await readDocument({ text });
      onFound(res.flights, 'document');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); read(); }}>
      <Field label="Booking confirmation">
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Open the airline or travel-agency email, select all, copy, and paste it here." required />
      </Field>
      {error && <div className="notice error">{error}</div>}
      <button className="btn primary" disabled={busy}>{busy ? 'Reading…' : 'Find flights'}</button>
      <p className="tiny muted">Works with any language and any airline, Booking.com, Expedia, eDreams, Kiwi.com and more.</p>
    </form>
  );
}

// ---------------------------------------------------------------- csv

function ByCsv({ onFound }: { onFound: FoundFn }) {
  const [error, setError] = useState('');
  const handle = async (file: File) => {
    setError('');
    try {
      const { flights, skipped } = parseFlightCsv(await file.text());
      onFound(flights, 'csv', skipped ? `${skipped} rows were skipped (missing date, airports or airline).` : undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="stack">
      <label className="dropzone">
        <span style={{ fontSize: '2rem' }}>📒</span>
        <b>Choose a CSV logbook</b>
        <span className="small muted">Your whole flying history in one go</span>
        <input type="file" hidden accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ''; }} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <How title="myFlightradar24">
        <ol><li>Go to my.flightradar24.com → Settings → Export.</li><li>Download the CSV and upload it here.</li></ol>
      </How>
      <How title="Flighty">
        <ol><li>In Flighty open Settings and use the export option to save your flights as CSV.</li><li>Upload the file here.</li></ol>
      </How>
      <How title="OpenFlights, JetLovers, spreadsheets">
        <ol><li>Export as CSV. Columns for date, from and to are required; flight number, airline, seat, class and times are picked up when present.</li><li>Dates can be YYYY-MM-DD or DD/MM/YYYY.</li></ol>
      </How>
    </div>
  );
}

// ---------------------------------------------------------------- review

function Review({ drafts, source, note, onCancel, onSaved }: {
  drafts: FlightDraft[]; source: FlightSource; note?: string; onCancel: () => void; onSaved: (id?: string) => void;
}) {
  const valid = drafts.filter(draftIsComplete);
  const [picked, setPicked] = useState(() => new Set(valid.map((_, i) => i)));
  const toggle = (i: number) => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const save = () => {
    const chosen = valid.filter((_, i) => picked.has(i));
    const { added, updated } = addFlights(chosen, source);
    toast(`${added} added${updated ? `, ${updated} updated` : ''}`);
    const only = chosen.length === 1 && getState().flights.find((f) => f.airline === chosen[0].airline && f.flightNumber === chosen[0].flightNumber && f.date === chosen[0].date);
    onSaved(only ? only.id : undefined);
  };

  return (
    <main className="page">
      <header className="page-header">
        <div><div className="eyebrow">Review</div><h1>{valid.length} flight{valid.length === 1 ? '' : 's'} found</h1></div>
        <button className="btn ghost" onClick={onCancel}>Back</button>
      </header>
      {note && <div className="notice" style={{ marginBottom: 12 }}>{note}</div>}
      {drafts.length > valid.length && <div className="notice warn" style={{ marginBottom: 12 }}>{drafts.length - valid.length} item(s) were missing airports or a date and were left out.</div>}
      <div className="stack">
        {valid.map((d, i) => (
          <label key={i} className="flight-row review-item">
            <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
            <AirlineLogo code={d.airline} size="sm" />
            <div className="r-main">
              <div className="r-route">{d.from} → {d.to}</div>
              <div className="r-sub">{airport(d.from)?.city} → {airport(d.to)?.city} · {d.airline} {d.flightNumber}{d.seat ? ` · seat ${d.seat}` : ''}</div>
            </div>
            <div className="r-right"><b>{formatDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b><div>{d.depLocal || ''}</div></div>
          </label>
        ))}
      </div>
      <div className="section">
        <button className="btn primary block" disabled={!picked.size} onClick={save}>Add {picked.size} to my diary</button>
      </div>
    </main>
  );
}
