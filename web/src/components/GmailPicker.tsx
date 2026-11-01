import { useRef, useState } from 'react';
import { emailText, gmailErrorText, mailboxAddress, searchBookingEmails, BOOKING_QUERY, CONNECTORS_URL, TRUSTED_SENDERS, type MailThread } from '../lib/gmail.ts';
import { condense, quickSummary, type MailSummary } from '../lib/mailSummary.ts';
import { askClaudeJson } from '../lib/platform.ts';

function shortDate(raw: string) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const ICON: Record<MailSummary['kind'], string> = { flight: '✈️', hotel: '🏨', other: '✉️' };
const fromTrusted = (sender: string) => TRUSTED_SENDERS.some((d) => sender.toLowerCase().includes(`@${d}`) || sender.toLowerCase().includes(`.${d}`));

/** Read each email (a few at a time) and describe it: route and dates, or hotel and stay. */
async function describeAll(threads: MailThread[], update: (id: string, s: MailSummary) => void, alive: () => boolean) {
  const unclear: { id: string; date: string; text: string }[] = [];
  const queue = threads.slice(0, 40);
  const worker = async () => {
    for (let t = queue.shift(); t && alive(); t = queue.shift()) {
      try {
        const { text } = await emailText(t.threadId);
        const s = quickSummary(t.subject, text, t.date);
        if (s) update(t.threadId, s);
        if (!s || !s.dates || s.title.startsWith('→')) unclear.push({ id: t.threadId, date: t.date, text: condense(t.subject, text) });
      } catch { /* leave this one as is */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (!unclear.length || !alive()) return;
  try {
    const res = await askClaudeJson<{ emails?: { id: string; kind: MailSummary['kind']; title: string; dates: string; cancelled?: boolean }[] }>(
      'For each travel email below, say what it is about in a few words so the traveller can tell the emails apart. ' +
      'kind: "flight" for flight bookings, tickets, check-in or itineraries; "hotel" for accommodation; "other" for anything else. ' +
      'title: for flights the route as cities joined by " → " (e.g. "Athens → Toulouse", include connections, add " (return)" style legs as "Athens → Toulouse → Athens"); for hotels the hotel name and city; otherwise a 3–6 word topic. ' +
      'dates: travel or stay dates, short, like "5 Nov 2026" or "12–15 Dec 2026"; use the email date to pick the year; "" if none. cancelled: true if the booking was cancelled. ' +
      'Reply with only JSON: {"emails": [{"id": "", "kind": "flight", "title": "", "dates": "", "cancelled": false}]}\n\n' +
      unclear.map((u) => `<email id="${u.id}" sent="${u.date}">\n${u.text}\n</email>`).join('\n'),
    );
    for (const e of res.emails || []) if (e?.id && e.title) update(e.id, { kind: e.kind || 'other', title: e.title, dates: e.dates || '', cancelled: !!e.cancelled });
  } catch { /* the quick guesses stay */ }
}

/**
 * Searches the viewer's Gmail only when they tap the button (the first call
 * asks their permission), then lets them pick one email. With `describe`, each
 * email shows its route and dates (or hotel and stay) once it has been read.
 */
export function GmailPicker({ query = BOOKING_QUERY, searchLabel, pickLabel, onPick, busy, describe }: {
  query?: string;
  searchLabel: string;
  pickLabel: string;
  onPick: (t: MailThread) => void;
  busy?: string;
  describe?: boolean;
}) {
  const [threads, setThreads] = useState<MailThread[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mailbox, setMailbox] = useState('');
  const [summaries, setSummaries] = useState<Record<string, MailSummary>>({});
  const [reading, setReading] = useState(false);
  const run = useRef(0);

  const search = async () => {
    const id = ++run.current;
    setLoading(true); setError(''); setSummaries({});
    try {
      const found = await searchBookingEmails(query);
      // Emails from the traveller's own agency and airlines first.
      found.sort((a, b) => Number(fromTrusted(b.sender)) - Number(fromTrusted(a.sender)));
      setThreads(found);
      mailboxAddress().then(setMailbox);
      if (describe && found.length) {
        const first: Record<string, MailSummary> = {};
        for (const t of found) { const s = quickSummary(t.subject, '', t.date); if (s) first[t.threadId] = s; }
        setSummaries(first);
        setReading(true);
        describeAll(found, (tid, s) => setSummaries((prev) => ({ ...prev, [tid]: s })), () => run.current === id)
          .finally(() => run.current === id && setReading(false));
      }
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
      {mailbox && (
        <p className="tiny muted" role="status">
          Searching <b>{mailbox}</b>. Wrong inbox? In <a href={CONNECTORS_URL} target="_blank" rel="noreferrer">claude.ai → Connectors</a> disconnect Gmail and connect it again with the right Google account.
        </p>
      )}
      {error && <div className="notice error small" role="alert">{error}</div>}
      {busy && <div className="notice small" role="status">{busy}</div>}
      {reading && <p className="tiny muted" role="status">Reading the emails to show routes and dates…</p>}
      {threads && threads.length === 0 && (
        <p className="small muted">No matching emails found. You can paste the email text under “Booking email” instead.</p>
      )}
      {threads && threads.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {threads.map((t) => {
            const s = summaries[t.threadId];
            return (
              <button key={t.threadId} type="button" className="flight-row" style={{ textAlign: 'left', cursor: 'pointer', opacity: s?.cancelled ? 0.6 : 1 }}
                disabled={!!busy} onClick={() => onPick(t)}>
                <span style={{ fontSize: '1.3rem' }}>{s ? ICON[s.kind] : '✉️'}</span>
                <div className="r-main">
                  {s && (
                    <b style={{ display: 'block' }}>
                      {s.title}{s.dates && <span className="muted" style={{ fontWeight: 500 }}> · {s.dates}</span>}
                      {s.cancelled && <span className="pill" style={{ marginLeft: 6, color: 'var(--bad)' }}>Cancelled</span>}
                    </b>
                  )}
                  <span className={s ? 'tiny muted' : 'small'} style={{ display: 'block', fontWeight: s ? 400 : 700 }}>{t.subject}</span>
                  <div className="r-sub">{[t.sender, shortDate(t.date)].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="pill brand">{pickLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
