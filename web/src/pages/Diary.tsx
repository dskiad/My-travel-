import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlightRow } from '../components/FlightCard.tsx';
import { WorldMap } from '../components/WorldMap.tsx';
import { AirlineLogo } from '../components/AirlineLogo.tsx';
import { useStore } from '../lib/store.ts';
import { computeStats, formatDuration, isPast } from '../lib/flights.ts';
import { airlineName, airport } from '../lib/geo.ts';
import type { Flight } from '../lib/types.ts';

const EARTH_KM = 40075;
const MOON_KM = 384400;

function groupByMonth(list: Flight[]) {
  const groups = new Map<string, Flight[]>();
  for (const f of list) {
    const label = new Date(`${f.date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(f);
  }
  return [...groups.entries()];
}

export default function Diary() {
  const { flights } = useStore();
  const [tab, setTab] = useState<'past' | 'upcoming'>('past');
  const [year, setYear] = useState<string>('all');

  const past = useMemo(() => flights.filter((f) => isPast(f)), [flights]);
  const upcoming = useMemo(() => flights.filter((f) => !isPast(f)), [flights]);
  const years = useMemo(() => [...new Set(past.map((f) => f.date.slice(0, 4)))].sort().reverse(), [past]);
  const scoped = useMemo(() => (year === 'all' ? past : past.filter((f) => f.date.startsWith(year))), [past, year]);
  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const list = tab === 'past' ? [...scoped].reverse() : upcoming;

  if (!flights.length) {
    return (
      <main className="page">
        <header className="page-header"><div><div className="eyebrow">Travel diary</div><h1>Your flying story</h1></div></header>
        <div className="card empty">
          <div className="big">📖</div>
          <h2>Your diary is empty</h2>
          <p className="muted small">Every flight you add lands here, with your routes on a map and lifetime stats. Import years of history from Flighty, myFlightradar24 or TripIt in one go.</p>
          <Link to="/add" className="btn accent">+ Add flights</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="hero" style={{ paddingBottom: 24 }}>
        <div className="page">
          <div className="greeting">Travel diary</div>
          <h1>{stats.km.toLocaleString()} km {year === 'all' ? 'flown' : `in ${year}`}</h1>
          <p style={{ opacity: .8, marginTop: 4 }}>
            {(stats.km / EARTH_KM).toFixed(1)}× around the Earth
            {stats.km > MOON_KM / 10 && <> · {((stats.km / MOON_KM) * 100).toFixed(0)}% of the way to the Moon</>}
          </p>
          <div className="chips" style={{ marginTop: 14 }}>
            {['all', ...years].map((y) => (
              <button key={y} className="chip" aria-pressed={year === y} onClick={() => setYear(y)}
                style={year === y ? undefined : { background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'rgba(255,255,255,.15)' }}>
                {y === 'all' ? 'All time' : y}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}><WorldMap flights={[...scoped, ...upcoming]} /></div>
          <div className="stats" style={{ marginTop: 12 }}>
            <div className="stat"><b>{stats.flights}</b><span>flights</span></div>
            <div className="stat"><b>{formatDuration(stats.minutes).replace(/ \d+m$/, '')}</b><span>in the air</span></div>
            <div className="stat"><b>{stats.countries}</b><span>countries</span></div>
            <div className="stat"><b>{stats.airports}</b><span>airports</span></div>
            <div className="stat"><b>{stats.airlines}</b><span>airlines</span></div>
            <div className="stat"><b>{Object.keys(stats.byYear).length}</b><span>years</span></div>
          </div>
        </div>
      </header>

      <main className="page">
        {(stats.topAirline || stats.longest) && (
          <section className="section grid-2">
            {stats.topAirline && (
              <div className="card flat row">
                <AirlineLogo code={stats.topAirline[0]} />
                <div className="grow"><div className="tiny muted">Favourite airline</div><b className="small">{airlineName(stats.topAirline[0])}</b><div className="tiny muted">{stats.topAirline[1]} flights</div></div>
              </div>
            )}
            {stats.longest && (
              <Link to={`/flight/${stats.longest.id}`} className="card flat" style={{ color: 'inherit' }}>
                <div className="tiny muted">Longest flight</div>
                <b className="mono">{stats.longest.from} → {stats.longest.to}</b>
                <div className="tiny muted">{airport(stats.longest.from)?.city} – {airport(stats.longest.to)?.city}</div>
              </Link>
            )}
          </section>
        )}

        <section className="section">
          <div className="chips">
            <button className="chip" aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Flown · {scoped.length}</button>
            <button className="chip" aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Upcoming · {upcoming.length}</button>
          </div>
          {list.length === 0 && <p className="muted small" style={{ marginTop: 16 }}>Nothing here yet.</p>}
          {groupByMonth(list).map(([month, items]) => (
            <div key={month}>
              <div className="month">{month}</div>
              <div className="stack">{items.map((f) => <FlightRow key={f.id} flight={f} />)}</div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
