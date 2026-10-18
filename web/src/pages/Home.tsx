import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlightCard, FlightRow } from '../components/FlightCard.tsx';
import { MemberCard } from '../components/MemberCard.tsx';
import { useStore } from '../lib/store.ts';
import { computeStats, isPast } from '../lib/flights.ts';
import { airport, countryName } from '../lib/geo.ts';
import { forecast, weatherIcon, type DayWeather } from '../lib/api.ts';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { flights, memberships, settings } = useStore();
  const upcoming = useMemo(() => flights.filter((f) => !isPast(f)), [flights]);
  const next = upcoming[0];
  const thisYear = useMemo(() => {
    const y = String(new Date().getFullYear());
    return computeStats(flights.filter((f) => f.date.startsWith(y) && isPast(f)));
  }, [flights]);
  const [weather, setWeather] = useState<DayWeather | null>(null);

  useEffect(() => {
    setWeather(null);
    if (next) forecast(next.to, next.date).then(setWeather);
  }, [next?.to, next?.date]);

  const dest = next && airport(next.to);

  return (
    <>
      <header className="hero">
        <div className="page">
          <div className="greeting">{greeting()}{settings.name ? `, ${settings.name.split(' ')[0]}` : ''} ✨</div>
          <h1>{next ? <>Next stop: {dest?.city || next.to}</> : 'Where to next?'}</h1>
          {next && dest && (
            <p style={{ opacity: .8, marginTop: 6 }}>
              {countryName(dest.country)}
              {weather && <> · {weatherIcon(weather.code)} {weather.min}°–{weather.max}°C on arrival day</>}
            </p>
          )}
          <div className="stats" style={{ marginTop: 18 }}>
            <div className="stat"><b>{thisYear.flights}</b><span>flights this year</span></div>
            <div className="stat"><b>{thisYear.km >= 10000 ? `${Math.round(thisYear.km / 1000)}k` : thisYear.km.toLocaleString()}</b><span>km flown</span></div>
            <div className="stat"><b>{thisYear.countries}</b><span>countries</span></div>
          </div>
        </div>
      </header>

      <main className="page overlap">
        {next ? (
          <div className="stack">
            <FlightCard flight={next} photo />
            <Link to={`/flight/${next.id}`} className="btn primary block">Open travel briefing → gate, lounge, visa, transfers</Link>
          </div>
        ) : (
          <div className="card empty">
            <div className="big">🌍</div>
            <h2>Add your first flight</h2>
            <p className="muted small">Import from TripIt, Google Calendar, a boarding pass, an e-ticket PDF or just type a flight number.</p>
            <Link to="/add" className="btn accent">+ Add a flight</Link>
          </div>
        )}

        {upcoming.length > 1 && (
          <section className="section">
            <div className="section-title"><h2>Coming up</h2><Link to="/diary" className="small">See all</Link></div>
            <div className="stack">{upcoming.slice(1, 5).map((f) => <FlightRow key={f.id} flight={f} />)}</div>
          </section>
        )}

        <section className="section">
          <div className="section-title">
            <h2>My cards</h2>
            <Link to="/wallet" className="small">{memberships.length ? 'Open wallet' : 'Add cards'}</Link>
          </div>
          {memberships.length ? (
            <div className="chips" style={{ gap: 12 }}>
              {memberships.slice(0, 6).map((m) => (
                <div key={m.id} style={{ flex: 'none', width: 260 }}>
                  <Link to={`/wallet?show=${m.id}`}><MemberCard membership={m} /></Link>
                </div>
              ))}
            </div>
          ) : (
            <Link to="/wallet" className="card flat row" style={{ color: 'inherit' }}>
              <span style={{ fontSize: '1.6rem' }}>💳</span>
              <span className="grow"><b>Keep every membership number in one place</b><br /><span className="small muted">Miles+Bonus, Miles & More, Marriott Bonvoy, Priority Pass…</span></span>
              <span>→</span>
            </Link>
          )}
        </section>
      </main>
    </>
  );
}
