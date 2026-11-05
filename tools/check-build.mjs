#!/usr/bin/env node
// Behavioural checks on a built dist/. Returns/prints errors and warnings.
// Usage (CLI): node tools/check-build.mjs <dist> --mode demo|live --slug <slug> [--site <origin>] [--form <id>] [--forbid a,b]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXT = new Set(['.html', '.xml', '.txt', '.js', '.css', '.json', '.webmanifest', '.svg']);
const BRAND = ['astrowind', 'arthelokyo', 'lorem ipsum'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

export function checkBuild({ dist, mode, slug, site, ghlFormId, forbid = [] }) {
  const errors = [];
  const warnings = [];
  const live = mode === 'live';
  const origin = (site || '').replace(/\/$/, '');
  const base = live ? '' : `/${slug}`;
  const files = walk(dist);
  const html = files.filter((f) => f.endsWith('.html'));
  const rel = (f) => path.relative(dist, f);
  const read = (f) => fs.readFileSync(f, 'utf8');

  if (!fs.existsSync(path.join(dist, 'index.html'))) errors.push('no index.html at dist root');

  // 1. every local reference resolves to a file, and carries the base in demo mode
  const unresolved = new Map();
  const unprefixed = new Map();
  const refRe = /\b(?:href|src|poster|action)\s*=\s*"([^"]*)"/gi;
  const setRe = /\bsrcset\s*=\s*"([^"]*)"/gi;
  for (const f of html) {
    const text = read(f);
    const refs = [];
    for (const m of text.matchAll(refRe)) refs.push(m[1]);
    for (const m of text.matchAll(setRe)) for (const part of m[1].split(',')) refs.push(part.trim().split(/\s+/)[0]);
    for (let r of refs) {
      if (origin && r.startsWith(origin)) r = r.slice(origin.length) || '/';
      if (!r || r.startsWith('#') || r.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(r) || !r.startsWith('/')) continue;
      let p = r.split(/[?#]/)[0];
      try { p = decodeURI(p); } catch { /* keep raw */ }
      if (base && !(p === base || p.startsWith(base + '/'))) {
        (unprefixed.get(r) ?? unprefixed.set(r, new Set()).get(r)).add(rel(f));
        continue;
      }
      const sub = p.slice(base.length).replace(/^\//, '');
      const cands = [sub ? sub : 'index.html', path.join(sub, 'index.html'), sub + '.html'];
      if (!cands.some((c) => fs.existsSync(path.join(dist, c)) && fs.statSync(path.join(dist, c)).isFile())) {
        (unresolved.get(r) ?? unresolved.set(r, new Set()).get(r)).add(rel(f));
      }
    }
  }
  for (const [r, pages] of [...unprefixed].slice(0, 10)) errors.push(`link missing base ${base}: ${r} (in ${[...pages][0]}${pages.size > 1 ? ` +${pages.size - 1}` : ''})`);
  for (const [r, pages] of [...unresolved].slice(0, 10)) errors.push(`reference does not resolve to a file: ${r} (in ${[...pages][0]}${pages.size > 1 ? ` +${pages.size - 1}` : ''})`);
  if (unprefixed.size > 10) errors.push(`...and ${unprefixed.size - 10} more unprefixed`);
  if (unresolved.size > 10) errors.push(`...and ${unresolved.size - 10} more unresolved`);

  // 2. text scans: branding leftovers, double prefix, mode-specific leaks
  const words = [...BRAND, ...forbid.map((s) => s.toLowerCase())];
  if (live) words.push('try.webbeo.ai', 'example.com');
  const hits = new Map();
  let placeholders = 0;
  const noindexMissing = [];
  let bannerSeen = false;
  for (const f of files) {
    if (!TEXT_EXT.has(path.extname(f))) continue;
    const text = read(f);
    const low = text.toLowerCase();
    for (const w of words) if (low.includes(w)) (hits.get(w) ?? hits.set(w, []).get(w)).push(rel(f));
    if (base && text.includes(`${base}${base}`)) errors.push(`double base prefix in ${rel(f)}`);
    if (live && slug && new RegExp(`(?:href|src)="/${slug}/`).test(text)) errors.push(`live build still references /${slug}/ in ${rel(f)}`);
    placeholders += (text.match(/\[PLACEHOLDER/g) || []).length;
    if (f.endsWith('.html')) {
      if (text.includes('data-webbeo-demo')) bannerSeen = true;
      const robots = text.match(/<meta[^>]*name="robots"[^>]*>/i)?.[0] || '';
      if (!live && !/noindex/i.test(robots)) noindexMissing.push(rel(f));
      if (live && /noindex/i.test(robots)) errors.push(`live page is noindex: ${rel(f)}`);
    }
  }
  for (const [w, list] of hits) errors.push(`forbidden string "${w}" in ${list.length} file(s), e.g. ${list[0]}`);
  if (live && bannerSeen) errors.push('demo banner present in live build');
  if (!live && !bannerSeen) errors.push('demo banner missing from demo build');
  if (noindexMissing.length) errors.push(`demo page(s) without noindex: ${noindexMissing.slice(0, 3).join(', ')}${noindexMissing.length > 3 ? ` +${noindexMissing.length - 3}` : ''}`);
  if (placeholders) (live ? errors : warnings).push(`${placeholders} [PLACEHOLDER] marker(s) still visible`);

  // 3. shared GHL form
  if (!ghlFormId) errors.push('site.json has no ghlFormId');
  else if (!html.some((f) => read(f).includes(`/widget/form/${ghlFormId}`))) errors.push(`GHL form ${ghlFormId} is not embedded on any page`);

  return { errors, warnings, pages: html.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const r = checkBuild({ dist: a[0], mode: get('--mode') || 'demo', slug: get('--slug'), site: get('--site'), ghlFormId: get('--form'), forbid: (get('--forbid') || '').split(',').filter(Boolean) });
  console.log(`${r.pages} pages checked`);
  r.warnings.forEach((w) => console.log(`WARN  ${w}`));
  r.errors.forEach((e) => console.log(`FAIL  ${e}`));
  console.log(r.errors.length ? `RESULT: FAIL (${r.errors.length})` : 'RESULT: PASS');
  process.exit(r.errors.length ? 1 : 0);
}
