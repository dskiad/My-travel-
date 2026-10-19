export type Cabin = 'Economy' | 'Premium Economy' | 'Business' | 'First' | '';

export interface Flight {
  id: string;
  airline: string; // IATA code, e.g. "A3"
  flightNumber: string; // digits, e.g. "600"
  date: string; // local departure date YYYY-MM-DD
  from: string; // IATA airport
  to: string; // IATA airport
  depLocal?: string; // "HH:MM" local at origin
  arrLocal?: string; // "HH:MM" local at destination
  depUtc?: string; // ISO timestamp when known
  arrUtc?: string;
  seat?: string;
  cabin?: Cabin;
  pnr?: string;
  aircraft?: string;
  notes?: string;
  trip?: string;
  source: FlightSource;
  createdAt: string;
  briefing?: Briefing;
  liveStatus?: LiveStatus | null;
}

export type FlightSource =
  | 'manual' | 'calendar' | 'boarding-pass' | 'wallet-pass' | 'document' | 'csv' | 'backup';

export interface FlightDraft extends Partial<Omit<Flight, 'id' | 'createdAt'>> {
  airline: string;
  flightNumber: string;
  date: string;
}

export interface Membership {
  id: string;
  programId: string; // catalog id, or "custom"
  customName?: string;
  customColor?: string;
  memberNumber: string;
  holderName?: string;
  tier?: string;
  expiry?: string;
  notes?: string;
  barcode: 'code128' | 'qr' | 'none';
  createdAt: string;
}

export interface Settings {
  name: string;
  passport: string;
  cabin: Cabin;
  homeAirport: string;
  calendarUrl: string;
}

export interface LiveSide {
  airport: { iata: string | null; name: string | null; city: string | null; timeZone: string | null };
  scheduledLocal: string | null;
  revisedLocal: string | null;
  scheduledUtc: string | null;
  revisedUtc: string | null;
  delayMinutes: number | null;
  terminal: string | null;
  gate: string | null;
  checkInDesk: string | null;
  baggageBelt: string | null;
}

export interface LiveStatus {
  number: string;
  status: string;
  airline: { name: string; iata: string } | null;
  aircraft: string | null;
  departure: LiveSide | null;
  arrival: LiveSide | null;
}

export interface Briefing {
  flight: {
    airlineName?: string; alliance?: string; status?: string; delayMinutes?: number | null;
    from?: { iata?: string; name?: string; city?: string; timeZone?: string };
    to?: { iata?: string; name?: string; city?: string; timeZone?: string };
    departureTerminal?: string; departureGate?: string; arrivalTerminal?: string;
    scheduledDepartureLocal?: string; estimatedDepartureLocal?: string; scheduledArrivalLocal?: string;
    notes?: string;
  };
  lounges: { name: string; operator?: string; terminal?: string; location?: string; nearGates?: string; walkFromGate?: string; hours?: string; access?: string; notes?: string }[];
  entryRequirements: { destinationCountry?: string; visaRequired?: string; summary?: string; requirements?: string[]; officialLink?: string };
  disruptions: { type?: string; severity?: string; title: string; details?: string; dates?: string }[];
  groundTransport: { mode?: string; name: string; where?: string; duration?: string; price?: string; frequency?: string; notes?: string; recommended?: boolean }[];
  tips: string[];
  sources: { title: string; url: string }[];
  generatedAt: string;
  /** Prepared without live web research (claude.ai page version). */
  offline?: boolean;
}
