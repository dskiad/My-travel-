import { useMemo } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';
import { airport } from '../lib/geo.ts';
import type { Flight } from '../lib/types.ts';

const W = 960;
const H = 500;
const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const land = feature(topo, topo.objects.land);

/** Every flight as a great-circle arc on a night-style world map. */
export function WorldMap({ flights, highlight }: { flights: Flight[]; highlight?: string }) {
  const { paths, dots, landPath, grid } = useMemo(() => {
    // Zoom to the region actually flown (with margin), or the whole world.
    const points: [number, number][] = [];
    for (const f of flights) {
      for (const ap of [airport(f.from), airport(f.to)]) {
        if (ap) for (const [dx, dy] of [[-12, -8], [12, 8]]) points.push([ap.lon + dx, Math.max(-80, Math.min(80, ap.lat + dy))]);
      }
    }
    const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]],
      points.length ? { type: 'MultiPoint', coordinates: points } : { type: 'Sphere' });
    const path = geoPath(projection);
    const routes = new Map<string, { d: string; count: number; upcoming: boolean }>();
    const seen = new Map<string, [number, number]>();
    const today = new Date().toISOString().slice(0, 10);
    for (const f of flights) {
      const a = airport(f.from);
      const b = airport(f.to);
      if (!a || !b) continue;
      const key = [f.from, f.to].sort().join('-');
      const prev = routes.get(key);
      const upcoming = f.date >= today;
      if (prev) { prev.count++; prev.upcoming ||= upcoming; continue; }
      const d = path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] });
      if (d) routes.set(key, { d, count: 1, upcoming });
      for (const ap of [a, b]) {
        const p = projection([ap.lon, ap.lat]);
        if (p) seen.set(ap.iata, p as [number, number]);
      }
    }
    return {
      paths: [...routes.entries()],
      dots: [...seen.entries()],
      landPath: path(land) || '',
      grid: path(geoGraticule10()) || '',
    };
  }, [flights]);

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${paths.length} routes`}>
        <defs>
          <linearGradient id="arc" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb547" />
            <stop offset="1" stopColor="#ff7a59" />
          </linearGradient>
        </defs>
        <path d={grid} fill="none" stroke="rgba(255,255,255,.05)" />
        <path d={landPath} fill="rgba(140,165,220,.18)" stroke="rgba(160,185,240,.25)" strokeWidth={0.6} />
        {paths.map(([key, r]) => (
          <path key={key} d={r.d} fill="none"
            stroke={r.upcoming ? '#7ee0ff' : 'url(#arc)'}
            strokeWidth={Math.min(1.4 + r.count * 0.5, 4)}
            strokeDasharray={r.upcoming ? '6 5' : undefined}
            strokeLinecap="round" opacity={0.9} />
        ))}
        {dots.map(([code, [x, y]]) => (
          <g key={code}>
            <circle cx={x} cy={y} r={code === highlight ? 6 : 3.2} fill="#fff" opacity={0.95} />
            <circle cx={x} cy={y} r={code === highlight ? 12 : 7} fill="#fff" opacity={0.12} />
          </g>
        ))}
      </svg>
    </div>
  );
}
