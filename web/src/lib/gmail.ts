// Gmail through the viewer's own claude.ai Gmail connector (claude.ai page
// only): find booking emails to import, and forward them to TripIt, which
// turns emails sent to plans@tripit.com from a registered address into trips.
import { IS_ARTIFACT, capability } from './platform.ts';
import type { Flight } from './types.ts';

export const TRIPIT_ADDRESS = 'plans@tripit.com';
const SERVER = 'Gmail';

interface McpError { code?: string; message?: string; retryable?: boolean }
interface Mcp {
  callTool(server: string, tool: string, input?: unknown): Promise<{ payload?: unknown }>;
}

export interface MailThread {
  threadId: string;
  messageId: string; // latest message in the thread
  subject: string;
  sender: string;
  date: string;
  snippet: string;
}

export async function gmailAvailable(): Promise<boolean> {
  return IS_ARTIFACT && Boolean(await capability<Mcp>('mcp'));
}

/** Viewer-facing text for each connector failure, so each has its own fix. */
export function gmailErrorText(e: unknown): string {
  const err = (e || {}) as McpError;
  switch (err.code) {
    case 'needs_reauth': return 'Your Gmail connection has expired. Reconnect Gmail in claude.ai Settings → Connectors, then try again.';
    case 'server_not_connected': return 'Gmail isn’t connected to your Claude account. Add it in claude.ai Settings → Connectors, then try again.';
    case 'selection_required': return 'You have more than one Gmail connected. Choose one when claude.ai asks, then try again.';
    case 'not_in_manifest': return 'Gmail is turned off for this page. Allow it from the page’s permissions to use this.';
    case 'approval_required': return 'This needs your approval. Tap the button again and choose Allow when claude.ai asks.';
    case 'blocked_by_policy': return 'Your organization doesn’t allow this page to use Gmail.';
    case 'server_unavailable': return 'Gmail didn’t answer just now. Try again in a minute.';
    case 'tool_error': return `Gmail reported a problem: ${err.message || 'unknown error'}`;
    default: return err.message ? `Gmail request failed: ${err.message}` : 'Gmail request failed. Try again in a minute.';
  }
}

async function call(tool: string, input: unknown): Promise<Record<string, unknown>> {
  const mcp = await capability<Mcp>('mcp');
  if (!mcp) throw { code: 'not_granted', message: 'Open this page on claude.ai to use Gmail.' };
  const res = await mcp.callTool(SERVER, tool, input);
  const payload = res?.payload;
  return (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
}

type RawMessage = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function toThread(t: Record<string, unknown>): MailThread | null {
  const msgs = (Array.isArray(t.messages) ? t.messages : []) as RawMessage[];
  const last = msgs[msgs.length - 1];
  if (!last) return null;
  return {
    threadId: str(t.id) || str(last.threadId),
    messageId: str(last.id),
    subject: str(last.subject) || '(no subject)',
    sender: str(last.sender).replace(/<.*>/, '').trim(),
    date: str(last.date),
    snippet: str(last.snippet),
  };
}

// Gmail's own travel category, or any email that talks about a flight booking
// (subject or body), including travel-agency itineraries.
export const BOOKING_QUERY =
  '(category:reservations OR ((flight OR flights OR airline OR airways OR "e-ticket" OR eticket OR itinerary OR "boarding pass" OR PNR OR "booking reference") ' +
  '(confirmation OR booking OR itinerary OR ticket OR reservation OR "check-in"))) -in:sent newer_than:2y';

export const LOYALTY_QUERY =
  '("Miles+Bonus" OR "Miles & More" OR "Flying Blue" OR "Executive Club" OR "British Airways Club" OR AAdvantage OR SkyMiles OR MileagePlus OR ' +
  'Skywards OR "Privilege Club" OR "Miles&Smiles" OR "Etihad Guest" OR KrisFlyer OR Aeroplan OR EuroBonus OR "Asia Miles" OR "Flying Club" OR ' +
  'Volare OR "frequent flyer" OR "membership number" OR "member number" OR "your miles" OR "miles statement" OR "tier status") -in:sent newer_than:3y';

/** Booking emails, newest first. `query` narrows it (e.g. a PNR). */
export async function searchBookingEmails(query = BOOKING_QUERY): Promise<MailThread[]> {
  const payload = await call('search_threads', { query, pageSize: 20, view: 'THREAD_VIEW_MINIMAL' });
  const threads = (Array.isArray(payload.threads) ? payload.threads : []) as Record<string, unknown>[];
  return threads.map(toThread).filter((t): t is MailThread => Boolean(t && t.messageId));
}

/** Emails most likely to be this flight's booking: by PNR, then flight number. */
export function queryForFlight(f: Pick<Flight, 'pnr' | 'airline' | 'flightNumber'>): string {
  const code = `${f.airline}${f.flightNumber}`;
  const terms = [f.pnr && `"${f.pnr}"`, `"${f.airline} ${f.flightNumber}"`, code].filter(Boolean).join(' OR ');
  return `(${terms}) -in:sent newer_than:2y`;
}

/** Plain text of the latest message in a thread, for reading the booking. */
export async function emailText(threadId: string): Promise<{ text: string; messageId: string }> {
  const payload = await call('get_thread', { threadId, messageFormat: 'PLAIN_TEXT' });
  const msgs = (Array.isArray(payload.messages) ? payload.messages : []) as RawMessage[];
  const last = msgs[msgs.length - 1] || {};
  const body = str(last.plaintextBody) || str(last.plaintext_body) || str(last.snippet);
  return { text: `Subject: ${str(last.subject)}\nFrom: ${str(last.sender)}\n\n${body}`, messageId: str(last.id) };
}

/** Forward the booking email to TripIt from the viewer's Gmail. */
export async function forwardToTripIt(messageId: string): Promise<void> {
  await call('forward', { messageId, to: [TRIPIT_ADDRESS] });
}
