// Curated airline names (current branding) and alliance membership. Names for
// other airlines come from the bundled OpenFlights dataset (see geo.ts).

export type Alliance = 'Star Alliance' | 'oneworld' | 'SkyTeam';

const STAR = 'Star Alliance' as const;
const ONE = 'oneworld' as const;
const SKY = 'SkyTeam' as const;

export const AIRLINES: Record<string, { name: string; alliance?: Alliance; color?: string }> = {
  // Star Alliance
  A3: { name: 'Aegean Airlines', alliance: STAR, color: '#0d3d84' },
  AC: { name: 'Air Canada', alliance: STAR, color: '#d22630' },
  CA: { name: 'Air China', alliance: STAR, color: '#c8102e' },
  AI: { name: 'Air India', alliance: STAR, color: '#d71921' },
  NZ: { name: 'Air New Zealand', alliance: STAR, color: '#111111' },
  NH: { name: 'ANA', alliance: STAR, color: '#13448f' },
  OZ: { name: 'Asiana Airlines', alliance: STAR, color: '#a5a8aa' },
  OS: { name: 'Austrian Airlines', alliance: STAR, color: '#e2001a' },
  AV: { name: 'Avianca', alliance: STAR, color: '#e31b23' },
  SN: { name: 'Brussels Airlines', alliance: STAR, color: '#0b2a5b' },
  CM: { name: 'Copa Airlines', alliance: STAR, color: '#003e7e' },
  OU: { name: 'Croatia Airlines', alliance: STAR, color: '#003a80' },
  MS: { name: 'EgyptAir', alliance: STAR, color: '#003a70' },
  ET: { name: 'Ethiopian Airlines', alliance: STAR, color: '#1b7e3b' },
  BR: { name: 'EVA Air', alliance: STAR, color: '#00704a' },
  LO: { name: 'LOT Polish Airlines', alliance: STAR, color: '#11397e' },
  LH: { name: 'Lufthansa', alliance: STAR, color: '#05164d' },
  ZH: { name: 'Shenzhen Airlines', alliance: STAR, color: '#c8102e' },
  SQ: { name: 'Singapore Airlines', alliance: STAR, color: '#1d1f5f' },
  SA: { name: 'South African Airways', alliance: STAR, color: '#0b3b7c' },
  LX: { name: 'SWISS', alliance: STAR, color: '#e2001a' },
  TP: { name: 'TAP Air Portugal', alliance: STAR, color: '#00a04a' },
  TG: { name: 'Thai Airways', alliance: STAR, color: '#5c2d91' },
  TK: { name: 'Turkish Airlines', alliance: STAR, color: '#c70a0c' },
  UA: { name: 'United Airlines', alliance: STAR, color: '#002244' },
  // oneworld
  AS: { name: 'Alaska Airlines', alliance: ONE, color: '#01426a' },
  AA: { name: 'American Airlines', alliance: ONE, color: '#0078d2' },
  BA: { name: 'British Airways', alliance: ONE, color: '#075aaa' },
  CX: { name: 'Cathay Pacific', alliance: ONE, color: '#006564' },
  AY: { name: 'Finnair', alliance: ONE, color: '#0b1560' },
  FJ: { name: 'Fiji Airways', alliance: ONE, color: '#1c3f6e' },
  IB: { name: 'Iberia', alliance: ONE, color: '#d7192d' },
  JL: { name: 'Japan Airlines', alliance: ONE, color: '#cc0000' },
  MH: { name: 'Malaysia Airlines', alliance: ONE, color: '#00205b' },
  WY: { name: 'Oman Air', alliance: ONE, color: '#9a7a3b' },
  QF: { name: 'Qantas', alliance: ONE, color: '#e40000' },
  QR: { name: 'Qatar Airways', alliance: ONE, color: '#5c0632' },
  AT: { name: 'Royal Air Maroc', alliance: ONE, color: '#c8102e' },
  RJ: { name: 'Royal Jordanian', alliance: ONE, color: '#1c1c1c' },
  UL: { name: 'SriLankan Airlines', alliance: ONE, color: '#1f2a6b' },
  // SkyTeam
  AR: { name: 'Aerolíneas Argentinas', alliance: SKY, color: '#0a3d79' },
  AM: { name: 'Aeroméxico', alliance: SKY, color: '#0b2343' },
  UX: { name: 'Air Europa', alliance: SKY, color: '#002f6c' },
  AF: { name: 'Air France', alliance: SKY, color: '#002157' },
  CI: { name: 'China Airlines', alliance: SKY, color: '#b9975b' },
  MU: { name: 'China Eastern', alliance: SKY, color: '#1a2d6d' },
  DL: { name: 'Delta Air Lines', alliance: SKY, color: '#003366' },
  GA: { name: 'Garuda Indonesia', alliance: SKY, color: '#00a0af' },
  KQ: { name: 'Kenya Airways', alliance: SKY, color: '#c8102e' },
  KL: { name: 'KLM', alliance: SKY, color: '#00a1de' },
  KE: { name: 'Korean Air', alliance: SKY, color: '#00256c' },
  ME: { name: 'Middle East Airlines', alliance: SKY, color: '#00843d' },
  SV: { name: 'Saudia', alliance: SKY, color: '#006c35' },
  SK: { name: 'SAS', alliance: SKY, color: '#000f9f' },
  RO: { name: 'TAROM', alliance: SKY, color: '#002a5c' },
  VN: { name: 'Vietnam Airlines', alliance: SKY, color: '#00718f' },
  VS: { name: 'Virgin Atlantic', alliance: SKY, color: '#da0530' },
  MF: { name: 'XiamenAir', alliance: SKY, color: '#0055a5' },
  // Not in an alliance
  EK: { name: 'Emirates', color: '#d71921' },
  EY: { name: 'Etihad Airways', color: '#bd8b13' },
  AZ: { name: 'ITA Airways', color: '#1c3f94' },
  OA: { name: 'Olympic Air', color: '#0d3d84' },
  GQ: { name: 'SKY express', color: '#00a3e0' },
  FR: { name: 'Ryanair', color: '#073590' },
  U2: { name: 'easyJet', color: '#ff6600' },
  W6: { name: 'Wizz Air', color: '#c6007e' },
  VY: { name: 'Vueling', color: '#ffcc00' },
  EW: { name: 'Eurowings', color: '#a3195b' },
  DY: { name: 'Norwegian', color: '#d81939' },
  HV: { name: 'Transavia', color: '#00d66c' },
  PC: { name: 'Pegasus Airlines', color: '#fdc300' },
  XQ: { name: 'SunExpress', color: '#ffb300' },
  LS: { name: 'Jet2', color: '#e3001b' },
  BT: { name: 'airBaltic', color: '#94c11f' },
  FZ: { name: 'flydubai', color: '#0c2e5c' },
  G9: { name: 'Air Arabia', color: '#e2001a' },
  B6: { name: 'JetBlue', color: '#003876' },
  WN: { name: 'Southwest Airlines', color: '#304cb2' },
  LA: { name: 'LATAM Airlines', color: '#1b0088' },
  VA: { name: 'Virgin Australia', color: '#e10a0a' },
  WS: { name: 'WestJet', color: '#00aaa5' },
  '6E': { name: 'IndiGo', color: '#001b94' },
  TR: { name: 'Scoot', color: '#ffd200' },
  AK: { name: 'AirAsia', color: '#ff0000' },
  JQ: { name: 'Jetstar', color: '#ff5115' },
  CY: { name: 'Cyprus Airways', color: '#0057a0' },
};

// Airlines whose flights earn in another airline's programme.
export const PARTNERS: Record<string, string[]> = {
  OA: ['A3'], FZ: ['EK'], EW: ['LH'], '4Y': ['LH'], EN: ['LH'], CL: ['LH'], WK: ['LX'],
  HV: ['AF', 'KL'], A5: ['AF'], VY: ['IB', 'BA'], EI: ['BA', 'IB'], LA: ['DL'],
};

export function allianceOf(code: string): Alliance | undefined {
  return AIRLINES[code]?.alliance;
}

export function airlineColor(code: string): string {
  return AIRLINES[code]?.color || '#24324d';
}

export function logoUrls(code: string, shape: 'square' | 'wide' = 'square'): string[] {
  const c = encodeURIComponent(code.toUpperCase());
  return shape === 'wide'
    ? [`https://pics.avs.io/400/160/${c}.png`, `https://www.gstatic.com/flights/airline_logos/70px/${c}.png`]
    : [`https://pics.avs.io/al_square/160/160/${c}.png`, `https://www.gstatic.com/flights/airline_logos/70px/${c}.png`, `https://images.kiwi.com/airlines/64/${c}.png`];
}
