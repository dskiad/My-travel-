// Builds My Travel as one self-contained page for publishing on claude.ai:
// the app bundle, its styles and the airport/airline data are all inlined.
//   node scripts/build-artifact.mjs  ->  dist-artifact/my-travel.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync(process.env.NO_MINIFY ? 'npx vite build --minify false' : 'npx vite build', { stdio: 'inherit', env: { ...process.env, VITE_TARGET: 'artifact' } });

const out = 'dist-artifact';
const assets = fs.readdirSync(path.join(out, 'assets'));
const read = (ext) => assets.filter((f) => f.endsWith(ext)).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
const data = (name) => JSON.parse(fs.readFileSync(path.join('web/public/data', name), 'utf8'));

// Nothing inlined may close the <script>/<style> element early, and raw
// control characters (some libraries keep them in string literals) are
// written as escapes so every viewer accepts the page.
const safe = (s) => s
  .replace(/<\/(script|style)/gi, '<\\/$1')
  .replace(/<!--/g, '<\\!--')
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

// If the app can't start, say so on screen instead of leaving it blank.
const showErrors = `(function () {
  function show(msg, stack) {
    var r = document.getElementById('root');
    if (!r || r.getAttribute('data-crashed')) return;
    r.setAttribute('data-crashed', '1');
    var p = document.createElement('div');
    p.style.cssText = 'padding:24px;font:14px/1.5 system-ui;white-space:pre-wrap;word-break:break-word';
    p.textContent = 'My Travel could not start: ' + msg + (stack ? '\\n\\n' + String(stack).split('\\n').slice(0, 8).join('\\n') : '');
    r.replaceChildren(p);
  }
  window.addEventListener('error', function (e) {
    show(String(e.message || 'unknown error') + ' (' + (e.lineno || '?') + ':' + (e.colno || '?') + ')', e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    show('(async) ' + String(r.message || r), r.stack);
  });
})();`;

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
<script>${showErrors}</script>
<script>window.__MT_DATA__ = ${safe(JSON.stringify({
  airports: data('airports.json'), airlines: data('airlines.json'), icao: data('airport-icao.json'),
}))};</script>
<script>
${safe(read('.js'))}
</script>
`;

fs.writeFileSync(path.join(out, 'my-travel.html'), page);
console.log(`${out}/my-travel.html: ${(page.length / 1024).toFixed(0)} KB`);
