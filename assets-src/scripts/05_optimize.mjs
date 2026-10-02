// Debrief 1 · step 5 — compress the Blender GLBs into public/models/.
//
//   node assets-src/scripts/05_optimize.mjs
//
// Explicit gltf-transform steps (NOT `optimize`, whose defaults flatten the CAM→LOOK
// hierarchy and prune the empties the site reads):
//   dedup → prune (keep leaf nodes) → weld → draco (16-bit positions) → webp textures.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, draco, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'assets-src/blender/tmp');
const OUT = path.join(ROOT, 'public/models');

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

// Per-file texture budgets (slot regex → size / quality).
const TEXTURES = {
  'k2_terrain.glb': [
    { slots: /^baseColor/, resize: [2048, 2048], quality: 80 },
    { slots: /^normal/, resize: [2048, 2048], quality: 86 },
    { slots: /^occlusion/, resize: [1024, 1024], quality: 78 },
  ],
  'k2_terrain_lo.glb': [
    { slots: /^baseColor/, resize: [1024, 1024], quality: 78 },
    { slots: /^normal/, resize: [1024, 1024], quality: 84 },
    { slots: /^occlusion/, resize: [512, 512], quality: 75 },
  ],
};

const BUDGET = { terrain: 3.5e6, props: 1.0e6 };

const files = (await readdir(SRC)).filter((f) => f.endsWith('.glb')).sort();
let propsTotal = 0;
const report = [];
for (const f of files) {
  const doc = await io.read(path.join(SRC, f));
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true, keepAttributes: false }),
    weld(),
    draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeGeneric: 12 }),
  );
  for (const t of TEXTURES[f] ?? [{ slots: /.*/, resize: [512, 512], quality: 80 }]) {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', ...t }));
  }
  const out = path.join(OUT, f);
  await io.write(out, doc);
  const size = (await stat(out)).size;
  const isTerrain = f.startsWith('k2_terrain');
  if (!isTerrain) propsTotal += size;
  const nodes = doc.getRoot().listNodes().map((n) => n.getName());
  const tris = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
    .reduce((s, p) => s + (p.getMode() === 4 ? (p.getIndices()?.getCount() ?? 0) / 3 : 0), 0);
  report.push({ file: f, mb: +(size / 1e6).toFixed(2), tris: Math.round(tris), nodes: nodes.length,
    cams: nodes.filter((n) => /^CAM_0\d_/.test(n)).length, looks: nodes.filter((n) => /^LOOK_0\d$/.test(n)).length });
  if (isTerrain && f === 'k2_terrain.glb' && size > BUDGET.terrain) console.warn(`⚠ ${f} over terrain budget`);
}
console.table(report);
console.log(`props total: ${(propsTotal / 1e6).toFixed(2)} MB (budget ${BUDGET.props / 1e6} MB)`);
if (propsTotal > BUDGET.props) console.warn('⚠ props over budget');
