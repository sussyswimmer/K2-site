// Expedition Packer (Chapter 1): pack for the summit push from Camp 4.
// Drag items into the pack (pointer events → mouse, touch and pen) or toggle them with
// Enter/Space. Four icons are the Higgsfield 3D props, six are inline SVGs.
import { asset } from '../../core/data.js';

const LIMIT = 9; // kg carried beyond the down suit and boots you wear
const SVG = {
  crampons: '<svg viewBox="0 0 64 64"><path d="M10 28h44l-4 10H14z"/><path d="M16 38l-3 12M24 38l-2 12M32 38v12M40 38l2 12M48 38l3 12"/><path d="M22 28c0-6 4-10 10-10s10 4 10 10"/></svg>',
  headlamp: '<svg viewBox="0 0 64 64"><path d="M8 32c0-10 10-16 24-16s24 6 24 16"/><rect x="22" y="26" width="20" height="14" rx="4"/><circle cx="32" cy="33" r="4"/><path d="M44 30l12-6M44 36l12 6M44 33h14"/></svg>',
  mitts: '<svg viewBox="0 0 64 64"><path d="M20 54V30c0-10 4-16 12-16s12 6 12 14v26z"/><path d="M20 34c-6-2-10 2-8 8l8 6"/><path d="M20 46h24"/></svg>',
  thermos: '<svg viewBox="0 0 64 64"><rect x="22" y="16" width="20" height="40" rx="6"/><path d="M26 10h12v6H26z"/><path d="M22 28h20M22 46h20"/></svg>',
  radio: '<svg viewBox="0 0 64 64"><rect x="20" y="20" width="24" height="36" rx="5"/><path d="M38 20V6"/><rect x="25" y="26" width="14" height="9" rx="2"/><circle cx="27" cy="44" r="1.5"/><circle cx="32" cy="44" r="1.5"/><circle cx="37" cy="44" r="1.5"/><circle cx="27" cy="50" r="1.5"/><circle cx="32" cy="50" r="1.5"/><circle cx="37" cy="50" r="1.5"/></svg>',
  stove: '<svg viewBox="0 0 64 64"><path d="M20 30h24l-4 22H24z"/><path d="M16 30h32"/><path d="M26 22c0-4 3-4 3-8M34 22c0-4 3-4 3-8"/><path d="M24 52l-4 6M40 52l4 6"/></svg>',
};
const ITEMS = [
  { id: 'oxygen', name: 'Oxygen bottle & mask', kg: 3.6, img: 'oxygen_bottle', role: 'essential',
    yes: 'Bottled oxygen: most K2 summiteers today use it. Going without is possible for a few, but it raises the risk of frostbite, exhaustion and mistakes.',
    no: 'No oxygen? A handful of elite climbers summit without it. For everyone else it is the single biggest safety margin above 8,000 m.' },
  { id: 'axe', name: 'Ice axe', kg: 0.5, img: 'ice_axe', role: 'essential',
    yes: 'Ice axe: needed for the steep snow and ice of the Bottleneck and the traverse.', no: 'You will want an ice axe in the Bottleneck.' },
  { id: 'crampons', name: 'Crampons', kg: 0.9, svg: 'crampons', role: 'essential',
    yes: 'Crampons: non-negotiable on hard ice.', no: 'Without crampons you cannot climb the Bottleneck.' },
  { id: 'headlamp', name: 'Headlamp & spare batteries', kg: 0.25, svg: 'headlamp', role: 'essential',
    yes: 'Headlamp: summit pushes usually start in the dark, around midnight from Camp 4.', no: 'The summit push starts in darkness: a headlamp is essential.' },
  { id: 'mitts', name: 'Spare down mitts', kg: 0.35, svg: 'mitts', role: 'essential',
    yes: 'Spare mitts: drop one and frostbite can follow within minutes.', no: 'A spare pair of mitts is cheap insurance against frostbite.' },
  { id: 'thermos', name: 'Thermos (1 L hot drink)', kg: 1.1, svg: 'thermos', role: 'recommended',
    yes: 'Hot drink: dehydration builds fast in dry, thin air.', no: 'Consider a thermos: a summit day can run 14 hours or more, with 8 to 10 hours up and 6 to 7 down.' },
  { id: 'radio', name: 'Radio', kg: 0.3, svg: 'radio', role: 'recommended',
    yes: 'Radio: keeps you in touch with your team and base camp.', no: 'A radio is light and lets you call for help or get weather updates.' },
  { id: 'flag', name: 'Summit flag', kg: 0.15, img: 'flag', role: 'optional',
    yes: 'Summit flag: light, and a photo many climbers want. Every gram still counts.', no: '' },
  { id: 'tent', name: 'Tent', kg: 3.0, img: 'tent', role: 'leave',
    yes: 'The tent stays pitched at Camp 4. Carrying it to the summit only slows you down.', no: '' },
  { id: 'stove', name: 'Stove & gas', kg: 0.9, svg: 'stove', role: 'leave',
    yes: 'Melt snow and fill bottles at Camp 4 before leaving: there is no time to cook on summit day.', no: '' },
];

