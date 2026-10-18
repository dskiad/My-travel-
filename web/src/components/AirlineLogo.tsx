import { useState } from 'react';
import { airlineColor, logoUrls } from '../lib/airlines.ts';
import { airlineName } from '../lib/geo.ts';

/** Airline logo from public logo CDNs, falling back to a coloured monogram. */
export function AirlineLogo({ code, size = '' }: { code: string; size?: '' | 'sm' | 'lg' }) {
  const urls = logoUrls(code);
  const [i, setI] = useState(0);
  return (
    <span className={`logo ${size}`} title={airlineName(code)}>
      {i < urls.length ? (
        <img src={urls[i]} alt={airlineName(code)} loading="lazy" onError={() => setI(i + 1)} />
      ) : (
        <span className="mono-badge" style={{ background: airlineColor(code) }}>{code}</span>
      )}
    </span>
  );
}
