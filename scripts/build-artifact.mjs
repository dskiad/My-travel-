// Builds My Travel as one self-contained page for publishing on claude.ai:
// the app bundle, its styles and the airport/airline data are all inlined.
//   node scripts/build-artifact.mjs  ->  dist-artifact/my-travel.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_TARGET: 'artifact' } });

const out = 'dist-artifact';
const assets = fs.readdirSync(path.join(out, 'assets'));
const read = (ext) => assets.filter((f) => f.endsWith(ext)).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
const data = (name) => JSON.parse(fs.readFileSync(path.join('web/public/data', name), 'utf8'));

// Nothing inlined may close the <script>/<style> element early.
const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const page = `<title>My Travel</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Your flights, travel diary and membership cards, with AI travel briefings.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap">
<style>
${safe(read('.css'))}
</style>
<div id="root"></div>
<script type="application/json" id="mt-data">${safe(JSON.stringify({
  airports: data('airports.json'), airlines: data('airlines.json'), icao: data('airport-icao.json'),
}))}</script>
<script type="module">
${safe(read('.js'))}
</script>
`;

fs.writeFileSync(path.join(out, 'my-travel.html'), page);
console.log(`${out}/my-travel.html: ${(page.length / 1024).toFixed(0)} KB`);
