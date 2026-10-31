import { useState } from 'react';
import { gmailErrorText, searchBookingEmails, BOOKING_QUERY, type MailThread } from '../lib/gmail.ts';

function shortDate(raw: string) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Searches the viewer's Gmail only when they tap the button (the first call
 * asks their permission), then lets them pick one email.
 */
export function GmailPicker({ query = BOOKING_QUERY, searchLabel, pickLabel, onPick, busy }: {
  query?: string;
  searchLabel: string;
  pickLabel: string;
  onPick: (t: MailThread) => void;
  busy?: string;
}) {
  const [threads, setThreads] = useState<MailThread[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    setLoading(true); setError('');
    try {
      setThreads(await searchBookingEmails(query));
    } catch (e) {
      setError(gmailErrorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      <button type="button" className="btn primary" onClick={search} disabled={loading || !!busy}>
        {loading ? 'Searching your Gmail…' : threads ? 'Search again' : searchLabel}
      </button>
      {error && <div className="notice error small" role="alert">{error}</div>}
      {busy && <div className="notice small" role="status">{busy}</div>}
      {threads && threads.length === 0 && (
        <p className="small muted">No matching emails found. You can paste the email text under “Booking email” instead.</p>
      )}
      {threads && threads.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {threads.map((t) => (
            <button key={t.threadId} type="button" className="flight-row" style={{ textAlign: 'left', cursor: 'pointer' }}
              disabled={!!busy} onClick={() => onPick(t)}>
              <span style={{ fontSize: '1.3rem' }}>✉️</span>
              <div className="r-main">
                <b className="small" style={{ display: 'block' }}>{t.subject}</b>
                <div className="r-sub">{[t.sender, shortDate(t.date)].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="pill brand">{pickLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
