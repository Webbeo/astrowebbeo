#!/usr/bin/env node
// shot: full-page PNG of a URL in real Chromium with motion frozen at its end state, so reveals and the
// hero entrance are fully visible and lazy images are loaded. For visual review, not for the build gate.
// Usage: node tools/shot.mjs <url> <out.png> [--w 1440] [--h 900]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const a = process.argv.slice(2);
const [url, out] = a.filter((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--'));
const opt = (k, d) => (a.includes(k) ? Number(a[a.indexOf(k) + 1]) : d);
const W = opt('--w', 1440), H = opt('--h', 900);
if (!url || !out) { console.error('usage: shot.mjs <url> <out.png> [--w 1440] [--h 900]'); process.exit(2); }

const port = 9800 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const done = (c) => { try { chrome.kill('SIGKILL'); } catch {} fs.rmSync(prof, { recursive: true, force: true }); process.exit(c); };
let tgt;
for (let i = 0; i < 50 && !tgt; i++) {
  try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!tgt) await new Promise((r) => setTimeout(r, 200));
}
if (!tgt) { console.error('shot: chromium did not start'); done(2); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const waiters = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) waiters.forEach((w) => w(d)); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
const loaded = new Promise((r) => { const w = (d) => { if (d.method === 'Page.loadEventFired') { waiters.splice(waiters.indexOf(w), 1); r(); } }; waiters.push(w); });
await send('Page.navigate', { url }); await loaded; await sleep(600);
await send('Runtime.evaluate', { expression: `(async()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{animation:none!important;transition:none!important}[class*="intersect:animate"],.hero-in>*,.hero-stats{opacity:1!important;transform:none!important}';document.head.append(s);document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager'});for(let y=0;y<document.documentElement.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0);await new Promise(r=>setTimeout(r,900));return 1})()`, awaitPromise: true });
const hgt = (await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: hgt, deviceScaleFactor: 1, mobile: W < 700 });
await sleep(500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`shot: ${W}x${hgt} -> ${out}`);
done(0);
