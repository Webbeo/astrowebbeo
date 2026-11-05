#!/usr/bin/env node
// Build a prospect site from the shared engine + its small overlay folder.
//   node tools/build-demo.mjs <slug>                         demo build -> out/<slug>/dist
//   node tools/build-demo.mjs <slug> --live --site <origin>  live build -> out/<slug>/dist-live
// Flags: --allow-engine-change (engine HEAD differs from site.json pin), --keep (keep build dir)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkBuild } from './check-build.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.WEBBEO_BUILD_ROOT || '/home/node/webbeo-build';
const DEMO_ORIGIN = 'https://try.webbeo.ai';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const flag = (k) => args.includes(k);
const opt = (k) => (flag(k) ? args[args.indexOf(k) + 1] : undefined);
const die = (m) => { console.error(`build-demo: ${m}`); process.exit(2); };

if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) die('usage: build-demo <slug> [--live --site <origin>]');
const live = flag('--live');
const site = live ? opt('--site') : DEMO_ORIGIN;
if (live && !/^https:\/\/[a-z0-9.-]+$/.test(site || '')) die('--live needs --site https://<domain>');

const overlay = path.join(ROOT, 'sites', slug);
if (!fs.existsSync(path.join(overlay, 'site.json'))) die(`no overlay at ${overlay} (run new-demo first)`);
const cfg = JSON.parse(fs.readFileSync(path.join(overlay, 'site.json'), 'utf8'));
if (!fs.existsSync(path.join(overlay, 'config.yaml'))) die('overlay has no config.yaml');

// engine pin
const git = (...a) => spawnSync('git', ['-C', ENGINE, ...a], { encoding: 'utf8' }).stdout.trim();
const sha = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
if (cfg.engine?.sha && cfg.engine.sha !== sha && !flag('--allow-engine-change')) {
  die(`engine is at ${sha.slice(0, 8)} but site.json pins ${cfg.engine.sha.slice(0, 8)}; check out the pinned ref or pass --allow-engine-change`);
}

