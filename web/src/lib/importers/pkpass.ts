// Apple Wallet boarding passes (.pkpass) are zip files with a pass.json that
// holds the IATA barcode plus human-readable fields. Airlines offer them as
// "Add to Apple Wallet" downloads; on iPhone, share the pass to save the file.
import { unzipSync, strFromU8 } from 'fflate';
import { parseBCBP } from '../../../../server/bcbp.js';
import { parseFlightCode } from '../flights.ts';
import { resolveAirport } from '../geo.ts';
import type { FlightDraft } from '../types.ts';

interface PassField { key?: string; label?: string; value?: unknown }
interface PassJson {
  barcode?: { message?: string };
  barcodes?: { message?: string }[];
  relevantDate?: string;
  boardingPass?: Record<string, PassField[] | string | undefined>;
  organizationName?: string;
}

export function draftsFromBarcode(message: string): FlightDraft[] {
  const pass = parseBCBP(message);
  return pass.legs.map((leg) => ({
    airline: leg.airline,
    flightNumber: leg.flightNumber,
    date: leg.date!,
    from: leg.from,
    to: leg.to,
    seat: leg.seat || undefined,
    cabin: leg.cabin as FlightDraft['cabin'],
    pnr: leg.pnr || undefined,
    source: 'boarding-pass' as const,
  }));
}

export function parsePassJson(json: PassJson): FlightDraft[] {
  const message = json.barcodes?.find((b) => b.message?.startsWith('M'))?.message || json.barcode?.message;
  if (message?.startsWith('M')) {
    try {
      return draftsFromBarcode(message).map((d) => ({ ...d, source: 'wallet-pass' as const }));
    } catch { /* fall through to the visible fields */ }
  }
  const fields: PassField[] = Object.values(json.boardingPass || {}).flatMap((v) => (Array.isArray(v) ? v : []));
  const find = (re: RegExp) => fields.find((f) => re.test(`${f.key} ${f.label}`))?.value;
  const from = resolveAirport(String(find(/origin|from|depart/i) ?? ''));
  const to = resolveAirport(String(find(/destination|to\b|arriv/i) ?? ''));
  const code = parseFlightCode(String(find(/flight/i) ?? ''));
  const date = json.relevantDate?.slice(0, 10);
  if (!from || !to || !code || !date) throw new Error('Could not find the flight details in this pass');
  return [{ ...code, date, from, to, seat: find(/seat/i) ? String(find(/seat/i)) : undefined, source: 'wallet-pass' }];
}

export async function parsePkpass(file: File): Promise<FlightDraft[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entry = files['pass.json'];
  if (!entry) throw new Error('This file is not an Apple Wallet pass');
  return parsePassJson(JSON.parse(strFromU8(entry)));
}
