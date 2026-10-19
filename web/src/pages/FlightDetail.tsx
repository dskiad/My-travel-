import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FlightCard } from '../components/FlightCard.tsx';
import { ProgramLogo, formatMemberNumber } from '../components/MemberCard.tsx';
import { ConfirmButton, Field, Sheet, copyText, toast } from '../components/ui.tsx';
import { IS_ARTIFACT } from '../lib/platform.ts';
import { deleteFlight, updateFlight, useStore } from '../lib/store.ts';
import { isPast } from '../lib/flights.ts';
import { airport, airlineName, countryName, flagEmoji } from '../lib/geo.ts';
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
      const { briefing, liveStatus } = await getBriefing(f, settings.passport, statusSummary(memberships));
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

        <div className="row">
          {upcoming && <button className="btn primary grow" onClick={() => loadBriefing(flight)} disabled={loading}>{loading ? 'Researching…' : b ? '↻ Refresh briefing' : 'Get travel briefing'}</button>}
          {upcoming && !IS_ARTIFACT && 'Notification' in window && Notification.permission !== 'granted' && (
            <button className="btn" onClick={() => Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Alerts on for gate & delay changes' : 'Alerts not allowed'))}>🔔 Alerts</button>
          )}
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        </div>
        {error && <div className="notice error">{error}</div>}
        {loading && !b && <BriefingSkeleton />}
        {b && <BriefingView briefing={b} passport={settings.passport} />}
      </div>

      {editing && <EditFlight flight={flight} onClose={() => setEditing(false)} onDelete={() => { deleteFlight(flight.id); toast('Flight deleted'); navigate('/diary'); }} />}
    </main>
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

function BriefingView({ briefing: b, passport }: { briefing: Briefing; passport: string }) {
  const e = b.entryRequirements || {};
  const visaClass = ({ no: 'good', yes: 'bad', conditional: 'warn' } as Record<string, string>)[String(e.visaRequired).toLowerCase()] || '';
  return (
    <>
      {b.offline && (
        <div className="notice warn small">Prepared by Claude from what it knows, without live web research or live flight data. Check gates, lounge hours and strike news with the airline and airport before you travel.</div>
      )}
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>🛋️ Lounges near your gate</h2>
        {b.lounges?.length ? b.lounges.map((l, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{l.name}</b>{i === 0 && <span className="pill good">Closest</span>}</div>
            <span className="small muted">{[l.terminal, l.location, l.nearGates && `near gates ${l.nearGates}`].filter(Boolean).join(' · ')}</span>
            {l.walkFromGate && <span className="small">🚶 {l.walkFromGate}</span>}
            {l.hours && <span className="small">🕒 {l.hours}</span>}
            {l.access && <span className="small">🎫 {l.access}</span>}
            {l.notes && <span className="small muted">{l.notes}</span>}
          </div>
        )) : <p className="small muted">No lounge you can access was found at this airport.</p>}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>⚠️ Strikes & disruptions</h2>
        {b.disruptions?.length ? b.disruptions.map((d, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{d.title}</b><span className={`pill ${d.severity === 'critical' ? 'bad' : d.severity === 'warning' ? 'warn' : ''}`}>{d.type}</span></div>
            {d.dates && <span className="small muted">{d.dates}</span>}
            {d.details && <span className="small">{d.details}</span>}
          </div>
        )) : <p className="small muted">✅ Nothing reported for your travel dates.</p>}
      </section>

      <section className="card stack">
        <h2>🛂 Entry rules · {passport} passport</h2>
        <div className="row"><span className={`pill ${visaClass}`}>Visa: {e.visaRequired || 'unknown'}</span><span className="small">{e.destinationCountry}</span></div>
        {e.summary && <p className="small">{e.summary}</p>}
        {!!e.requirements?.length && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{e.requirements.filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}</ul>}
        {e.officialLink && <a className="small" href={e.officialLink} target="_blank" rel="noopener noreferrer">Official source ↗</a>}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>🚕 After landing: into the city</h2>
        {b.groundTransport?.length ? b.groundTransport.map((t, i) => (
          <div key={i} className="brief-item">
            <div className="spread"><b>{MODE_ICON[t.mode || ''] || '➡️'} {t.name}</b>{t.recommended && <span className="pill good">Recommended</span>}</div>
            {t.where && <span className="small">📍 {t.where}</span>}
            <span className="small muted">{[t.duration && `⏱ ${t.duration}`, t.price && `💶 ${t.price}`, t.frequency && `🔁 ${t.frequency}`].filter(Boolean).join('   ')}</span>
            {t.notes && <span className="small muted">{t.notes}</span>}
          </div>
        )) : <p className="small muted">No transport information found.</p>}
      </section>

      {!!b.tips?.length && (
        <section className="card"><h2 style={{ marginBottom: 8 }}>💡 Tips</h2><ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{b.tips.filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}</ul></section>
      )}

      <details className="card how">
        <summary>Sources ({b.sources?.length || 0})</summary>
        <ul className="small" style={{ paddingLeft: 18, wordBreak: 'break-word' }}>{b.sources?.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
        <p className="tiny faint">Updated {new Date(b.generatedAt).toLocaleString()}. Always confirm gates on airport screens.</p>
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
