// Downloads square airline logos once and stores them in
// web/public/data/logos.json, so the claude.ai page (which cannot load images
// from other websites) can show them. Run: npm run build:logos
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('web/public/data/logos.json');
const SIZE = 96;

// Airlines of every loyalty programme, plus the airlines travellers meet most.
const loyalty = await fs.readFile('web/src/lib/loyalty.ts', 'utf8');
const fromPrograms = [...loyalty.matchAll(/airlines: \[([^\]]*)\]/g)].flatMap((m) => m[1].match(/[A-Z0-9]{2}/g) || []);
const common = `A3 OA LH LX OS SN LO EW TK AV UA AF KL BA IB AY SK EI TP AZ VY FR U2 W6 DY EK QR EY SV MS RJ ME LY
  AC AA DL B6 AS WN NH JL KE OZ CX SQ TG MH GA PR CI BR CA MU CZ QF NZ VS UX A9 FZ G9 PC XQ HV TO V7 EN BT A2
  JU OU RO FB SU PS WF KM LG 4U DE X3 TB 6E AI UK ET KQ SA AT WY GF KU`.split(/\s+/);
const codes = [...new Set([...fromPrograms, ...common])].filter(Boolean).sort();

const prev = await fs.readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({}));
const logos = {};
for (const code of codes) {
  if (prev[code]) { logos[code] = prev[code]; continue; }
  const res = await fetch(`https://pics.avs.io/al_square/${SIZE}/${SIZE}/${code}.png`);
  const type = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  // The service answers unknown airlines with a tiny placeholder.
  if (!res.ok || !type.startsWith('image/') || buf.length < 500) { console.warn(`no logo for ${code}`); continue; }
  logos[code] = `data:${type};base64,${buf.toString('base64')}`;
}
await fs.writeFile(OUT, JSON.stringify(logos));
const kb = Math.round(JSON.stringify(logos).length / 1024);
console.log(`logos: ${Object.keys(logos).length} of ${codes.length} airlines, ${kb} KB`);