const kgFmt = (v) => `${v.toFixed(v < 1 ? 2 : 1).replace(/\.?0+$/, '')} kg`;

export function mount(el) {
  const packed = new Set();
  el.innerHTML = `
  <div class="w">
    <p class="lede-sm">It's midnight at Camp 4, about <span data-m="7900"></span>. Pack for the summit push. You can carry about <strong>${LIMIT} kg</strong> beyond the down suit and boots you're wearing. Drag items into the pack or press them to add and remove.</p>
    <div class="pack">
      <div>
        <h3>Gear</h3>
        <div class="pack-items" data-zone="shelf" aria-label="Gear available"></div>
      </div>
      <div class="pack-bag" data-zone="bag" aria-label="Your pack">
        <div class="pack-bag__head"><h3>Your pack</h3><span class="pack-weight" aria-live="polite">0 kg</span></div>
        <div class="pack-meter" role="meter" aria-label="Pack weight" aria-valuemin="0" aria-valuemax="${LIMIT}" aria-valuenow="0"><span></span></div>
        <div class="pack-items" data-zone="bag-items"></div>
        <div class="pack-feedback" aria-live="polite"></div>
      </div>
    </div>
    <div class="w-row"><button type="button" class="btn btn--amber" data-check>Check my pack</button><button type="button" class="btn btn--ghost" data-reset>Empty the pack</button></div>
    <div class="pack-verdict" aria-live="polite"></div>
    <p class="w-note">Weights are approximate. Oxygen: a full 4-litre cylinder plus regulator and mask. Summit-day timings from <a href="https://sevensummittreks.com/page/mt-k2-expedition-8611m.html" target="_blank" rel="noopener">Seven Summit Treks' K2 itinerary</a>; oxygen use from <a href="https://www.alanarnette.com/blog/2021/06/26/k2-2021-summer-season-coverage-begins/" target="_blank" rel="noopener">Alan Arnette</a> (2019: over 30 summits, at least 7 without bottled oxygen).</p>
  </div>`;

  const shelf = el.querySelector('[data-zone="shelf"]');
  const bagItems = el.querySelector('[data-zone="bag-items"]');
  const bag = el.querySelector('[data-zone="bag"]');
  const weightEl = el.querySelector('.pack-weight');
  const meter = el.querySelector('.pack-meter');
  const feedback = el.querySelector('.pack-feedback');
  const verdict = el.querySelector('.pack-verdict');
  const buttons = new Map();

  for (const it of ITEMS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pack-item';
    b.dataset.id = it.id;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${it.name}, ${kgFmt(it.kg)}. ${'Not packed'}`);
    b.innerHTML = `${it.img ? `<img src="${asset(`media/props/${it.img}.webp`)}" alt="" width="54" height="54" loading="lazy" />` : SVG[it.svg]}<span>${it.name}</span><span class="pack-item__w">${kgFmt(it.kg)}</span>`;
    buttons.set(it.id, b);
    shelf.appendChild(b);
  }

  function total() { return [...packed].reduce((s, id) => s + ITEMS.find((i) => i.id === id).kg, 0); }

  function render(last) {
    for (const it of ITEMS) {
      const b = buttons.get(it.id);
      const inBag = packed.has(it.id);
      (inBag ? bagItems : shelf).appendChild(b);
      b.setAttribute('aria-pressed', String(inBag));
      b.setAttribute('aria-label', `${it.name}, ${kgFmt(it.kg)}. ${inBag ? 'Packed. Press to remove' : 'Not packed. Press to pack'}`);
    }
    const kg = total();
    weightEl.textContent = `${kg.toFixed(1)} / ${LIMIT} kg`;
    meter.setAttribute('aria-valuenow', kg.toFixed(1));
    meter.classList.toggle('is-over', kg > LIMIT);
    meter.querySelector('span').style.width = `${Math.min(kg / LIMIT, 1) * 100}%`;
    const lines = [];
    if (last) {
      const it = ITEMS.find((i) => i.id === last.id);
      if (last.added) lines.push([it.role === 'leave' ? 'warn' : 'ok', it.yes]);
      else if (it.no) lines.push(['', it.no]);
    }
    if (kg > LIMIT) lines.push(['warn', `Over the limit by ${(kg - LIMIT).toFixed(1)} kg. Every extra kilo costs you time in the death zone.`]);
    feedback.innerHTML = lines.map(([c, t]) => `<p class="${c}">${t}</p>`).join('');
    verdict.innerHTML = '';
  }

  function toggle(id, force) {
    const want = force ?? !packed.has(id);
    if (want === packed.has(id)) return;
    want ? packed.add(id) : packed.delete(id);
    render({ id, added: want });
  }

  // click / keyboard
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.pack-item');
    if (b && !b.dataset.dragged) toggle(b.dataset.id);
    if (b) delete b.dataset.dragged;
  });

  // pointer drag & drop
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.pack-item');
    if (!b || e.button > 0) return;
    drag = { b, id: b.dataset.id, x: e.clientX, y: e.clientY, ghost: null, pid: e.pointerId };
  });
  const move = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.ghost = drag.b.cloneNode(true);
      drag.ghost.classList.add('is-ghost');
      drag.ghost.removeAttribute('aria-pressed');
      document.body.appendChild(drag.ghost);
      drag.b.classList.add('is-placeholder');
    }
    drag.ghost.style.left = `${e.clientX - 50}px`;
    drag.ghost.style.top = `${e.clientY - 50}px`;
    const r = bag.getBoundingClientRect();
    bag.classList.toggle('is-over', e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom);
  };
  window.addEventListener('pointermove', move);
  const finish = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (drag.ghost) {
      const r = bag.getBoundingClientRect();
      const over = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
      drag.ghost.remove();
      drag.b.classList.remove('is-placeholder');
      drag.b.dataset.dragged = '1';
      bag.classList.remove('is-over');
      toggle(drag.id, over);
    }
    drag = null;
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);

  el.querySelector('[data-reset]').addEventListener('click', () => { packed.clear(); render(); });
  el.querySelector('[data-check]').addEventListener('click', () => {
    const kg = total();
    const missing = ITEMS.filter((i) => i.role === 'essential' && !packed.has(i.id));
    const extra = ITEMS.filter((i) => i.role === 'leave' && packed.has(i.id));
    const recs = ITEMS.filter((i) => i.role === 'recommended' && !packed.has(i.id));
    let title, msg;
    if (!missing.length && !extra.length && kg <= LIMIT) {
      title = recs.length ? 'Good to go, nearly.' : 'Ready for the Bottleneck.';
      msg = recs.length ? `You have every essential. Think again about: ${recs.map((r) => r.name.toLowerCase()).join(', ')}.` : 'Every essential, nothing you will regret carrying, and under the limit.';
    } else {
      title = 'Not yet.';
      msg = [
        missing.length ? `Missing: ${missing.map((m) => m.name.toLowerCase()).join(', ')}.` : '',
        extra.length ? `Leave behind: ${extra.map((m) => m.name.toLowerCase()).join(', ')}.` : '',
        kg > LIMIT ? `You are ${(kg - LIMIT).toFixed(1)} kg over.` : '',
      ].filter(Boolean).join(' ');
    }
    verdict.innerHTML = `<div class="w-panel"><h3>${title}</h3><p>${msg}</p></div>`;
  });
  render();
  return () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
  };
}
