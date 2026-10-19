export interface BcbpLeg {
  pnr: string;
  from: string;
  to: string;
  airline: string;
  flightNumber: string;
  flight: string;
  date: string | null;
  compartment: string;
  cabin: string;
  seat: string;
  sequence: string;
  passengerStatus: string;
}

export interface BoardingPass {
  passengerName: string;
  eTicket: boolean;
  legs: BcbpLeg[];
}

export function parseBCBP(raw: string, now?: Date): BoardingPass;
export function julianToDate(dayOfYear: string, now?: Date): string | null;
