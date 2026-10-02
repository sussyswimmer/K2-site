// Debrief 2 — turn the raw Higgsfield downloads into web-ready assets.
//
//   node assets-src/scripts/process_media.mjs
//
// Images  → public/media/*.webp       ≤ 2560 px wide, ≤ 400 KB (+ a 1280 px variant)
// Videos  → public/media/*.mp4/.webm  1080p H.264 + VP9, no audio, ≤ 3 MB, + .webp poster
// Props   → public/models/prop_*.glb  simplified, 512 px WebP textures, Draco, ≤ 300 KB
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'assets-src/higgsfield/raw');
const MEDIA = path.join(ROOT, 'public/media');
const MODELS = path.join(ROOT, 'public/models');
mkdirSync(MEDIA, { recursive: true });
const report = [];
const kb = (f) => Math.round(statSync(f).size / 1024);

// ---------- images ----------
async function webpUnder(input, out, { width, height, fit = 'cover', position = 'centre', maxKB = 400 }) {
  let q = 82;
  for (;;) {
    await sharp(input).resize({ width, height, fit, position, withoutEnlargement: false })
      .webp({ quality: q, effort: 6, smartSubsample: true }).toFile(out);
    if (kb(out) <= maxKB || q <= 50) break;
    q -= 4;
  }
  report.push({ file: path.relative(ROOT, out), kb: kb(out), q });
}

const IMAGES = [
  // [output name, raw source (prefer the 4k upscale), width]
  ['hero_k2_dawn', existsSync(`${RAW}/hero_k2_dawn_4k.png`) ? 'hero_k2_dawn_4k' : 'hero_k2_dawn', 2560],
  ['chapter_baltoro', 'chapter_baltoro', 2560],
  ['chapter_basecamp', 'chapter_basecamp', 2560],
  ['chapter_bottleneck', 'chapter_bottleneck', 2560],
  ['chapter_summit', existsSync(`${RAW}/chapter_summit_4k.png`) ? 'chapter_summit_4k' : 'chapter_summit', 2560],
  ['chapter_winter', 'chapter_winter', 2560],
];
for (const [name, src, w] of IMAGES) {
  const input = `${RAW}/${src}.png`;
  await webpUnder(input, `${MEDIA}/${name}.webp`, { width: w });
  await webpUnder(input, `${MEDIA}/${name}_1280.webp`, { width: 1280, maxKB: 180 });
}
await webpUnder(`${RAW}/mobile_hero.png`, `${MEDIA}/mobile_hero.webp`, { width: 1080, height: 1920 });
// Social card: 1200×630 crop of the hero, weighted toward the summit.
await webpUnder(`${RAW}/hero_k2_dawn.png`, `${MEDIA}/og_card.webp`, { width: 1200, height: 630, position: 'north', maxKB: 200 });
await sharp(`${RAW}/hero_k2_dawn.png`).resize({ width: 1200, height: 630, fit: 'cover', position: 'north' })
  .jpeg({ quality: 82, mozjpeg: true }).toFile(`${MEDIA}/og_card.jpg`); // for crawlers that skip WebP
report.push({ file: 'public/media/og_card.jpg', kb: kb(`${MEDIA}/og_card.jpg`) });

// ---------- videos ----------
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
for (const name of ['flythrough_intro', 'summit_wind_loop', 'storm_loop']) {
  const input = `${RAW}/${name}.mp4`;
  if (!existsSync(input)) { console.warn(`missing ${input}`); continue; }
  const vf = 'scale=1920:-2:flags=lanczos';
  for (let crf = 24; crf <= 36; crf += 3) {
    ff(['-i', input, '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', `${MEDIA}/${name}.mp4`]);
    if (kb(`${MEDIA}/${name}.mp4`) <= 3000) break;
  }
  for (let crf = 34; crf <= 46; crf += 4) {
    ff(['-i', input, '-an', '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf),
      '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', `${MEDIA}/${name}.webm`]);
    if (kb(`${MEDIA}/${name}.webm`) <= 3000) break;
  }
  ff(['-i', input, '-frames:v', '1', '-vf', 'scale=1920:-2', `${MEDIA}/${name}_poster.png`]);
  await webpUnder(`${MEDIA}/${name}_poster.png`, `${MEDIA}/${name}_poster.webp`, { width: 1920, maxKB: 220 });
  execFileSync('rm', [`${MEDIA}/${name}_poster.png`]);
  report.push({ file: `public/media/${name}.mp4`, kb: kb(`${MEDIA}/${name}.mp4`) });
  report.push({ file: `public/media/${name}.webm`, kb: kb(`${MEDIA}/${name}.webm`) });
}

// ---------- 3D props ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
await MeshoptSimplifier.ready;
for (const name of ['prop_tent', 'prop_oxygen_bottle', 'prop_ice_axe', 'prop_flag']) {
  const input = `${RAW}/${name}.glb`;
  if (!existsSync(input)) { console.warn(`missing ${input}`); continue; }
  const out = `${MODELS}/${name}.glb`;
  for (const [ratio, tex] of [[0.6, 512], [0.4, 512], [0.25, 384]]) {
    const doc = await io.read(input);
    await doc.transform(
      dedup(), prune(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 80 }),
      draco({ quantizePosition: 14 }),
    );
    await io.write(out, doc);
    if (kb(out) <= 300) break;
  }
  report.push({ file: path.relative(ROOT, out), kb: kb(out) });
}

console.table(report);
writeFileSync(path.join(ROOT, 'assets-src/higgsfield/media_report.json'), JSON.stringify(report, null, 1));
const over = report.filter((r) => (r.file.endsWith('.webp') && !r.file.includes('_1280') && r.kb > 400)
  || ((r.file.endsWith('.mp4') || r.file.endsWith('.webm')) && r.kb > 3000)
  || (r.file.endsWith('.glb') && r.kb > 300));
if (over.length) { console.error('Over budget:', over); process.exitCode = 1; }
