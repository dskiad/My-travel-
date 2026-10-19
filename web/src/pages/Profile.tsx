import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AirportInput } from '../components/AirportInput.tsx';
import { Field, toast } from '../components/ui.tsx';
import { addFlights, exportBackup, importBackup, saveSettings, useStore } from '../lib/store.ts';
import { getConfig, importCalendar, type ServerConfig } from '../lib/api.ts';
import { statusSummary } from '../lib/loyalty.ts';
import type { Cabin } from '../lib/types.ts';
import { IS_ARTIFACT, capability } from '../lib/platform.ts';

export default function Profile() {
  const { settings, flights, memberships } = useStore();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getConfig().then(setConfig).catch(() => setConfig(null)); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const { flights: found } = await importCalendar(settings.calendarUrl);
      const { added, updated } = addFlights(found.map((f) => ({ ...f, source: 'calendar' as const })), 'calendar');
      toast(`Calendar synced: ${added} new, ${updated} updated`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const download = async () => {
    const filename = `my-travel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (IS_ARTIFACT) {
      const downloads = await capability<{ save(r: { filename: string; data: Blob }): Promise<unknown> }>('downloads');
      if (!downloads) { toast('Saving files is not available here'); return; }
      try { await downloads.save({ filename, data: exportBackup() }); } catch { /* the viewer declined */ }
      return;
    }
    const url = URL.createObjectURL(exportBackup());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };

  const status = statusSummary(memberships);

  return (
    <main className="page">
      <header className="page-header">
        <div><div className="eyebrow">Profile</div><h1>{settings.name || 'Traveller'}</h1></div>
      </header>

      <section className="card stack">
        <h2>About you</h2>
        <Field label="Name"><input className="input" value={settings.name} onChange={(e) => saveSettings({ name: e.target.value })} placeholder="As on your passport" /></Field>
        <div className="grid-2">
          <Field label="Passport"><input className="input" value={settings.passport} onChange={(e) => saveSettings({ passport: e.target.value })} placeholder="Greece" /></Field>
          <Field label="Usual cabin">
            <select className="input" value={settings.cabin} onChange={(e) => saveSettings({ cabin: e.target.value as Cabin })}>
              <option value="">—</option><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option>
            </select>
          </Field>
        </div>
        <Field label="Home airport"><AirportInput value={settings.homeAirport} onChange={(homeAirport) => saveSettings({ homeAirport })} placeholder="ATH" /></Field>
        <p className="tiny muted">
          Entry rules in briefings use your passport. Lounge advice uses your cabin and the statuses in your <Link to="/wallet">wallet</Link>
          {status ? `: ${status}.` : ' (add your tier to each card).'}
        </p>
      </section>

      {!IS_ARTIFACT && <section className="section card stack">
        <h2>Connected calendar</h2>
        {settings.calendarUrl ? (
          <>
            <p className="small muted" style={{ wordBreak: 'break-all' }}>{settings.calendarUrl.replace(/(private\/|ical\/)[^/]+/, '$1••••')}</p>
            <div className="row">
              <button className="btn primary" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync calendar'}</button>
              <button className="btn ghost danger" onClick={() => saveSettings({ calendarUrl: '' })}>Disconnect</button>
            </div>
          </>
        ) : (
          <p className="small muted">Connect TripIt, Google Calendar or Outlook from <Link to="/add">Add → TripIt & calendars</Link> to pull in new trips with one tap.</p>
        )}
      </section>}

      <section className="section card stack">
        <h2>Your data</h2>
        <p className="small muted">{flights.length} flights and {memberships.length} cards are stored privately {IS_ARTIFACT ? 'in your claude.ai account (only you can see them)' : 'on this device'}. Download a backup to keep a copy or move them elsewhere.</p>
        <div className="row">
          <button className="btn" onClick={download}>⬇ Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Restore backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { added } = await importBackup(f);
              toast(`Backup restored: ${added} flights added`);
            } catch (err) {
              toast((err as Error).message);
            }
          }} />
        </div>
      </section>

      <section className="section card stack">
        <h2>Services</h2>
        <div className="spread small"><span>AI briefings, ticket & email reading</span><span className={`pill ${config?.claude ? 'good' : 'warn'}`}>{config ? (config.claude ? 'On' : IS_ARTIFACT ? 'Open on claude.ai' : 'Needs API key') : 'Offline'}</span></div>
        <div className="spread small"><span>Live gates, delays & schedule lookup</span><span className={`pill ${config?.liveFlightStatus ? 'good' : 'warn'}`}>{IS_ARTIFACT ? 'Full app only' : config ? (config.liveFlightStatus ? 'On' : 'Optional key') : 'Offline'}</span></div>
        <p className="tiny faint">
          Airline logos from Aviasales/Google; airport data from OurAirports & OpenFlights; destination photos from Wikipedia; weather from Open-Meteo.
        </p>
      </section>
    </main>
  );
}
