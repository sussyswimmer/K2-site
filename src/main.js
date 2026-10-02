// K2 — The Savage Mountain · entry point.
// Mode is chosen in index.html before first paint: WebGL story, reduced-motion static
// page (3D stills), or no-WebGL static page (Higgsfield photographs).
// Fraunces + Inter (Google Fonts, self-hosted via Fontsource — no third-party requests)
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/inter';
import './styles/main.css';
import './styles/widgets.css';
import { detectCaps } from './core/caps.js';
import { initUnits, render as renderUnits } from './core/units.js';
import { getFacts, getJSON, asset } from './core/data.js';
import { initSound } from './ui/audio.js';
import { createSidePanel, createDrawer, factHTML } from './ui/panels.js';
import { WIDGETS, mountWidget, STATIC_CTX } from './ui/widgets/index.js';

const caps = detectCaps();
initUnits();
initSound(document.getElementById('sound-toggle'));
const sidepanel = createSidePanel();
const ready = caps.webgl ? startWebGL() : startStatic();
window.__k2 = { caps, ready, api: null };
fillSources();
lazyMount(document.querySelector('[data-mount="quiz"]'), 'quiz', () => window.__k2.api || STATIC_CTX);

// Past the story track the fixed chapter cards step aside for the quiz / sources.
new IntersectionObserver(([e]) => document.documentElement.classList.toggle('past-story', e.isIntersecting || e.boundingClientRect.top < 0), { threshold: 0 })
  .observe(document.getElementById('quiz'));

function lazyMount(el, name, getCtx) {
  if (!el) return;
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    try { await mountWidget(name, el, getCtx()); renderUnits(el); } catch (err) { console.warn(name, err); }
  }, { rootMargin: '600px 0px' });
  io.observe(el);
}

// ---------------- static page ----------------
async function startStatic() {
  const key = caps.mode === 'reduced' ? 'still' : 'photo';
  document.querySelectorAll('.chapter').forEach((ch, i) => {
    const src = ch.dataset[key] || ch.dataset.photo;
    const media = ch.querySelector('.chapter__media');
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.loading = i === 0 ? 'eager' : 'lazy';
    if (i === 0) img.fetchPriority = 'high';
    img.sizes = '100vw';
    img.srcset = `${asset(`${src.slice(1)}_1280.webp`)} 1280w, ${asset(`${src.slice(1)}.webp`)} 2560w`;
    img.src = asset(`${src.slice(1)}_1280.webp`);
    img.className = 'chapter__img';
    media.appendChild(img);
  });
  document.querySelectorAll('.widget-inline[data-mount]').forEach((el) => {
    if (el.dataset.mount !== 'quiz') lazyMount(el, el.dataset.mount, () => STATIC_CTX);
  });
  // Field notes (hotspot facts) inline under each chapter, since there are no 3D labels.
  const facts = await getFacts().catch(() => []);
  document.querySelectorAll('.chapter').forEach((ch) => {
    const notes = facts.filter((f) => f.chapter === Number(ch.dataset.chapter) && f.hotspot);
    if (!notes.length) return;
    const box = document.createElement('details');
    box.className = 'field-notes';
    box.innerHTML = `<summary>Field notes · ${notes.length} notes</summary>`;
    box.insertAdjacentHTML('beforeend', notes.map(factHTML).join(''));
    renderUnits(box);
    ch.querySelector('.card').appendChild(box);
  });
  return null;
}

// ---------------- WebGL story ----------------
// Assets download straight away (the loader counts up the metres as bytes arrive), but
// the CPU-heavy part — decoding, texture upload, shader compilation — waits for the first
// sign of intent (scroll, key, tap). Until then the intro video covers the screen anyway.
async function prefetch(urls, onProgress) {
  let done = 0;
  const sizes = new Map();
  const got = new Map();
  const report = () => {
    const total = [...sizes.values()].reduce((a, b) => a + b, 0) || 1;
    const have = [...got.values()].reduce((a, b) => a + b, 0);
    onProgress(Math.min(have / total, done / urls.length + 0.001));
  };
  await Promise.all(urls.map(async (u) => {
    try {
      const r = await fetch(asset(u));
      sizes.set(u, Number(r.headers.get('content-length')) || 1);
      const reader = r.body?.getReader();
      if (reader) for (;;) { const { done: d, value } = await reader.read(); if (d) break; got.set(u, (got.get(u) || 0) + value.length); report(); }
    } catch { /* the real load will retry and surface errors */ }
    done++;
    report();
  }));
}

