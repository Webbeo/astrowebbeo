#!/usr/bin/env node
// layout-diff: compares the home-page section structure of an overlay against every other overlay in sites/.
// A demo whose ordered list of pro parts matches another demo too closely fails (same skeleton = looks the same,
// whatever the palette). Usage: node tools/layout-diff.mjs <slug> [--max 0.55]   exit 0 pass, 1 too similar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SITES = path.join(ROOT, 'sites');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const max = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : 0.55;
// Parts that appear on every site by design are not layout choices.
const COMMON = new Set(['Layout', 'ProLayout', 'LocalBusinessSchema', 'SectionHead']);
const seq = (s) => {
  const f = path.join(SITES, s, 'src/pages/index.astro');
  if (!fs.existsSync(f)) return null;
  const t = fs.readFileSync(f, 'utf8');
  const body = t.split(/^---\s*$/m).slice(2).join('---');
  return [...body.matchAll(/<([A-Z][A-Za-z0-9]+)[\s/>]/g)].map((m) => m[1]).filter((n) => !COMMON.has(n));
};
const lcs = (a, b) => { const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]); return d[a.length][b.length]; };
const mine = slug && seq(slug);
if (!mine) { console.error('layout-diff: usage: layout-diff <slug> (overlay with src/pages/index.astro)'); process.exit(2); }
let worst = 0, fail = false;
for (const o of fs.readdirSync(SITES).filter((n) => n !== slug && !n.startsWith('_'))) {
  const theirs = seq(o); if (!theirs) continue;
  // Ratio of shared in-order parts, and of the hero/services/process/reviews variant choices that match.
  const r = lcs(mine, theirs) / Math.max(mine.length, theirs.length);
  worst = Math.max(worst, r);
  const bad = r > max; fail ||= bad;
  console.log(`${bad ? 'FAIL' : 'ok  '} layout vs ${o}: ${(r * 100).toFixed(0)}% shared in order (limit ${(max * 100).toFixed(0)}%)  [${theirs.join(' > ')}]`);
}
console.log(`layout: ${mine.join(' > ')}`);
process.exit(fail ? 1 : 0);
