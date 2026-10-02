// Camp markers (Higgsfield tent prop at marker scale + a glowing beacon) and the summit flag.
import * as THREE from 'three';

const TENT_SIZE = 34;   // metres across — ~8× real so it reads from the story cameras
const FLAG_SIZE = 30;

function beaconTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,225,170,1)');
  grd.addColorStop(0.25, 'rgba(242,165,65,0.7)');
  grd.addColorStop(1, 'rgba(242,165,65,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalise(obj, size) {
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dim.x, dim.y, dim.z);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y; // sit on the ground
  return obj;
}

export function createMarkers({ hotspots, props }) {
  const group = new THREE.Group();
  group.name = 'Markers';
  const glowTex = beaconTexture();
  const camps = [];
  // Camps on the Abruzzi light up in story order; Cesen camps follow the route explorer.
  const order = ['base-camp', 'abc', 'camp-1', 'camp-2', 'camp-3', 'camp-4', 'cesen-c1', 'cesen-c2', 'cesen-c3'];
  for (const id of order) {
    const hs = hotspots.find((h) => h.id === id);
    if (!hs) continue;
    const holder = new THREE.Group();
    const tent = normalise(props.tent.clone(true), TENT_SIZE);
    tent.rotation.y = (order.indexOf(id) * 1.7) % (Math.PI * 2);
    tent.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.emissive = new THREE.Color('#5a2a00'); o.material.emissiveIntensity = 0.6; } });
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    beacon.scale.setScalar(160);
    beacon.position.y = 60;
    holder.add(tent, beacon);
    holder.position.copy(hs.position).add(new THREE.Vector3(0, -30, 0)); // HS empties sit 30 m above the DEM
    holder.scale.setScalar(0.0001);
    holder.visible = false;
    group.add(holder);
    camps.push({ id, holder, beacon, shown: 0 });
  }
  const summit = hotspots.find((h) => h.id === 'summit');
  const flag = normalise(props.flag.clone(true), FLAG_SIZE);
  const flagHolder = new THREE.Group();
  flagHolder.add(flag);
  if (summit) flagHolder.position.copy(summit.position).add(new THREE.Vector3(0, -32, 0));
  flagHolder.visible = false;
  group.add(flagHolder);

  // amount ∈ [0,1] per camp (scale-in with a little overshoot)
  function setCamp(id, amount) {
    const c = camps.find((k) => k.id === id);
    if (!c) return;
    c.shown = amount;
    const e = amount <= 0 ? 0.0001 : amount >= 1 ? 1 : 1 + 2.4 * Math.pow(amount - 1, 3) + 1.4 * Math.pow(amount - 1, 2);
    c.holder.scale.setScalar(Math.max(e, 0.0001));
    c.holder.visible = amount > 0.001;
    c.beacon.material.opacity = Math.min(1, amount * 1.2);
  }
  function setFlag(amount) {
    flagHolder.visible = amount > 0.01;
    flagHolder.scale.setScalar(Math.max(amount, 0.0001));
  }
  function update(t) {
    for (const c of camps) if (c.holder.visible) c.beacon.material.opacity = Math.min(1, c.shown) * (0.75 + 0.25 * Math.sin(t * 2.4 + c.holder.position.x));
  }
  return { group, camps, setCamp, setFlag, update, order };
}
