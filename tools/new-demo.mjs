#!/usr/bin/env node
// Create a prospect overlay from a starter: node tools/new-demo.mjs <slug> [--starter local-trade]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.WEBBEO_BUILD_ROOT || '/home/node/webbeo-build';
const a = process.argv.slice(2);
const slug = a.find((x) => !x.startsWith('--'));
const starter = a.includes('--starter') ? a[a.indexOf('--starter') + 1] : 'local-trade';
const die = (m) => { console.error(`new-demo: ${m}`); process.exit(2); };

if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) die('usage: new-demo <slug> [--starter local-trade]');
const from = path.join(ENGINE, 'starters', starter);
if (!fs.existsSync(from)) die(`no starter "${starter}"`);
const to = path.join(ROOT, 'sites', slug);
if (fs.existsSync(to)) die(`${to} already exists`);
fs.cpSync(from, to, { recursive: true });
const sha = spawnSync('git', ['-C', ENGINE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const f = path.join(to, 'site.json');
const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
Object.assign(cfg, { slug, starter, engine: { repo: 'Webbeo/astrowebbeo', sha } });
fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
console.log(`created ${to}\nedit: site.json (ghlFormId, forbid), config.yaml, src/data/content.json, src/assets/`);