if (live && dirty) die('refusing a live build from an engine with uncommitted changes; commit/tag the engine first');
const outDir = path.join(ROOT, 'out', slug);
const build = path.join(outDir, '.build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });
const t0 = Date.now();

// 1. engine -> build dir (never the engine's own pages or sample posts)
const SKIP_TOP = new Set(['node_modules', 'dist', '.git', '.astro', '.github', '.vscode', '.agents', 'nginx', 'tools', 'starters', 'src']);
// top-level docs are skipped: Tailwind scans every file for class names, and README/AGENTS carry upstream branding
for (const e of fs.readdirSync(ENGINE)) if (!SKIP_TOP.has(e) && !e.endsWith('.md') || e === 'LICENSE.md') fs.cpSync(path.join(ENGINE, e), path.join(build, e), { recursive: true });
fs.cpSync(path.join(ENGINE, 'src'), path.join(build, 'src'), {
  recursive: true,
  filter: (p) => { const r = path.relative(path.join(ENGINE, 'src'), p); return !(r === 'pages' || r.startsWith('pages' + path.sep) || r === path.join('data', 'post') || r.startsWith(path.join('data', 'post') + path.sep)); },
});
fs.symlinkSync(path.join(ENGINE, 'node_modules'), path.join(build, 'node_modules'));
fs.rmSync(path.join(build, 'public/decapcms'), { recursive: true, force: true }); // unused CMS admin stub, never ship it

// 2. optional inherited engine pages / data
for (const pg of cfg.inheritPages || []) {
  fs.mkdirSync(path.dirname(path.join(build, 'src/pages', pg)), { recursive: true });
  fs.cpSync(path.join(ENGINE, 'src/pages', pg), path.join(build, 'src/pages', pg), { recursive: true });
}
for (const d of cfg.inheritData || []) fs.cpSync(path.join(ENGINE, 'src/data', d), path.join(build, 'src/data', d), { recursive: true });

// 3. overlay wins
for (const d of ['src', 'public']) if (fs.existsSync(path.join(overlay, d))) fs.cpSync(path.join(overlay, d), path.join(build, d), { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'src/pages'), { recursive: true });
fs.mkdirSync(path.join(build, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(build, 'src/data/site.json'), JSON.stringify(cfg, null, 2));
let yaml = fs.readFileSync(path.join(overlay, 'config.yaml'), 'utf8');
yaml = yaml.replace(/^  site:.*$/m, `  site: '${site}'`).replace(/^  base:.*$/m, `  base: '${live ? '/' : '/' + slug}'`);
if (!live) yaml = yaml.replace(/(robots:\s*\n\s*index:\s*)true(\s*\n\s*follow:\s*)true/, '$1false$2false');
fs.writeFileSync(path.join(build, 'src/config.yaml'), yaml);
if (!live) {
  fs.mkdirSync(path.join(build, 'public'), { recursive: true });
  fs.writeFileSync(path.join(build, 'public/robots.txt'), 'User-agent: *\nDisallow: /\n');
}

// 4. build
const env = { ...process.env };
delete env.PUBLIC_DEMO; delete env.PUBLIC_DEMO_SLUG;
if (!live) { env.PUBLIC_DEMO = 'true'; env.PUBLIC_DEMO_SLUG = slug; }
const r = spawnSync(path.join(ENGINE, 'node_modules/.bin/astro'), ['build'], { cwd: build, env, encoding: 'utf8' });
if (r.status !== 0) { console.error((r.stdout + r.stderr).split('\n').slice(-25).join('\n')); die(`astro build failed (build dir kept: ${build})`); }

// 5. checks gate the output
const dist = path.join(build, 'dist');
const res = checkBuild({ dist, mode: live ? 'live' : 'demo', slug, site, ghlFormId: cfg.ghlFormId, forbid: cfg.forbid || [] });
res.warnings.forEach((w) => console.log(`WARN  ${w}`));
res.errors.forEach((e) => console.log(`FAIL  ${e}`));
// 5b. visual checks (demo builds): forced :hover + contrast on every button, real Chromium. Fail closed.
if (!live && !res.errors.length) {
  const n0 = res.errors.length;
  const hv = spawnSync('node', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-hover.mjs'), slug, dist], { encoding: 'utf8', timeout: 180000 });
  const lines = (hv.stdout || '').split('\n').filter((l) => l.startsWith('FAIL '));
  if (hv.status === 0) console.log('check-hover: PASS');
  else if (hv.status === 1) { [...new Set(lines)].slice(0, 12).forEach((l) => res.errors.push(l.slice(5))); if (lines.length > 12) res.errors.push(`check-hover: ...and ${lines.length - 12} more`); }
  else res.errors.push('check-hover could not run (needs chromium + node>=22): ' + ((hv.stderr || '').trim().split('\n').pop() || 'unknown error'));
  res.errors.slice(n0).forEach((e) => console.log(`FAIL  ${e}`));
}
const target = path.join(outDir, live ? 'dist-live' : 'dist');
fs.rmSync(target, { recursive: true, force: true });   // a failed build must never leave a deployable dist behind
if (res.errors.length) { console.log(`RESULT: FAIL (${res.errors.length}) - nothing written to ${target}; build dir kept: ${build}`); process.exit(1); }
fs.cpSync(dist, target, { recursive: true });
fs.writeFileSync(path.join(outDir, `build-info-${live ? 'live' : 'demo'}.json`), JSON.stringify({ slug, mode: live ? 'live' : 'demo', site, base: live ? '/' : '/' + slug, engineSha: sha, engineDirty: dirty, builtAt: new Date().toISOString() }, null, 2));
if (!flag('--keep')) fs.rmSync(build, { recursive: true, force: true });
console.log(`RESULT: PASS - ${res.pages} pages, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${target}`);
