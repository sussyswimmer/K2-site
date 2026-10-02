// Route Explorer (Chapter 3): Abruzzi vs Cesen. In 3D the selected route glows, its camps
// pop in one by one and the camera flies to a view of the route.
import { getRoutes } from '../../core/data.js';
import { fmtAlt, onUnits } from '../../core/units.js';

// Camera targets (three.js frame: x east, y elevation, z south)
const VIEWS = {
  abruzzi: { pos: [4700, 7300, 3600], look: [1300, 6900, 800] },
  cesen: { pos: [-3600, 7600, 5600], look: [400, 6900, 1500] },
};
const COLORS = { abruzzi: 'var(--amber)', cesen: 'var(--cyan)' };

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function profileSVG(routes, active) {
  const W = 520, H = 230, padL = 46, padR = 12, padT = 14, padB = 26;
  const min = 4800, max = 8700;
  const y = (m) => padT + (1 - (m - min) / (max - min)) * (H - padT - padB);
  const grid = [5000, 6000, 7000, 8000].map((m) => `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(m)}" y2="${y(m)}"/><text class="axis-label" x="${padL - 6}" y="${y(m) + 3}" text-anchor="end">${esc(fmtAlt(m))}</text>`).join('');
  const lines = routes.map((r) => {
    const n = r.camps.length;
    const x = (i) => padL + 8 + (i / (n - 1)) * (W - padL - padR - 16);
    const pts = r.camps.map((c, i) => `${x(i).toFixed(1)},${y(c.elevation_m).toFixed(1)}`).join(' ');
    const on = r.id === active;
    const dots = on ? r.camps.map((c, i) => `<circle class="camp" cx="${x(i)}" cy="${y(c.elevation_m)}" r="5" fill="${COLORS[r.id]}"/>
      <text class="camp-label" x="${x(i)}" y="${y(c.elevation_m) - 10}" text-anchor="${i === n - 1 ? 'end' : 'middle'}">${esc(c.short || c.name)}</text>`).join('') : '';
    return `<polyline class="line" points="${pts}" stroke="${COLORS[r.id]}" opacity="${on ? 1 : 0.28}"/>${dots}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile of the camps on the ${esc(active)} route">${grid}${lines}</svg>`;
}

export async function mount(el, ctx) {
  const data = await getRoutes();
  const routes = data.routes.filter((r) => r.id === 'abruzzi' || r.id === 'cesen');
  routes.forEach((r) => r.camps.forEach((c) => { c.short = c.name.replace(/\s*\(.*\)$/, '').replace('Advanced Base Camp', 'ABC').replace('Base Camp', 'BC').replace('Camp ', 'C').replace('The Bottleneck', 'Bottleneck'); }));
  let active = 'abruzzi';
  el.innerHTML = `
  <div class="w">
    <div class="w-seg" role="radiogroup" aria-label="Route">
      ${routes.map((r) => `<button type="button" role="radio" data-route="${r.id}" aria-checked="${r.id === active}">${esc(r.name.split(' (')[0])}</button>`).join('')}
    </div>
    <div class="route-detail" aria-live="polite"></div>
    ${data.other_routes?.length ? `<details><summary class="w-note">Other routes on K2</summary>
      <ul class="w-note">${data.other_routes.map((o) => `<li><strong>${esc(o.name)}</strong>${o.first_climbed ? ` (first climbed ${esc(o.first_climbed)})` : ''}: ${esc(o.notes)}${o.source_url ? ` <a href="${esc(o.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('')}</ul></details>` : ''}
  </div>`;
  const detail = el.querySelector('.route-detail');

  function render() {
    const r = routes.find((x) => x.id === active);
    el.querySelectorAll('[data-route]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.route === active)));
    detail.innerHTML = `
      <div class="w-grid2">
        <div class="w-panel">
          <h3>${esc(r.name)}</h3>
          <p><strong>First climbed:</strong> ${esc(r.first_climbed_label || r.first_climbed || r.year)}${r.team ? ` · ${esc(r.team)}` : ''}</p>
          <p style="margin-top:8px">${esc(r.difficulty_notes)}</p>
          ${r.share_of_ascents ? `<p class="w-note" style="margin-top:8px">${esc(r.share_of_ascents)}</p>` : ''}
          ${r.source_url ? `<p class="w-note" style="margin-top:8px">Source: <a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(r.source_title || 'link')}</a></p>` : ''}
        </div>
        <div class="w-panel">
          <ol class="route-camps" aria-label="Camps">
            ${r.camps.map((c, i) => `<li style="animation-delay:${i * 90}ms"><span>${esc(c.name)}</span><span>${esc(fmtAlt(c.elevation_m))}${c.approx ? ' · approx.' : ''}</span></li>`).join('')}
          </ol>
        </div>
      </div>
      <div class="route-profile w-panel">${profileSVG(routes, active)}</div>`;
    ctx.focusRoute?.(active);
    const v = VIEWS[active];
    ctx.flyTo?.(v.pos, v.look);
  }
  el.querySelector('[role="radiogroup"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-route]');
    if (!b || b.dataset.route === active) return;
    active = b.dataset.route;
    render();
  });
  el.querySelector('[role="radiogroup"]').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const i = routes.findIndex((r) => r.id === active);
    active = routes[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : routes.length - 1)) % routes.length].id;
    render();
    el.querySelector(`[data-route="${active}"]`).focus();
  });
  const off = onUnits(render);
  render();
  return () => { off(); ctx.focusRoute?.(null); };
}
