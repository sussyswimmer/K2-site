// Camera rails: CatmullRom curves through the CAM_xx / LOOK_xx empties from the terrain
// GLB, with optional overrides and "via" points so the rails can be tuned here without a
// Blender re-export. All coordinates: three.js frame (x east, y elevation, z south), metres.
import * as THREE from 'three';

// Via points inserted between keyframes (after keyframe `after`).
// CAM_00 → CAM_01 dives toward the lower Baltoro, then glides east up the glacier.
const VIAS = [
  { after: 0, pos: [-15500, 8200, 17200], look: [-2500, 5600, 13500] },
];

// Per-keyframe overrides (null = use the GLB empty).
const OVERRIDES = {};

export function buildRails(cams) {
  const pos = [];
  const look = [];
  const anchors = []; // curve-point index of each chapter keyframe
  for (let k = 0; k < 6; k++) {
    const key = String(k).padStart(2, '0');
    const o = OVERRIDES[key] || {};
    anchors.push(pos.length);
    pos.push(o.pos ? new THREE.Vector3(...o.pos) : cams[`CAM_${key}`].clone());
    look.push(o.look ? new THREE.Vector3(...o.look) : cams[`LOOK_${key}`].clone());
    for (const v of VIAS.filter((x) => x.after === k)) {
      pos.push(new THREE.Vector3(...v.pos));
      look.push(new THREE.Vector3(...v.look));
    }
  }
  const camCurve = new THREE.CatmullRomCurve3(pos, false, 'centripetal', 0.5);
  const lookCurve = new THREE.CatmullRomCurve3(look, false, 'centripetal', 0.5);
  const n = pos.length - 1;
  // uniform parameter of a curve point (getPoint passes exactly through point i at i/n)
  const anchorT = anchors.map((i) => i / n);
  return { camCurve, lookCurve, anchorT, keyframes: anchors.map((i) => ({ pos: pos[i], look: look[i] })) };
}
