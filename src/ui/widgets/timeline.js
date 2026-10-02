// History timeline (Chapter 2): draggable horizontal track built from timeline.json.
// Selecting an event shows its story and, in 3D, flies the camera to where it happened.
import { getTimeline } from '../../core/data.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-').map(Number);
  if (!m) return String(y);
  const month = new Date(Date.UTC(2000, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return day ? `${day} ${month} ${y}` : `${month} ${y}`;
}

export async function mount(el, ctx) {
  const { events } = await getTimeline();
  let current = -1;
  el.innerHTML = `
  <div class="w">
    <p class="lede-sm">170 years of K2 in ${events.length} moments. Drag the strip or use the arrow keys${ctx.mode === 'webgl' ? '; events marked ◎ move the camera to where they happened' : ''}.</p>
    <div class="tl-track" role="listbox" aria-label="K2 timeline" tabindex="0">
      ${events.map((e, i) => `<button type="button" role="option" class="tl-item${e.hotspot ? ' has-place' : ''}" data-i="${i}" aria-pressed="false" aria-selected="false" tabindex="-1">
        <span class="tl-item__year">${esc(e.year)}</span><span class="tl-item__title">${esc(e.title)}</span></button>`).join('')}
    </div>
    <div class="tl-nav">
      <button type="button" class="btn btn--ghost" data-step="-1" aria-label="Previous event">←</button>
      <button type="button" class="btn btn--ghost" data-step="1" aria-label="Next event">→</button>
    </div>
    <div class="tl-detail w-panel" aria-live="polite"></div>
  </div>`;
  const track = el.querySelector('.tl-track');
  const items = [...el.querySelectorAll('.tl-item')];
  const detail = el.querySelector('.tl-detail');

  function select(i, { focus = false, scroll = true } = {}) {
    i = Math.max(0, Math.min(events.length - 1, i));
    current = i;
    const e = events[i];
    items.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(k === i));
      b.setAttribute('aria-selected', String(k === i));
      b.tabIndex = k === i ? 0 : -1;
    });
    if (scroll) items[i].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    if (focus) items[i].focus({ preventScroll: true });
    detail.innerHTML = `<p class="eyebrow">${esc(fmtDate(e.date) || e.year)}</p><h3>${esc(e.title)}</h3><p>${esc(e.body)}</p>
      ${e.source_url ? `<p class="w-note" style="margin-top:10px">Source: <a href="${esc(e.source_url)}" target="_blank" rel="noopener">${esc(e.source_title || e.source_url)}</a></p>` : ''}`;
    if (e.hotspot) ctx.flyToHotspot?.(e.hotspot, e.hotspot === 'summit' ? 2600 : 3600);
  }

  // drag to scroll (mouse / pen; touch uses native panning)
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    drag = { x: e.clientX, left: track.scrollLeft, moved: false, id: e.pointerId };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; track.classList.add('is-dragging'); track.setPointerCapture(drag.id); }
    if (drag.moved) track.scrollLeft = drag.left - dx;
  });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    track.classList.remove('is-dragging');
    if (moved) track.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { track.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  track.addEventListener('click', (e) => {
    const b = e.target.closest('.tl-item');
    if (b) select(Number(b.dataset.i), { focus: true });
  });
  track.addEventListener('keydown', (e) => {
    const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in map)) return;
    e.preventDefault();
    const d = map[e.key];
    select(d === -Infinity ? 0 : d === Infinity ? events.length - 1 : Math.max(current, 0) + d, { focus: true });
  });
  el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => select(Math.max(current, 0) + Number(b.dataset.step))));
  select(events.findIndex((e) => e.year === 1954) >= 0 ? events.findIndex((e) => e.year === 1954) : 0, { scroll: true });
  return () => ctx.releaseCamera?.();
}
