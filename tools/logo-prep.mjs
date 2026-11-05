#!/usr/bin/env node
// logo-prep: turn a logo sitting on a plain white/light background into transparent PNGs.
// Usage: node tools/logo-prep.mjs <input> <outDir> [--tol 40]
// Writes <outDir>/logo.png (original colours) and <outDir>/logo-light.png (solid white, for dark backgrounds).
// Both are trimmed to the artwork and capped at 1000px wide. Works for dark/saturated marks on white;
// check the result by eye on the real header and footer backgrounds.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2);
const [input, outDir] = a.filter((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--tol');
const tol = a.includes('--tol') ? Number(a[a.indexOf('--tol') + 1]) : 40;
if (!input || !outDir) { console.error('usage: logo-prep.mjs <input> <outDir> [--tol 40]'); process.exit(2); }

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const colour = Buffer.alloc(data.length);
const white = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const m = Math.min(r, g, b); // distance from white
  const al = Math.min(1, (255 - m) / (255 - tol));
  const k = al < 0.02 ? 0 : al;
  const un = (v) => (k === 0 ? 0 : Math.max(0, Math.min(255, Math.round((v - (1 - k) * 255) / k))));
  colour[i] = un(r); colour[i + 1] = un(g); colour[i + 2] = un(b); colour[i + 3] = Math.round(k * 255);
  white[i] = white[i + 1] = white[i + 2] = 255; white[i + 3] = Math.round(k * 255);
}
fs.mkdirSync(outDir, { recursive: true });
for (const [name, buf] of [['logo.png', colour], ['logo-light.png', white]]) {
  await sharp(buf, { raw: { width, height, channels: 4 } }).trim().resize({ width: 1000, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(outDir, name));
  const m = await sharp(path.join(outDir, name)).metadata();
  console.log(`${name}: ${m.width}x${m.height}`);
}
