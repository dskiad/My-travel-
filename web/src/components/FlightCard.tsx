import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AirlineLogo } from './AirlineLogo.tsx';
import { airlineColor } from '../lib/airlines.ts';
import { airport, airlineName, distanceKm, flagEmoji } from '../lib/geo.ts';
import { departureDate, durationMinutes, formatDuration, isPast } from '../lib/flights.ts';
import { destinationPhoto } from '../lib/api.ts';
import type { Flight } from '../lib/types.ts';

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts);
}

export function countdown(f: Flight, now = Date.now()): string {
  const ms = departureDate(f).getTime() - now;
  if (ms < 0) return isPast(f, now) ? 'Completed' : 'In the air';
  const h = Math.floor(ms / 36e5);
  if (h < 1) return `in ${Math.max(1, Math.round(ms / 6e4))} min`;
  if (h < 48) return `in ${h}h ${Math.floor((ms % 36e5) / 6e4)}m`;
  return `in ${Math.round(ms / 864e5)} days`;
}

/** A flight rendered as a boarding pass. */
export function FlightCard({ flight, photo = false, link = true }: { flight: Flight; photo?: boolean; link?: boolean }) {
  const from = airport(flight.from);
  const to = airport(flight.to);
  const [img, setImg] = useState<string | null>(null);
  const live = flight.liveStatus?.departure;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (photo) destinationPhoto(flight.to).then(setImg);
  }, [photo, flight.to]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const body = (
    <article className={`pass${photo ? ' photo' : ''}`}>
      <span className="stripe" style={{ background: airlineColor(flight.airline) }} />
      {photo && (
        <div className="pass-photo" style={{ backgroundImage: img ? `url("${img}")` : 'linear-gradient(135deg, #12245a, #3b2a6e, #ff7a59)' }}>
          <div className="photo-caption">
            <b>{to?.city || flight.to} {flagEmoji(to?.country)}</b>
            <span className="pill" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>
              <span className="countdown">{countdown(flight, now)}</span>
            </span>
          </div>
        </div>
      )}
      <div className="pass-top">
        <AirlineLogo code={flight.airline} />
        <div className="airline">
          <b>{airlineName(flight.airline)}</b>
          <span className="small muted mono">{flight.airline} {flight.flightNumber} · {formatDate(flight.date)}</span>
        </div>
        {!photo && <span className={`pill ${isPast(flight, now) ? '' : 'brand'}`}>{countdown(flight, now)}</span>}
      </div>
      <div className="pass-main">
        <div className="route">
          <div>
            <div className="iata">{flight.from}</div>
            <div className="city">{from?.city || '—'}</div>
            <div className="time">{flight.depLocal || '--:--'}</div>
          </div>
          <div className="path">
            <span>{formatDuration(durationMinutes(flight))}</span>
            <span className="line" />
            <span>{distanceKm(from, to).toLocaleString()} km</span>
          </div>
          <div className="end">
            <div className="iata">{flight.to}</div>
            <div className="city">{to?.city || '—'}</div>
            <div className="time">{flight.arrLocal || '--:--'}</div>
          </div>
        </div>
      </div>
      <div className="perf" />
      <div className="pass-foot">
        <div><small>Terminal</small><b>{live?.terminal || flight.briefing?.flight.departureTerminal || '–'}</b></div>
        <div><small>Gate</small><b>{live?.gate || flight.briefing?.flight.departureGate || '–'}</b></div>
        <div><small>Seat</small><b>{flight.seat || '–'}</b></div>
        <div><small>Class</small><b>{flight.cabin ? flight.cabin.replace('Premium Economy', 'Prem. Eco') : '–'}</b></div>
      </div>
    </article>
  );
  return link ? <Link to={`/flight/${flight.id}`} aria-label={`${flight.airline}${flight.flightNumber} ${flight.from} to ${flight.to}`}>{body}</Link> : body;
}

export function FlightRow({ flight }: { flight: Flight }) {
  const from = airport(flight.from);
  const to = airport(flight.to);
  return (
    <Link to={`/flight/${flight.id}`} className="flight-row">
      <AirlineLogo code={flight.airline} size="sm" />
      <div className="r-main">
        <div className="r-route">{flight.from} → {flight.to}</div>
        <div className="r-sub">{from?.city} to {to?.city} · {airlineName(flight.airline)} {flight.flightNumber}</div>
      </div>
      <div className="r-right">
        <div><b>{formatDate(flight.date, { day: 'numeric', month: 'short' })}</b></div>
        <div>{distanceKm(from, to).toLocaleString()} km</div>
      </div>
    </Link>
  );
}
