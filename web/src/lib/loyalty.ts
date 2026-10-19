import { allianceOf, PARTNERS, type Alliance } from './airlines.ts';
import type { Membership } from './types.ts';

export type ProgramKind = 'airline' | 'hotel' | 'car' | 'lounge' | 'rail' | 'border' | 'other';

export interface Program {
  id: string;
  name: string;
  brand: string;
  kind: ProgramKind;
  color: string;
  ink?: string; // text colour on the card (default white)
  airlines?: string[]; // IATA codes whose own programme this is
  alliance?: Alliance;
  domain?: string;
  tiers?: string[];
}

const A = 'airline' as const;
const H = 'hotel' as const;

export const PROGRAMS: Program[] = [
  { id: 'milesbonus', name: 'Miles+Bonus', brand: 'Aegean', kind: A, color: '#0d3d84', airlines: ['A3', 'OA'], alliance: 'Star Alliance', domain: 'aegeanair.com', tiers: ['Red', 'Blue', 'Silver', 'Gold', 'Diamond'] },
  { id: 'milesandmore', name: 'Miles & More', brand: 'Lufthansa Group', kind: A, color: '#05164d', airlines: ['LH', 'LX', 'OS', 'SN', 'LO', 'EW'], alliance: 'Star Alliance', domain: 'miles-and-more.com', tiers: ['Member', 'Frequent Traveller', 'Senator', 'HON Circle'] },
  { id: 'flyingblue', name: 'Flying Blue', brand: 'Air France–KLM', kind: A, color: '#0b1560', airlines: ['AF', 'KL', 'HV'], alliance: 'SkyTeam', domain: 'flyingblue.com', tiers: ['Explorer', 'Silver', 'Gold', 'Platinum', 'Ultimate'] },
  { id: 'baclub', name: 'The British Airways Club', brand: 'British Airways', kind: A, color: '#075aaa', airlines: ['BA'], alliance: 'oneworld', domain: 'britishairways.com', tiers: ['Blue', 'Bronze', 'Silver', 'Gold'] },
  { id: 'iberiaclub', name: 'Iberia Club', brand: 'Iberia', kind: A, color: '#d7192d', airlines: ['IB'], alliance: 'oneworld', domain: 'iberia.com', tiers: ['Clásica', 'Plata', 'Oro', 'Platino'] },
  { id: 'aadvantage', name: 'AAdvantage', brand: 'American Airlines', kind: A, color: '#0078d2', airlines: ['AA'], alliance: 'oneworld', domain: 'aa.com', tiers: ['Member', 'Gold', 'Platinum', 'Platinum Pro', 'Executive Platinum'] },
  { id: 'skymiles', name: 'SkyMiles', brand: 'Delta', kind: A, color: '#003366', airlines: ['DL'], alliance: 'SkyTeam', domain: 'delta.com', tiers: ['Member', 'Silver', 'Gold', 'Platinum', 'Diamond'] },
  { id: 'mileageplus', name: 'MileagePlus', brand: 'United', kind: A, color: '#002244', airlines: ['UA'], alliance: 'Star Alliance', domain: 'united.com', tiers: ['Member', 'Silver', 'Gold', 'Platinum', '1K'] },
  { id: 'skywards', name: 'Emirates Skywards', brand: 'Emirates', kind: A, color: '#b5121b', airlines: ['EK', 'FZ'], domain: 'emirates.com', tiers: ['Blue', 'Silver', 'Gold', 'Platinum'] },
  { id: 'privilegeclub', name: 'Privilege Club', brand: 'Qatar Airways', kind: A, color: '#5c0632', airlines: ['QR'], alliance: 'oneworld', domain: 'qatarairways.com', tiers: ['Burgundy', 'Silver', 'Gold', 'Platinum'] },
  { id: 'milessmiles', name: 'Miles&Smiles', brand: 'Turkish Airlines', kind: A, color: '#c70a0c', airlines: ['TK'], alliance: 'Star Alliance', domain: 'turkishairlines.com', tiers: ['Classic', 'Classic Plus', 'Elite', 'Elite Plus'] },
  { id: 'etihadguest', name: 'Etihad Guest', brand: 'Etihad', kind: A, color: '#8a6a1f', airlines: ['EY'], domain: 'etihad.com', tiers: ['Bronze', 'Silver', 'Gold', 'Platinum'] },
  { id: 'krisflyer', name: 'KrisFlyer', brand: 'Singapore Airlines', kind: A, color: '#1d1f5f', airlines: ['SQ'], alliance: 'Star Alliance', domain: 'singaporeair.com', tiers: ['KrisFlyer', 'Elite Silver', 'Elite Gold', 'PPS Club'] },
  { id: 'aeroplan', name: 'Aeroplan', brand: 'Air Canada', kind: A, color: '#d22630', airlines: ['AC'], alliance: 'Star Alliance', domain: 'aircanada.com' },
  { id: 'milesgo', name: 'TAP Miles&Go', brand: 'TAP Air Portugal', kind: A, color: '#00a04a', airlines: ['TP'], alliance: 'Star Alliance', domain: 'flytap.com' },
  { id: 'eurobonus', name: 'EuroBonus', brand: 'SAS', kind: A, color: '#000f9f', airlines: ['SK'], alliance: 'SkyTeam', domain: 'flysas.com' },
  { id: 'asiamiles', name: 'Asia Miles', brand: 'Cathay', kind: A, color: '#006564', airlines: ['CX'], alliance: 'oneworld', domain: 'asiamiles.com' },
  { id: 'flyingclub', name: 'Flying Club', brand: 'Virgin Atlantic', kind: A, color: '#da0530', airlines: ['VS'], alliance: 'SkyTeam', domain: 'virginatlantic.com' },
  { id: 'finnairplus', name: 'Finnair Plus', brand: 'Finnair', kind: A, color: '#0b1560', airlines: ['AY'], alliance: 'oneworld', domain: 'finnair.com' },
  { id: 'volare', name: 'Volare', brand: 'ITA Airways', kind: A, color: '#1c3f94', airlines: ['AZ'], domain: 'ita-airways.com' },
  { id: 'qantasff', name: 'Qantas Frequent Flyer', brand: 'Qantas', kind: A, color: '#e40000', airlines: ['QF'], alliance: 'oneworld', domain: 'qantas.com' },
  { id: 'atmos', name: 'Atmos Rewards', brand: 'Alaska & Hawaiian', kind: A, color: '#01426a', airlines: ['AS', 'HA'], alliance: 'oneworld', domain: 'alaskaair.com' },
  { id: 'skypass', name: 'SKYPASS', brand: 'Korean Air', kind: A, color: '#00256c', airlines: ['KE'], alliance: 'SkyTeam', domain: 'koreanair.com' },
  { id: 'lifemiles', name: 'LifeMiles', brand: 'Avianca', kind: A, color: '#e31b23', airlines: ['AV'], alliance: 'Star Alliance', domain: 'lifemiles.com' },
  { id: 'anamileage', name: 'ANA Mileage Club', brand: 'ANA', kind: A, color: '#13448f', airlines: ['NH'], alliance: 'Star Alliance', domain: 'ana.co.jp' },
  { id: 'jalmileage', name: 'JAL Mileage Bank', brand: 'Japan Airlines', kind: A, color: '#cc0000', airlines: ['JL'], alliance: 'oneworld', domain: 'jal.co.jp' },
  { id: 'alfursan', name: 'Alfursan', brand: 'Saudia', kind: A, color: '#006c35', airlines: ['SV'], alliance: 'SkyTeam', domain: 'saudia.com' },
  { id: 'maharaja', name: 'Maharaja Club', brand: 'Air India', kind: A, color: '#b31e23', airlines: ['AI'], alliance: 'Star Alliance', domain: 'airindia.com' },
  { id: 'trueblue', name: 'TrueBlue', brand: 'JetBlue', kind: A, color: '#003876', airlines: ['B6'], domain: 'jetblue.com' },
  { id: 'rapidrewards', name: 'Rapid Rewards', brand: 'Southwest', kind: A, color: '#304cb2', airlines: ['WN'], domain: 'southwest.com' },
  { id: 'aerclub', name: 'AerClub', brand: 'Aer Lingus', kind: A, color: '#006272', airlines: ['EI'], domain: 'aerlingus.com' },
  { id: 'wizzclub', name: 'WIZZ Discount Club', brand: 'Wizz Air', kind: A, color: '#c6007e', airlines: ['W6'], domain: 'wizzair.com' },
  { id: 'easyjetplus', name: 'easyJet Plus', brand: 'easyJet', kind: A, color: '#ff6600', airlines: ['U2'], domain: 'easyjet.com' },
  { id: 'bonvoy', name: 'Marriott Bonvoy', brand: 'Marriott', kind: H, color: '#1c1c1c', domain: 'marriott.com', tiers: ['Member', 'Silver Elite', 'Gold Elite', 'Platinum Elite', 'Titanium Elite', 'Ambassador Elite'] },
  { id: 'hiltonhonors', name: 'Hilton Honors', brand: 'Hilton', kind: H, color: '#104c97', domain: 'hilton.com', tiers: ['Member', 'Silver', 'Gold', 'Diamond'] },
  { id: 'ihgone', name: 'IHG One Rewards', brand: 'IHG', kind: H, color: '#e36f1e', domain: 'ihg.com', tiers: ['Club', 'Silver Elite', 'Gold Elite', 'Platinum Elite', 'Diamond Elite'] },
  { id: 'hyatt', name: 'World of Hyatt', brand: 'Hyatt', kind: H, color: '#0b3b5c', domain: 'hyatt.com', tiers: ['Member', 'Discoverist', 'Explorist', 'Globalist'] },
  { id: 'accor', name: 'ALL – Accor Live Limitless', brand: 'Accor', kind: H, color: '#1e1852', domain: 'all.accor.com', tiers: ['Classic', 'Silver', 'Gold', 'Platinum', 'Diamond'] },
  { id: 'radisson', name: 'Radisson Rewards', brand: 'Radisson', kind: H, color: '#111111', domain: 'radissonhotels.com' },
  { id: 'wyndham', name: 'Wyndham Rewards', brand: 'Wyndham', kind: H, color: '#0c2340', domain: 'wyndhamhotels.com' },
  { id: 'bestwestern', name: 'Best Western Rewards', brand: 'Best Western', kind: H, color: '#003c7e', domain: 'bestwestern.com' },
  { id: 'onekey', name: 'One Key', brand: 'Expedia · Hotels.com', kind: H, color: '#1e243a', domain: 'hotels.com' },
  { id: 'genius', name: 'Genius', brand: 'Booking.com', kind: H, color: '#003580', domain: 'booking.com' },
  { id: 'hertz', name: 'Gold Plus Rewards', brand: 'Hertz', kind: 'car', color: '#ffd100', ink: '#111111', domain: 'hertz.com' },
  { id: 'avis', name: 'Avis Preferred', brand: 'Avis', kind: 'car', color: '#d4002a', domain: 'avis.com' },
  { id: 'sixt', name: 'Sixt Card', brand: 'Sixt', kind: 'car', color: '#ff5f00', domain: 'sixt.com' },
  { id: 'europcar', name: 'Privilege', brand: 'Europcar', kind: 'car', color: '#009639', domain: 'europcar.com' },
  { id: 'enterprise', name: 'Enterprise Plus', brand: 'Enterprise', kind: 'car', color: '#169a5a', domain: 'enterprise.com' },
  { id: 'emerald', name: 'Emerald Club', brand: 'National', kind: 'car', color: '#006341', domain: 'nationalcar.com' },
  { id: 'prioritypass', name: 'Priority Pass', brand: 'Collinson', kind: 'lounge', color: '#2b2622', domain: 'prioritypass.com' },
  { id: 'loungekey', name: 'LoungeKey', brand: 'Collinson', kind: 'lounge', color: '#232f3e', domain: 'loungekey.com' },
  { id: 'dragonpass', name: 'DragonPass', brand: 'DragonPass', kind: 'lounge', color: '#b3121b', domain: 'dragonpass.com' },
  { id: 'globalentry', name: 'Global Entry / Known Traveler', brand: 'U.S. CBP', kind: 'border', color: '#1e3a5f', domain: 'cbp.gov' },
  { id: 'clear', name: 'CLEAR', brand: 'CLEAR', kind: 'border', color: '#0a2342', domain: 'clearme.com' },
  { id: 'eurostar', name: 'Club Eurostar', brand: 'Eurostar', kind: 'rail', color: '#1b1464', domain: 'eurostar.com' },
  { id: 'bahnbonus', name: 'BahnBonus', brand: 'Deutsche Bahn', kind: 'rail', color: '#ec0016', domain: 'bahn.de' },
  { id: 'cartafreccia', name: 'CartaFRECCIA', brand: 'Trenitalia', kind: 'rail', color: '#8a0d24', domain: 'trenitalia.com' },
];

