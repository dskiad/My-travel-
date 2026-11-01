// One-line "what is this email" for the Gmail picker: the route and dates of a
// flight booking, or the hotel and stay dates, so the useful email is easy to spot.

export interface MailSummary {
  kind: 'flight' | 'hotel' | 'other';
  /** "Edinburgh → Amsterdam → Toulouse" or the hotel name. */
  title: string;
  /** "5 Nov 2026" or "12–15 Dec 2026"; may be empty. */
  dates: string;
  cancelled?: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const GREEK_MONTHS = ['ιαν', 'φεβ', 'μαρ', 'απρ', 'μα', 'ιουν', 'ιουλ', 'αυγ', 'σεπ', 'οκτ', 'νοε', 'δεκ'];
const cap = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).trim();
const short = (d: number, m: number, y?: number) => `${d} ${cap(MONTHS[m])}${y ? ` ${y}` : ''}`;

function monthIndex(word: string): number {
  const w = word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const i = MONTHS.findIndex((m) => w.startsWith(m));
  if (i >= 0) return i;
  if (w.startsWith('ιουν')) return 5;
  if (w.startsWith('ιουλ')) return 6;
  if (w.startsWith('μαι') || w.startsWith('μαΐ')) return 4;
  return GREEK_MONTHS.findIndex((m) => w.startsWith(m));
}

/** Dates mentioned in the text, in order, as [day, month, year?]. */
function findDates(text: string): [number, number, number | undefined][] {
  const out: [number, number, number | undefined][] = [];
  const re = /\b(\d{1,2})\s?([A-Za-zͰ-Ͽ]{3,12})\.?,?\s?(\d{4})?(?!\d)|\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\s(\d{1,2})(?:st|nd|rd|th)?,?\s?(\d{4})?\b|\b(\d{4})-(\d{2})-(\d{2})\b/gi;
  for (const m of text.matchAll(re)) {
    if (m[7]) { out.push([+m[9], +m[8] - 1, +m[7]]); continue; }
    const [d, mon, y] = m[1] ? [+m[1], m[2], m[3]] : [+m[5], m[4], m[6]];
    const mi = monthIndex(mon);
    if (mi >= 0 && d >= 1 && d <= 31) out.push([d, mi, y ? +y : undefined]);
  }
  // Airline style: 21JAN2027 or 05NOV
  for (const m of text.matchAll(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2,4})?\b/g)) {
    out.push([+m[1], MONTHS.indexOf(m[2].toLowerCase()), m[3] ? +(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined]);
  }
  return out;
}

function dateText(text: string, sentIso: string): string {
  const sent = new Date(sentIso);
  const sentYear = Number.isNaN(sent.getTime()) ? undefined : sent.getFullYear();
  const found = findDates(text).map(([d, m, y]) => {
    // A date without a year that falls before the email was sent is next year's.
    if (!y && sentYear) y = m < sent.getMonth() ? sentYear + 1 : sentYear;
    return [d, m, y] as const;
  });
  const uniq = [...new Map(found.map((f) => [f.join('-'), f])).values()];
  if (!uniq.length) return '';
  const [a, b] = [uniq[0], uniq[uniq.length - 1]];
  if (uniq.length === 1 || a.join() === b.join()) return short(a[0], a[1], a[2]);
  if (a[1] === b[1] && a[2] === b[2]) return `${a[0]}–${short(b[0], b[1], b[2])}`;
  return `${short(a[0], a[1], a[2] !== b[2] ? a[2] : undefined)} – ${short(b[0], b[1], b[2])}`;
}