async function startWebGL() {
  const loader = document.getElementById('loader');
  const count = document.getElementById('loader-count');
  const bar = document.getElementById('loader-bar');
  const note = document.getElementById('loader-note');
  let shown = 0;
  let target = 0;
  const nf = new Intl.NumberFormat('en-US');
  const step = () => {
    shown += (target - shown) * 0.12;
    if (target - shown < 0.002) shown = target;
    count.textContent = nf.format(Math.round(shown * 8611));
    bar.style.width = `${(shown * 100).toFixed(1)}%`;
    if (shown < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // On phones the cards sit over the lower half of the scene: let readers fold them away.
  document.querySelectorAll('.story .card').forEach((card) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card__toggle';
    b.setAttribute('aria-expanded', 'true');
    b.setAttribute('aria-label', 'Collapse text');
    b.innerHTML = '<span aria-hidden="true"></span>';
    b.addEventListener('click', () => {
      const collapsed = document.documentElement.classList.toggle('cards-collapsed');
      document.querySelectorAll('.card__toggle').forEach((t) => {
        t.setAttribute('aria-expanded', String(!collapsed));
        t.setAttribute('aria-label', collapsed ? 'Expand text' : 'Collapse text');
      });
    });
    card.prepend(b);
  });
  const chapters = [...document.querySelectorAll('.chapter')];
  const nav = [...document.querySelectorAll('.hud__chapters a')];
  chapters[0].classList.add('is-active');
  nav[0].setAttribute('aria-current', 'step');

  const drawer = createDrawer({
    onOpen: () => window.__k2.api?.story.lenis.stop(),
    onClose: () => {
      const api = window.__k2.api;
      api?.focusRoute(null);
      api?.setWeather(null);
      api?.releaseCamera();
      api?.story.lenis.start();
    },
  });
  document.querySelectorAll('[data-widget]').forEach((b) => b.addEventListener('click', () => {
    const name = b.dataset.widget;
    drawer.open(name, WIDGETS[name].label, async (el) => {
      const cleanup = await mountWidget(name, el, window.__k2.api || STATIC_CTX);
      renderUnits(el);
      return cleanup;
    });
  }));

  // 1 · download (terrain choice mirrors the low-end rule in world.js)
  const terrainFile = caps.lowEnd ? 'models/k2_terrain_lo.glb' : 'models/k2_terrain.glb';
  const PREFETCH = ['models/heightmap_256.bin', 'models/k2_core_albedo.webp', 'models/route_abruzzi.glb', 'models/route_cesen.glb',
    'models/plinth.glb', 'models/section_slab.glb', 'models/prop_tent.glb', 'models/prop_flag.glb'];
  // let the poster (the largest paint) and fonts land first, then pull the 3D assets
  await new Promise((r) => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
  const worldModule = import('./scene/world.js');
  await prefetch([terrainFile, ...PREFETCH], (f) => { target = Math.max(target, f * 0.92); });
  target = 1;
  note.textContent = 'Ready';
  loader.classList.add('is-done');
  const video = document.getElementById('intro-video');
  video.preload = 'auto';
  video.play().catch(() => {});

  // 2 · build the scene on the first sign of intent
  let pending = null;
  const intent = new Promise((resolve) => {
    const go = (e) => {
      const jump = e?.target?.closest?.('[data-jump]');
      if (jump) { e.preventDefault(); pending = { jump: Number(jump.dataset.jump) }; }
      if (e?.target?.closest?.('[data-action="explore"], #explore-toggle')) { e.preventDefault(); e.stopImmediatePropagation(); pending = { explore: true }; }
      ['wheel', 'touchstart', 'keydown', 'pointerdown', 'scroll'].forEach((t) => window.removeEventListener(t, go, true));
      resolve();
    };
    ['wheel', 'touchstart', 'keydown', 'pointerdown', 'scroll'].forEach((t) => window.addEventListener(t, go, { capture: true, passive: t !== 'pointerdown' && t !== 'keydown' }));
    if (new URLSearchParams(location.search).has('autostart') || window.scrollY > 0) resolve();
  });
  window.__k2.start = () => intent; // tests can await this after dispatching a key/scroll
  await intent;
  document.documentElement.classList.add('is-building');

  try {
    const { startWorld } = await worldModule;
    const api = await startWorld({
      caps,
      sidepanel,
      onProgress: () => {},
      onChapter: (i) => {
        chapters.forEach((c, k) => c.classList.toggle('is-active', k === i));
        nav.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
      },
    });
    window.__k2.api = api;
    document.documentElement.classList.remove('is-building');
    if (pending?.jump !== undefined) api.story.jumpTo(pending.jump);
    if (pending?.explore) document.getElementById('explore-toggle').click();
    return api;
  } catch (err) {
    console.error('3D failed, falling back to the static page', err);
    document.documentElement.classList.replace('mode-webgl', 'mode-static');
    document.documentElement.classList.add('mode-nowebgl');
    loader.classList.add('is-done');
    caps.mode = 'nowebgl';
    caps.webgl = false;
    return startStatic();
  }
}

// Every source cited anywhere on the page: facts, timeline, routes, comparison, weather and
// the notes inside the widgets. Deduplicated by URL, sorted by title.
const WIDGET_SOURCES = [
  { title: 'Szymczak et al., Comparison of Environmental Conditions on Summits of Mount Everest and K2 (IJERPH, 2021)', url: 'https://www.mdpi.com/1660-4601/18/6/3040', checked: '2026-10-02' },
  { title: 'K2 expedition itinerary (Seven Summit Treks; operator)', url: 'https://sevensummittreks.com/page/mt-k2-expedition-8611m.html', checked: '2026-10-02' },
  { title: 'A. Arnette, K2 2021 Summer Season Coverage Begins (alanarnette.com)', url: 'https://www.alanarnette.com/blog/2021/06/26/k2-2021-summer-season-coverage-begins/', checked: '2026-10-02' },
];

async function fillSources() {
  const list = document.getElementById('sources-list');
  const opt = (p) => getJSON(p).catch(() => null);
  const [facts, timeline, routes, compare, weather] = await Promise.all([
    opt('data/facts.json'), opt('data/timeline.json'), opt('data/routes.json'), opt('data/everest_vs_k2.json'), opt('data/weather.json'),
  ]);
  const seen = new Map();
  const add = (url, title, checked) => {
    if (!url) return;
    const prev = seen.get(url);
    if (!prev) seen.set(url, { url, title: title || url, checked });
    else if (checked && !prev.checked) prev.checked = checked;
  };
  const withAlt = (x) => {
    add(x.source_url, x.source_title, x.verified_on);
    (x.alt_sources || []).forEach((a) => add(a.url, a.title, x.verified_on));
  };
  (facts || []).forEach(withAlt);
  (timeline?.events || []).forEach(withAlt);
  (routes?.routes || []).forEach(withAlt);
  (routes?.other_routes || []).forEach(withAlt);
  (compare?.rows || []).forEach((r) => {
    add(r.everest_source_url, r.everest_source_title, compare.as_of);
    add(r.k2_source_url, r.k2_source_title, compare.as_of);
    add(r.source_url, r.source_title, compare.as_of);
  });
  (compare?.profiles_sources || []).forEach((a) => add(a.url, a.title, compare.as_of));
  (weather?.sources || []).forEach((a) => add(a.url, a.title, weather.verified_on || weather.as_of));
  WIDGET_SOURCES.forEach((a) => add(a.url, a.title, a.checked));
  const items = [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
  list.innerHTML = items.map((f) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = f.url;
    a.rel = 'noopener';
    a.target = '_blank';
    a.textContent = f.title;
    li.appendChild(a);
    if (f.checked) li.append(` · checked ${f.checked}`);
    return li.outerHTML;
  }).join('');
}
