#!/usr/bin/env node
// check-hover: force :hover on every button-like link on every built page (real Chromium via CDP)
// and fail if text contrast < 4.5:1 or the button's fill vanishes into what it sits on.
// Usage: node tools/check-hover.mjs <slug> [distDir]   (default out/<slug>/dist, served under /<slug>/; demo builds only)
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const slug = process.argv[2];
if (!slug) { console.error('usage: check-hover.mjs <slug>'); process.exit(2); }
const root = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(import.meta.dirname, '..', '..', '..', 'out', slug, 'dist');
const SEL = 'a.pbtn, a.pbtn-outline, a.pbtn-light, button.pbtn, button.pbtn-outline, button.pbtn-light, a[class*="btn"], button[class*="btn"]';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/' + slug + '/')) { res.writeHead(404).end(); return; }
  let f = path.join(root, p.slice(slug.length + 1));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = process.env.HOVER_BASE || `http://127.0.0.1:${server.address().port}/${slug}/`; // HOVER_BASE=https://try.webbeo.ai/<slug>/ tests the live deploy

const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'chk-hover-'));
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} server.close(); fs.rmSync(prof, { recursive: true, force: true }); };
process.on('exit', cleanup);

let tgt;
for (let i = 0; i < 50 && !tgt; i++) {
  try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!tgt) await new Promise((r) => setTimeout(r, 200));
}
if (!tgt) { console.error('check-hover: chromium did not start'); process.exit(2); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const waiters = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) waiters.forEach((w) => w(d)); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const loaded = () => new Promise((r) => { const w = (d) => { if (d.method === 'Page.loadEventFired') { waiters.splice(waiters.indexOf(w), 1); r(); } }; waiters.push(w); });
await send('Page.enable'); await send('DOM.enable'); await send('CSS.enable'); await send('Runtime.enable');

// colour maths
const parse = (s) => {
  let m = s.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, g, b, a = 1] = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [r, g, b, a]; }
  m = s.match(/color\(srgb ([^)]+)\)/);
  if (m) { const [r, g, b, a = 1] = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return [r * 255, g * 255, b * 255, a]; }
  m = s.match(/oklab\(([^)]+)\)/);
  if (m) {
    const [L, A, B, a = 1] = m[1].split(/[\s\/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : Number(v)));
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, ss = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss];
    const g = lin.map((v) => { v = Math.min(1, Math.max(0, v)); return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255; });
    return [...g, a];
  }
  return null;
};
const over = (f, b) => { const a = f[3]; return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)).concat(1); };
const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

const pages = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'index.html') pages.push(path.relative(root, path.dirname(f))); } };
walk(root);

const fails = []; let checked = 0;
for (const pg of pages.sort()) {
  const url = base + (pg ? pg + '/' : '');
  const l = loaded(); await send('Page.navigate', { url }); await l;
  await send('Runtime.evaluate', { expression: `(()=>{const s=document.createElement('style');s.textContent='*{transition:none!important;animation:none!important;opacity:1!important}';document.head.append(s);})()` });
  const doc = await send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: SEL });
  for (const nodeId of nodeIds) {
    const { object } = await send('DOM.resolveNode', { nodeId });
    const info = (await send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: `function(){const bgOf=(e)=>{for(;e;e=e.parentElement){const c=getComputedStyle(e).backgroundColor;if(c&&!/rgba\\(0, 0, 0, 0\\)|transparent/.test(c))return c}return 'rgb(255,255,255)'};return {label:(this.textContent||'').trim().slice(0,30),cls:this.className,under:bgOf(this.parentElement)}}` })).result.value;
    const under = parse(info.under) || [255, 255, 255, 1];
    for (const state of ['rest', 'hover']) {
      await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state === 'hover' ? ['hover'] : [] });
      const cs = Object.fromEntries((await send('CSS.getComputedStyleForNode', { nodeId })).computedStyle.map((p) => [p.name, p.value]));
      const bg = parse(cs['background-color']) || [0, 0, 0, 0];
      const fill = bg[3] > 0.02;
      const surface = fill ? over(bg, under) : under;
      const text = over(parse(cs.color) || [0, 0, 0, 1], surface);
      const tr = ratio(text, surface);
      const bw = parseFloat(cs['border-top-width'] || '0');
      const border = bw > 0 ? over(parse(cs['border-top-color']) || [0, 0, 0, 0], under) : null;
      const edge = Math.max(fill ? ratio(surface, under) : 0, border ? ratio(border, under) : 0);
      checked++;
      const tag = `${pg || '/'} "${info.label}" [${info.cls.split(' ').filter((c) => /btn/.test(c)).join('.')}] ${state}`;
      if (tr < 4.5) fails.push(`${tag}: text contrast ${tr.toFixed(2)}:1 (<4.5)`);
      if (edge < 1.3 && (fill || border)) fails.push(`${tag}: button edge vanishes into background (${edge.toFixed(2)}:1)`);
      if (state === 'hover' && !fill && !border) fails.push(`${tag}: hover leaves no visible button shape`);
    }
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  }
}
console.log(`check-hover: ${pages.length} pages, ${checked} button states tested (rest + forced :hover)`);
if (fails.length) { fails.forEach((f) => console.log('FAIL ' + f)); console.log(`RESULT: FAIL - ${fails.length} problem(s)`); process.exit(1); }
console.log('RESULT: PASS'); process.exit(0);