/** Fast guess from the subject and, when read, the body (no Claude call). */
export function quickSummary(subject: string, body: string, sentIso: string): MailSummary | null {
  const s = subject.replace(/^((fwd?|fw|re|πρθ|σχετ)\s*:\s*)+/i, '').trim();
  const text = `${s}\n${body}`;
  const cancelled = /cancel|ακυρώθηκε|ακύρωση/i.test(s);

  // Agency itineraries (Sabre: Let's Tour etc.): "*Departure:* EDI EDINBURGH, UNITED KINGDOM"
  const legs = [...body.matchAll(/Departure:\*?\s+([A-Z]{3})\s+([^,\n]+)[\s\S]*?Arrival:\*?\s+([A-Z]{3})\s+([^,\n]+)/g)];
  if (legs.length) {
    const stops: string[] = [];
    for (const [, , from, , to] of legs) {
      if (stops[stops.length - 1] !== cap(from)) stops.push(cap(from));
      stops.push(cap(to));
    }
    const dates = [...body.matchAll(/\*\s*\w+day,\s*(\d{1,2}\s+\w+)\s*\*/g)].map((m) => m[1]).join(' ');
    return { kind: 'flight', title: stops.join(' → '), dates: dateText(dates || text, sentIso), cancelled };
  }
  // Aegean: "Παρασκευή 11.Δεκ 08:35 Αθήνα - 10:10 Μιλάνο" (one line per leg)
  const aegean = [...body.matchAll(/(\d{1,2})\.\s?(\p{L}{3,})\.?\s+\d{1,2}:\d{2}\s+(\p{L}[\p{L} .]*?)\s+-\s+\d{1,2}:\d{2}\s+(\p{L}[\p{L} .]*?)\s*(?:\||\n|$)/gu)];
  if (aegean.length) {
    const stops: string[] = [];
    for (const [, , , from, to] of aegean) {
      if (stops[stops.length - 1] !== from.trim()) stops.push(from.trim());
      stops.push(to.trim());
    }
    return { kind: 'flight', title: stops.join(' → '), dates: dateText(aegean.map((m) => `${m[1]} ${m[2]}`).join(' '), sentIso), cancelled };
  }
  // "SKIADOPOULOS/DIMITRIOS MR 21JAN2027 ATH AMS"
  const pnrLine = s.match(/\b\d{2}[A-Z]{3}\d{2,4}\s+([A-Z]{3})\s+([A-Z]{3})\b/);
  if (pnrLine) return { kind: 'flight', title: `${pnrLine[1]} → ${pnrLine[2]}`, dates: dateText(s, sentIso), cancelled };
  // "Από Turin προς Athens την 13 Δεκεμβρίου" / "from Athens to Toulouse on …"
  const fromTo = s.match(/(?:από|from)\s+(.+?)\s+(?:προς|to)\s+(.+?)(?=\s+(?:την|στις|on)(?:\s|$)|[|,(]|$)/iu);
  if (fromTo) return { kind: 'flight', title: `${cap(fromTo[1])} → ${cap(fromTo[2])}`, dates: dateText(s, sentIso), cancelled };
  // "Travel Reservation to TOULOUSE, FRANCE on November 05"
  const to = s.match(/(?:reservation|trip|flight|travel)\s+to\s+([^,]+?)(?:,|\s+on\b|$)/i);
  if (to) return { kind: 'flight', title: `→ ${cap(to[1])}`, dates: dateText(s, sentIso), cancelled };
  // "ATH-TLS" / "ATH – TLS"
  const pair = s.match(/\b([A-Z]{3})\s?[-–→>/]\s?([A-Z]{3})\b/);
  if (pair) return { kind: 'flight', title: `${pair[1]} → ${pair[2]}`, dates: dateText(text, sentIso), cancelled };
  // Hotels: "Η κράτηση στο Best Western Plus Hotel Bern επιβεβαιώθηκε", "Your stay at X", "booking at X"
  const hotel = s.match(/(?:κράτηση(?:σας)? στο|κράτησή σας στο|stay at|booking at|reservation at|booking for|αίτημά σας:)\s+(.+?)(?:\s+(?:επιβεβαιώθηκε|is confirmed|starts|has been|\()|[!|]|$)/i)
    || s.match(/^Your (.+?) booking is confirmed/i);
  if (hotel) return { kind: 'hotel', title: hotel[1].trim(), dates: body ? dateText(body.slice(0, 4000), sentIso) : '', cancelled };
  return null;
}

/** The parts of a long email that describe the trip, for a short Claude prompt. */
export function condense(subject: string, body: string, max = 1200): string {
  const keep = body.split('\n').map((l) => l.trim()).filter((l) => l &&
    /departure|arrival|depart|arrive|flight|πτήση|αναχώρηση|άφιξη|check-?in|check-?out|άφιξη|αναχώρηση|trip to|from|to\b|hotel|ξενοδοχ|night|διανυκτ|\b[A-Z]{3}\b|\d{1,2}\s?\w{3}/i.test(l));
  return `Subject: ${subject}\n${keep.join('\n')}`.slice(0, max);
}
