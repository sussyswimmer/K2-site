// Conservative terrain height lookup (three.js frame) from public/models/heightmap_256.bin.
// The grid is max-pooled in the pipeline, so bilinear samples never fall below the
// real surface: good for camera clearance and line-of-sight tests, not for placing
// objects on the ground.
import { asset } from '../core/data.js';

export async function loadHeightmap() {
  const [meta, buf] = await Promise.all([
    fetch(asset('models/heightmap_256.json')).then((r) => r.json()),
    fetch(asset('models/heightmap_256.bin')).then((r) => r.arrayBuffer()),
  ]);
  const data = new Uint16Array(buf);
  const { n, cell, x0, z0 } = meta;
  const maxIdx = n - 1.000001;

  function heightAt(x, z) {
    const fx = Math.min(Math.max((x - x0) / cell, 0), maxIdx);
    const fz = Math.min(Math.max((z - z0) / cell, 0), maxIdx);
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const tx = fx - c;
    const tz = fz - r;
    const i = r * n + c;
    const a = data[i], b = data[i + 1], d = data[i + n], e = data[i + n + 1];
    return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + d * (1 - tx) * tz + e * tx * tz;
  }

  // true if the straight line a→b clears the terrain (sampled; small margin)
  function lineOfSight(a, b, samples = 24, margin = 25) {
    for (let k = 1; k < samples; k++) {
      const t = k / samples;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      if (heightAt(x, z) > y + margin) return false;
    }
    return true;
  }

  return { heightAt, lineOfSight, bounds: { x0, z0, x1: x0 + (n - 1) * cell, z1: z0 + (n - 1) * cell } };
}
