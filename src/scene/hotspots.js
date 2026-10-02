// CSS2D hotspot labels anchored to the HS_* empties from the terrain GLB.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { fmtAlt, onUnits } from '../core/units.js';

const DISPLAY = {
  // id → [label, elevation to show (m)]; unlisted ids use the GLB name/elevation
  'base-camp': ['K2 Base Camp', 5000],
  abc: ['Advanced Base Camp', 5300],
  'camp-1': ['Camp 1', 6050],
  'camp-2': ['Camp 2', 6700],
  'camp-3': ['Camp 3', 7200],
  'camp-4': ['Camp 4 · Shoulder', 7900],
  bottleneck: ['The Bottleneck', 8200],
  summit: ['Summit', 8611],
  concordia: ['Concordia', 4600],
  'broad-peak': ['Broad Peak', 8051],
  'gasherbrum-i': ['Gasherbrum I', 8080],
  'gasherbrum-ii': ['Gasherbrum II', 8035],
  'gasherbrum-iv': ['Gasherbrum IV', 7925],
  'gilkey-memorial': ['Gilkey Memorial', null],
  'cesen-c1': ['Cesen C1', 5950],
  'cesen-c2': ['Cesen C2', 6320],
  'cesen-c3': ['Cesen C3', 7000],
};

export function createHotspots({ hotspots, container, onSelect, heightmap }) {
  const renderer = new CSS2DRenderer({ element: container });
  const group = new THREE.Group();
  group.name = 'Hotspots';
  const items = [];
  for (const h of hotspots) {
    if (h.id === 'cesen-join' || h.id === 'broad-peak-bc') continue;
    const [label, elev] = DISPLAY[h.id] || [h.name, h.elev];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hotspot is-hidden';
    el.dataset.kind = h.kind;
    el.dataset.id = h.id;
    el.tabIndex = -1;
    el.innerHTML = `<span class="hotspot__dot"></span><span class="hotspot__label"><span class="hotspot__name"></span><span class="hotspot__elev"></span></span>`;
    el.querySelector('.hotspot__name').textContent = label;
    const elevEl = el.querySelector('.hotspot__elev');
    const renderElev = () => { elevEl.textContent = elev ? `${fmtAlt(elev)}${h.kind === 'camp' || h.id === 'bottleneck' ? ' · approx.' : ''}` : ''; };
    renderElev();
    onUnits(renderElev);
    el.setAttribute('aria-label', `${label}${elev ? `, ${fmtAlt(elev)}` : ''}. Show facts`);
    el.addEventListener('click', () => onSelect(h.id, label));
    const obj = new CSS2DObject(el);
    obj.position.copy(h.position);
    obj.center.set(0, 0.5);
    group.add(obj);
    items.push({ id: h.id, el, obj, visible: false, occluded: false });
  }

  let active = new Set();
  function show(ids, all = false) {
    active = new Set(ids);
    for (const it of items) {
      const v = all || active.has(it.id);
      if (v !== it.visible) {
        it.visible = v;
        it.el.classList.toggle('is-hidden', !v);
        it.el.tabIndex = v ? 0 : -1;
      }
    }
  }

  let lastOcc = 0;
  const camPos = new THREE.Vector3();
  function render(scene, camera, t) {
    if (t - lastOcc > 0.15) {
      lastOcc = t;
      camPos.copy(camera.position);
      for (const it of items) {
        if (!it.visible) continue;
        const occ = !heightmap.lineOfSight(camPos, it.obj.position, 28, 40);
        if (occ !== it.occluded) {
          it.occluded = occ;
          it.el.classList.toggle('is-occluded', occ);
        }
      }
    }
    renderer.render(scene, camera);
  }

  return {
    group,
    items,
    show,
    render,
    setSize: (w, h) => renderer.setSize(w, h),
  };
}