export const PROGRAM_BY_ID = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

export const KIND_LABEL: Record<ProgramKind, string> = {
  airline: 'Airlines', hotel: 'Hotels', car: 'Car rental', lounge: 'Lounges', rail: 'Rail', border: 'Border & security', other: 'Other',
};

export function programOf(m: Membership): Program {
  return PROGRAM_BY_ID[m.programId] || {
    id: 'custom', name: m.customName || 'Membership', brand: '', kind: 'other', color: m.customColor || '#334155',
  };
}

/**
 * Which of the traveller's memberships a flight on `airline` should be
 * credited to: the airline's own programme first, then a partner's, then
 * any programme in the same alliance (best tier first within each group).
 */
export function membershipsForAirline(airline: string, memberships: Membership[]) {
  const alliance = allianceOf(airline);
  const partners = PARTNERS[airline] || [];
  const ranked: { membership: Membership; program: Program; reason: string }[] = [];
  for (const membership of memberships) {
    const program = programOf(membership);
    if (program.kind !== 'airline') continue;
    if (program.airlines?.includes(airline)) ranked.push({ membership, program, reason: 'Own programme' });
    else if (program.airlines?.some((a) => partners.includes(a))) ranked.push({ membership, program, reason: 'Partner airline' });
    else if (alliance && program.alliance === alliance) ranked.push({ membership, program, reason: alliance });
  }
  const order = ['Own programme', 'Partner airline'];
  const rank = (r: string) => (order.indexOf(r) + 1 || 3);
  return ranked.sort((a, b) => rank(a.reason) - rank(b.reason) || tierRank(b) - tierRank(a));
}

function tierRank({ membership, program }: { membership: Membership; program: Program }) {
  return membership.tier && program.tiers ? program.tiers.indexOf(membership.tier) : -1;
}

/** Summary of elite statuses passed to the briefing so lounge access matches. */
export function statusSummary(memberships: Membership[]): string {
  return memberships
    .map((m) => ({ m, p: programOf(m) }))
    .filter(({ m, p }) => (p.kind === 'airline' && m.tier) || p.kind === 'lounge')
    .map(({ m, p }) => [p.name, m.tier, p.alliance && `(${p.alliance})`].filter(Boolean).join(' '))
    .join('; ');
}
