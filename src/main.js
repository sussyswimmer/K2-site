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
import { getFacts, asset } from './core/data.js';
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
    box.innerHTML = `<summary>Field notes · ${notes.length} places</summary>`;
    box.insertAdjacentHTML('beforeend', notes.map(factHTML).join(''));
    renderUnits(box);
    ch.querySelector('.card').appendChild(box);
  });
  return null;
}

// ---------------- WebGL story ----------------
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
    drawer.open(name, WIDGETS[name].label, (el) => mountWidget(name, el, window.__k2.api || STATIC_CTX));
  }));

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
  const nav = [...document.querySelectorAll('.hud__chapters a')];
  const chapters = [...document.querySelectorAll('.chapter')];
  try {
    const { startWorld } = await import('./scene/world.js');
    const api = await startWorld({
      caps,
      sidepanel,
      onProgress: (f) => {
        target = Math.max(target, Math.min(f, 1));
        note.textContent = f < 1 ? 'Loading terrain, routes and textures…' : 'Compiling shaders…';
      },
      onChapter: (i) => {
        chapters.forEach((c, k) => c.classList.toggle('is-active', k === i));
        nav.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
      },
    });
    window.__k2.api = api;
    target = 1;
    loader.classList.add('is-done');
    const video = document.getElementById('intro-video');
    video.preload = 'auto';
    video.play().catch(() => {});
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

async function fillSources() {
  const list = document.getElementById('sources-list');
  const facts = await getFacts().catch(() => []);
  const seen = new Map();
  for (const f of facts) {
    if (!f.source_url || seen.has(f.source_url)) continue;
    seen.set(f.source_url, f);
  }
  list.innerHTML = [...seen.values()].map((f) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = f.source_url;
    a.rel = 'noopener';
    a.target = '_blank';
    a.textContent = f.source_title || f.source_url;
    li.appendChild(a);
    if (f.verified_on) li.append(` · checked ${f.verified_on}`);
    return li.outerHTML;
  }).join('');
}
