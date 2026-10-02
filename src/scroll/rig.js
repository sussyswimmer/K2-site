// Story camera rig: progress → pose on the rails, eased per chapter, with terrain
// clearance (≥ 150 m above the conservative heightmap), a summit orbit + pull-back in
// the last chapter, and a smooth blend back after free-explore mode.
import * as THREE from 'three';
import { CHAPTERS, TRAVEL, chapterAt } from './chapters.js';

export const CLEARANCE = 150;
const SUMMIT = new THREE.Vector3(0, 8571, 0);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // power2.inOut
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

export function createRig({ camera, rails, heightmap }) {
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const cur = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const tmp = new THREE.Vector3();
  let snapNext = true;
  let blend = null; // { from: {pos, look}, t: 0, dur }

  function poseAt(p, out) {
    const i = chapterAt(p);
    const c = CHAPTERS[i];
    const u = clamp01((p - c.start) / (c.end - c.start));
    const { camCurve, lookCurve, anchorT } = rails;
    if (i === 0) {
      // hold high above the range with a slow push-in
      camCurve.getPoint(anchorT[0], out.pos);
      lookCurve.getPoint(anchorT[0], out.look);
      out.pos.lerp(out.look, 0.08 * u);
      return out;
    }
    const e = easeInOut(clamp01(u / TRAVEL));
    const s = THREE.MathUtils.lerp(anchorT[i - 1], anchorT[i], e);
    camCurve.getPoint(s, out.pos);
    lookCurve.getPoint(s, out.look);
    const hold = clamp01((u - TRAVEL) / (1 - TRAVEL));
    if (i < 5) {
      // gentle drift during the hold so the frame never feels frozen
      tmp.subVectors(out.pos, out.look).applyAxisAngle(THREE.Object3D.DEFAULT_UP, 0.05 * easeInOut(hold));
      out.pos.copy(out.look).add(tmp);
    } else if (u > 0.4) {
      // Summit: orbit ~110° around the summit, then pull back to reveal the range.
      const orbit = easeInOut(clamp01((u - 0.4) / 0.38));
      const pull = easeInOut(clamp01((u - 0.78) / 0.22));
      out.look.lerp(SUMMIT, 0.6);
      tmp.subVectors(out.pos, SUMMIT).applyAxisAngle(THREE.Object3D.DEFAULT_UP, THREE.MathUtils.degToRad(-110) * orbit);
      tmp.multiplyScalar(1 + 3.2 * pull);
      tmp.y += 2200 * pull;
      out.pos.copy(SUMMIT).add(tmp);
      out.look.y -= 900 * pull;
    }
    return out;
  }

  function clearance(v) {
    const h = heightmap.heightAt(v.x, v.z) + CLEARANCE;
    if (v.y < h) v.y = h;
    return v;
  }

  function update(p, dt) {
    poseAt(p, target);
    clearance(target.pos);
    if (snapNext) {
      cur.pos.copy(target.pos);
      cur.look.copy(target.look);
      snapNext = false;
    } else {
      const k = 1 - Math.exp(-dt * 6);
      cur.pos.lerp(target.pos, k);
      cur.look.lerp(target.look, k);
    }
    clearance(cur.pos);
    let pos = cur.pos;
    let look = cur.look;
    if (blend) {
      blend.t += dt;
      const e = easeInOut(clamp01(blend.t / blend.dur));
      pos = tmp.copy(blend.from.pos).lerp(cur.pos, e);
      look = blend.look.copy(blend.from.look).lerp(cur.look, e);
      if (blend.t >= blend.dur) blend = null;
    }
    camera.position.copy(pos);
    camera.lookAt(look);
    return look;
  }

  return {
    update,
    poseAt,
    snap() { snapNext = true; },
    blendFrom(pos, look, dur = 1) {
      blend = { from: { pos: pos.clone(), look: look.clone() }, look: new THREE.Vector3(), t: 0, dur };
    },
    get look() { return cur.look; },
  };
}

export function updateNearFar(camera, heightmap) {
  const agl = Math.max(camera.position.y - heightmap.heightAt(camera.position.x, camera.position.z), 1);
  const near = THREE.MathUtils.clamp(agl * 0.1, 2, 150);
  if (Math.abs(near - camera.near) > 0.5) {
    camera.near = near;
    camera.far = 140000;
    camera.updateProjectionMatrix();
  }
}
