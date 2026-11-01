import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlightCard } from '../components/FlightCard.tsx';
import { ProgramLogo, formatMemberNumber } from '../components/MemberCard.tsx';
import { ConfirmButton, Field, Sheet, copyText, toast } from '../components/ui.tsx';
import { IS_ARTIFACT } from '../lib/platform.ts';
import { GmailPicker } from '../components/GmailPicker.tsx';
import { forwardToTripIt, gmailErrorText, queryForFlight, TRIPIT_ADDRESS } from '../lib/gmail.ts';
import { deleteFlight, updateFlight, useStore } from '../lib/store.ts';
import { isPast } from '../lib/flights.ts';
import { airport, airlineIcao, airlineName, countryName, flagEmoji } from '../lib/geo.ts';
import { forecast, getBriefing, getFlightStatus, weatherIcon, type DayWeather } from '../lib/api.ts';
import { membershipsForAirline, statusSummary } from '../lib/loyalty.ts';
import type { Briefing, Cabin, Flight } from '../lib/types.ts';

const STATUS_POLL_MS = 5 * 60 * 1000;

function localTime(tz?: string, now = new Date()) {
  if (!tz) return { time: '--:--', day: '' };
  return {
    time: new Intl.DateTimeFormat([], { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now),
    day: new Intl.DateTimeFormat([], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(now),
  };
}

function Clock({ label, tz, now }: { label: string; tz?: string; now: Date }) {
  const { time, day } = localTime(tz, now);
  return <div className="fact clock"><small>{label}</small><b>{time}</b><span>{day}</span></div>;
}

function notify(title: string, body: string) {
  toast(`${title}: ${body}`);
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((r) => r.showNotification(title, { body, icon: '/icon.svg' })).catch(() => new Notification(title, { body }));
  }
}

export default function FlightDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { flights, memberships, settings } = useStore();
  const flight = flights.find((f) => f.id === id);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [editing, setEditing] = useState(false);
  const lastStatus = useRef(flight?.liveStatus);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (flight) forecast(flight.to, flight.date).then(setWeather); }, [flight?.to, flight?.date]);

  const credit = useMemo(() => (flight ? membershipsForAirline(flight.airline, memberships) : []), [flight?.airline, memberships]);
  const upcoming = flight ? !isPast(flight) : false;

  const loadBriefing = async (f: Flight) => {
    setLoading(true); setError('');
    try {
      const { briefing, liveStatus } = await getBriefing(f, settings.passport, statusSummary(memberships), settings.language || 'en');
      updateFlight(f.id, { briefing, liveStatus });
      lastStatus.current = liveStatus;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load once for upcoming flights; poll live status while the page is open.
  useEffect(() => {
    if (flight && upcoming && !flight.briefing && !loading && !IS_ARTIFACT) loadBriefing(flight);
    if (!flight || !upcoming || IS_ARTIFACT) return;
    const t = setInterval(async () => {
      try {
        const { status } = await getFlightStatus(flight);
        if (!status) return;
        const before = lastStatus.current?.departure;
        const after = status.departure;
        const changes: string[] = [];
        if (before && after) {
          if (after.gate && after.gate !== before.gate) changes.push(`Gate ${after.gate}`);
          if (after.terminal && after.terminal !== before.terminal) changes.push(`Terminal ${after.terminal}`);
          if ((after.delayMinutes || 0) !== (before.delayMinutes || 0)) changes.push(`Delay ${after.delayMinutes || 0} min`);
        }
        if (lastStatus.current && status.status !== lastStatus.current.status) changes.push(status.status);
        lastStatus.current = status;
        updateFlight(flight.id, { liveStatus: status });
        if (changes.length) notify(`${flight.airline}${flight.flightNumber}`, changes.join(' · '));
      } catch { /* keep last known */ }
    }, STATUS_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id, upcoming]);

  if (!flight) {
    return <main className="page"><div className="card empty" style={{ marginTop: 40 }}><h2>Flight not found</h2><Link to="/diary" className="btn">Go to diary</Link></div></main>;
  }

  const from = airport(flight.from);
  const to = airport(flight.to);
  const live = flight.liveStatus;
  const b = flight.briefing;
  const delay = live?.departure?.delayMinutes ?? b?.flight.delayMinutes;

  return (
    <main className="page">
      <header className="page-header">
        <div><div className="eyebrow">{airlineName(flight.airline)} · {flight.airline} {flight.flightNumber}</div><h1>{from?.city || flight.from} → {to?.city || flight.to}</h1></div>
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">←</button>
      </header>

      <div className="stack">
        <FlightCard flight={flight} photo={upcoming} link={false} />

        {(live || b?.flight.status) && (
          <div className="row">
            <span className={`pill ${delay && delay > 0 ? 'warn' : 'good'}`}>{live?.status || b?.flight.status}</span>
            {delay != null && delay > 0 && <span className="pill warn">Delayed ~{delay} min</span>}
            {live?.arrival?.baggageBelt && <span className="pill">Baggage belt {live.arrival.baggageBelt}</span>}
          </div>
        )}

        <div className="facts">
          <Clock label={`Now at ${flight.from}`} tz={from?.tz} now={now} />
          <Clock label={`Now at ${flight.to}`} tz={to?.tz} now={now} />
          <div className="fact"><small>{to?.city || 'Destination'}</small><b>{weather ? `${weatherIcon(weather.code)} ${weather.max}°` : `${flagEmoji(to?.country)}`}</b></div>
          <div className="fact"><small>Booking</small><b>{flight.pnr || '–'}</b></div>
        </div>

        {credit.length > 0 && (
          <div className="card flat">
            <div className="tiny muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Give this number at check-in</div>
            {credit.slice(0, 2).map(({ membership, program, reason }) => (
              <div key={membership.id} className="row" style={{ marginTop: 10 }}>
                <ProgramLogo program={program} className="logo" />
                <div className="grow">
                  <b className="small">{program.name}{membership.tier ? ` · ${membership.tier}` : ''}</b>
                  <div className="mono">{formatMemberNumber(membership.memberNumber)}</div>
                  <div className="tiny muted">{reason}</div>
                </div>
                <button className="btn sm" onClick={() => copyText(membership.memberNumber.replace(/\s+/g, ''), 'Number copied')}>Copy</button>
              </div>
            ))}
          </div>
        )}

        {upcoming && <LiveLinks flight={flight} el={settings.language === 'el'} />}

        {IS_ARTIFACT && <TripItCard flight={flight} />}

        <div className="row">
          {upcoming && <button className="btn primary grow" onClick={() => loadBriefing(flight)} disabled={loading}>{loading ? 'Researching…' : b ? '↻ Refresh briefing' : 'Get travel briefing'}</button>}
          {upcoming && !IS_ARTIFACT && 'Notification' in window && Notification.permission !== 'granted' && (
            <button className="btn" onClick={() => Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Alerts on for gate & delay changes' : 'Alerts not allowed'))}>🔔 Alerts</button>
          )}
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        </div>
        {error && <div className="notice error">{error}</div>}
        {loading && !b && <BriefingSkeleton />}
        {b && (b.lang || 'en') !== (settings.language || 'en') && (
          <div className="notice small">{settings.language === 'el' ? 'Αυτό το briefing (ενημέρωση) είναι στα αγγλικά. Πάτα ↻ Refresh (ανανέωση) για να γραφτεί στα ελληνικά.' : 'This briefing is in Greek. Tap ↻ Refresh briefing to get it in English.'}</div>
        )}
        {b && <BriefingView briefing={b} passport={settings.passport} el={(b.lang || 'en') === 'el'} />}
      </div>

      {editing && <EditFlight flight={flight} onClose={() => setEditing(false)} onDelete={() => { deleteFlight(flight.id); toast('Flight deleted'); navigate('/diary'); }} />}
    </main>
  );
}

/** Forward this flight's booking email from the viewer's Gmail to TripIt. */
function TripItCard({ flight }: { flight: Flight }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);

  const send = async (messageId: string) => {
    setError(''); setBusy('Sending to TripIt…');
    try {
      await forwardToTripIt(messageId);
      updateFlight(flight.id, { gmailMessageId: messageId, tripitSentAt: new Date().toISOString() });
      setChoosing(false);
      toast('Sent to TripIt ✓');
    } catch (e) {
      // A failed send may still have gone out, so it is never retried automatically.
      setError(`${gmailErrorText(e)} Check TripIt before sending again.`);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="card stack">
      <div className="spread">
        <h2>🧳 TripIt</h2>
        {flight.tripitSentAt && <span className="pill good">Sent {new Date(flight.tripitSentAt).toLocaleDateString()}</span>}
      </div>
      <p className="small muted">
        Adds this trip to your TripIt by forwarding its booking email from your Gmail to {TRIPIT_ADDRESS}. TripIt only accepts it if your Gmail address is on your TripIt account (TripIt → Settings → Email addresses).
      </p>
      {flight.gmailMessageId && !choosing ? (
        <div className="row">
          <ConfirmButton className="btn primary grow" label={flight.tripitSentAt ? 'Send to TripIt again' : 'Send to TripIt'}
            confirmLabel={`Tap again to email ${TRIPIT_ADDRESS}`} onConfirm={() => send(flight.gmailMessageId!)} />
          <button type="button" className="btn" onClick={() => setChoosing(true)}>Pick another email</button>
        </div>
      ) : (
        <GmailPicker query={queryForFlight(flight)} searchLabel="Find this booking in Gmail" pickLabel="Send"
          busy={busy} onPick={(t) => send(t.messageId)} />
      )}
      {busy && flight.gmailMessageId && !choosing && <div className="notice small" role="status">{busy}</div>}
      {error && <div className="notice error small" role="alert">{error}</div>}
    </section>
  );
}

function BriefingSkeleton() {
  return (
    <div className="card stack">
      <p className="small muted">Checking lounges near your gate, entry rules for your passport, strikes and the best way into town… this takes about a minute.</p>
      {[80, 95, 60, 90, 70].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%` }} />)}
    </div>
  );
}

const MODE_ICON: Record<string, string> = { train: '🚆', metro: '🚇', bus: '🚌', taxi: '🚕', rideshare: '🚗', shuttle: '🚐' };

const EL_TEXT = {
  offline: 'Ετοιμάστηκε από τον Claude με όσα γνωρίζει, χωρίς live (ζωντανή) αναζήτηση στο web. Επιβεβαίωσε Gate (Πύλη), ώρες Lounge (Αίθουσας αναμονής) και απεργίες με την αεροπορική και το αεροδρόμιο πριν ταξιδέψεις.',
  lounges: '🛋️ Lounges (Αίθουσες αναμονής) κοντά στο Gate (Πύλη)', closest: 'Πιο κοντά', near: 'κοντά στα Gates (Πύλες)',
  noLounge: 'Δεν βρέθηκε Lounge (Αίθουσα αναμονής) με πρόσβαση για σένα σε αυτό το αεροδρόμιο.',
  disruptions: '⚠️ Απεργίες & αναστατώσεις', noDisruptions: '✅ Δεν αναφέρεται τίποτα για τις ημερομηνίες του ταξιδιού σου.',
  entry: (p: string) => `🛂 Κανόνες εισόδου · διαβατήριο ${p === 'Greece' ? 'Ελλάδας' : p}`, visa: 'Visa (Θεώρηση)', official: 'Επίσημη πηγή ↗',
  transport: '🚕 Μετά την προσγείωση: προς την πόλη', recommended: 'Προτείνεται', noTransport: 'Δεν βρέθηκαν πληροφορίες μετακίνησης.',
  tips: '💡 Συμβουλές', sources: 'Πηγές', updated: 'Ενημερώθηκε', confirm: 'Επιβεβαίωνε πάντα το Gate (Πύλη) στις οθόνες του αεροδρομίου.',
};
const EL_VALUE: Record<string, string> = {
  yes: 'Ναι', no: 'Όχι', conditional: 'Με προϋποθέσεις', unknown: 'άγνωστο',
  strike: 'Απεργία', weather: 'Καιρός', airport: 'Αεροδρόμιο', airline: 'Αεροπορική', other: 'Άλλο',
};

// The airline's own status page, where we know it.
const AIRLINE_STATUS: Record<string, string> = {
  A3: 'https://en.aegeanair.com/travel-info/flight-status/', OA: 'https://en.aegeanair.com/travel-info/flight-status/',
  LH: 'https://www.lufthansa.com/xx/en/flight-status', LX: 'https://www.swiss.com/xx/en/prepare/flight-status',
  OS: 'https://www.austrian.com/xx/en/flight-status', KL: 'https://www.klm.com/information/flight-status',
  AF: 'https://wwws.airfrance.us/information/flight-status', BA: 'https://www.britishairways.com/travel/flightstatus/public/en_gb',
  TK: 'https://www.turkishairlines.com/en-int/flights/flight-status/', AZ: 'https://www.ita-airways.com/en_us/fly-ita/flight-status.html',
  UA: 'https://www.united.com/en/us/flightstatus', EK: 'https://www.emirates.com/english/manage-booking/flight-status/',
};

/** Live status lives on other websites (the claude.ai page cannot fetch it): one tap opens it. */
function LiveLinks({ flight, el }: { flight: Flight; el: boolean }) {
  const code = `${flight.airline}${flight.flightNumber}`;
  const icao = airlineIcao(flight.airline);
  const links = [
    { label: 'Google', href: `https://www.google.com/search?q=${encodeURIComponent(`${flight.airline} ${flight.flightNumber} flight status`)}` },
    { label: 'Flightradar24', href: `https://www.flightradar24.com/data/flights/${code.toLowerCase()}` },
    icao && { label: 'FlightAware', href: `https://www.flightaware.com/live/flight/${icao}${flight.flightNumber}` },
    AIRLINE_STATUS[flight.airline] && { label: airlineName(flight.airline), href: AIRLINE_STATUS[flight.airline] },
  ].filter(Boolean) as { label: string; href: string }[];
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h2 style={{ margin: 0 }}>{el ? '📡 Live (ζωντανή) κατάσταση πτήσης' : '📡 Live flight status'}</h2>
      <p className="tiny muted" style={{ margin: 0 }}>
        {el ? `Gate (Πύλη), Terminal (Τερματικός σταθμός) και καθυστερήσεις για την ${flight.airline} ${flight.flightNumber}, ενημερωμένα τώρα:` : `Gate, terminal and delays for ${flight.airline} ${flight.flightNumber}, up to the minute:`}
      </p>
      <div className="row" style={{ gap: 8 }}>
        {links.map((l) => <a key={l.label} className="btn sm" href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}
      </div>
    </section>
  );
}

function BriefingView({ briefing: b, passport, el = false }: { briefing: Briefing; passport: string; el?: boolean }) {
  const e = b.entryRequirements || {};
  const v = (x?: string) => (el && x ? EL_VALUE[x.toLowerCase()] || x : x);
  const visaClass = ({ no: 'good', yes: 'bad', conditional: 'warn' } as Record<string, string>)[String(e.visaRequired).toLowerCase()] || '';
  return (
    <>
      {b.offline && (
        <div className="notice warn small">{el ? EL_TEXT.offline : 'Prepared by Claude from what it knows, without live web research or live flight data. Check gates, lounge hours and strike news with the airline and airport before you travel.'}</div>
      )}
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>{el ? EL_TEXT.lounges : '🛋️ Lounges near your gate'}</h2>
        {b.lounges?.length ? b.lounges.map((l, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{l.name}</b>{i === 0 && <span className="pill good">{el ? EL_TEXT.closest : 'Closest'}</span>}</div>
            <span className="small muted">{[l.terminal, l.location, l.nearGates && `${el ? EL_TEXT.near : 'near gates'} ${l.nearGates}`].filter(Boolean).join(' · ')}</span>
            {l.walkFromGate && <span className="small">🚶 {l.walkFromGate}</span>}
            {l.hours && <span className="small">🕒 {l.hours}</span>}
            {l.access && <span className="small">🎫 {l.access}</span>}
            {l.notes && <span className="small muted">{l.notes}</span>}
          </div>
        )) : <p className="small muted">{el ? EL_TEXT.noLounge : 'No lounge you can access was found at this airport.'}</p>}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>{el ? EL_TEXT.disruptions : '⚠️ Strikes & disruptions'}</h2>
        {b.disruptions?.length ? b.disruptions.map((d, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{d.title}</b><span className={`pill ${d.severity === 'critical' ? 'bad' : d.severity === 'warning' ? 'warn' : ''}`}>{v(d.type)}</span></div>
            {d.dates && <span className="small muted">{d.dates}</span>}
            {d.details && <span className="small">{d.details}</span>}
          </div>
        )) : <p className="small muted">{el ? EL_TEXT.noDisruptions : '✅ Nothing reported for your travel dates.'}</p>}
      </section>

      <section className="card stack">
        <h2>{el ? EL_TEXT.entry(passport) : `🛂 Entry rules · ${passport} passport`}</h2>
        <div className="row"><span className={`pill ${visaClass}`}>{el ? EL_TEXT.visa : 'Visa'}: {v(e.visaRequired || 'unknown')}</span><span className="small">{e.destinationCountry}</span></div>
        {e.summary && <p className="small">{e.summary}</p>}
        {!!e.requirements?.length && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{e.requirements.filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}</ul>}
        {e.officialLink && <a className="small" href={e.officialLink} target="_blank" rel="noopener noreferrer">{el ? EL_TEXT.official : 'Official source ↗'}</a>}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>{el ? EL_TEXT.transport : '🚕 After landing: into the city'}</h2>
        {b.groundTransport?.length ? b.groundTransport.map((t, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{MODE_ICON[t.mode || ''] || '➡️'} {t.name}</b>{t.recommended && <span className="pill good">{el ? EL_TEXT.recommended : 'Recommended'}</span>}</div>
            {t.where && <span className="small">📍 {t.where}</span>}
            <span className="small muted">{[t.duration && `⏱ ${t.duration}`, t.price && `💶 ${t.price}`, t.frequency && `🔁 ${t.frequency}`].filter(Boolean).join('   ')}</span>
            {t.notes && <span className="small muted">{t.notes}</span>}
          </div>
        )) : <p className="small muted">{el ? EL_TEXT.noTransport : 'No transport information found.'}</p>}
      </section>

      {!!b.tips?.length && (
        <section className="card"><h2 style={{ marginBottom: 8 }}>{el ? EL_TEXT.tips : '💡 Tips'}</h2><ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{b.tips.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul></section>
      )}

      <details className="card how">
        <summary>{el ? EL_TEXT.sources : 'Sources'} ({b.sources?.length || 0})</summary>
        <ul className="small" style={{ paddingLeft: 18, wordBreak: 'break-word' }}>{b.sources?.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
        <p className="tiny faint">{el ? `${EL_TEXT.updated} ${new Date(b.generatedAt).toLocaleString('el-GR')}. ${EL_TEXT.confirm}` : `Updated ${new Date(b.generatedAt).toLocaleString()}. Always confirm gates on airport screens.`}</p>
      </details>
    </>
  );
}

function EditFlight({ flight, onClose, onDelete }: { flight: Flight; onClose: () => void; onDelete: () => void }) {
  const [f, setF] = useState(flight);
  const set = (patch: Partial<Flight>) => setF((x) => ({ ...x, ...patch }));
  return (
    <Sheet title="Edit flight" onClose={onClose}>
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        const { seat, cabin, pnr, depLocal, arrLocal, notes, aircraft } = f;
        updateFlight(flight.id, { seat, cabin, pnr, depLocal, arrLocal, notes, aircraft });
        toast('Saved');
        onClose();
      }}>
        <div className="grid-2">
          <Field label="Departs (local)"><input className="input" type="time" value={f.depLocal || ''} onChange={(e) => set({ depLocal: e.target.value })} /></Field>
          <Field label="Arrives (local)"><input className="input" type="time" value={f.arrLocal || ''} onChange={(e) => set({ arrLocal: e.target.value })} /></Field>
          <Field label="Seat"><input className="input code" value={f.seat || ''} onChange={(e) => set({ seat: e.target.value.toUpperCase() })} /></Field>
          <Field label="Cabin">
            <select className="input" value={f.cabin || ''} onChange={(e) => set({ cabin: e.target.value as Cabin })}>
              <option value="">—</option><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option>
            </select>
          </Field>
          <Field label="Booking ref"><input className="input code" value={f.pnr || ''} onChange={(e) => set({ pnr: e.target.value.toUpperCase() })} /></Field>
          <Field label="Aircraft"><input className="input" value={f.aircraft || ''} onChange={(e) => set({ aircraft: e.target.value })} /></Field>
        </div>
        <Field label="Diary notes"><textarea className="input" value={f.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Upgrade! Window view over the Alps…" style={{ minHeight: 90 }} /></Field>
        <button className="btn primary">Save</button>
        <ConfirmButton className="btn ghost danger" label="Delete flight" confirmLabel="Tap again to delete this flight" onConfirm={onDelete} />
        <p className="tiny faint">{countryName(airport(flight.from)?.country)} → {countryName(airport(flight.to)?.country)} · added from {flight.source}</p>
      </form>
    </Sheet>
  );
}
